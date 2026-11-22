import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ServerClock } from './lib/clock';
import { setMediaHandlers, setMediaMetadata } from './lib/media-session';
import { nowPlaying, pickFiller } from './lib/now-playing';
import { createPlayer, SKIP_ERROR_CODES } from './lib/player';
import { dialOrder, selectStation, stepStation as nextOnDial } from './lib/stations';
import { playTuningStatic, stopTuningStatic } from './lib/tuning-static';
import { LANGS, MOODS } from './lib/types';
import type {
  CatalogMinItem,
  LangCode,
  Mode,
  Mood,
  NowPlaying,
  PublicStationInfo,
  ScheduleFile,
} from './lib/types';

const BASE = import.meta.env.BASE_URL;
export const dataUrl = (f: string) => `${BASE}data/${f}`;

export interface RadioData {
  info: PublicStationInfo;
  schedule: ScheduleFile;
  catalog: Map<string, CatalogMinItem>;
}

export type Status =
  'loading' | 'off' | 'warming' | 'tuning' | 'playing' | 'ad' | 'empty' | 'error';

export interface Track {
  np: NowPlaying;
  playingId: string; // may differ from np.id when a filler is playing
  item?: CatalogMinItem;
  nextItem?: CatalogMinItem;
}

async function getJson<T>(f: string): Promise<T> {
  const res = await fetch(dataUrl(f), { cache: 'no-store' });
  if (!res.ok) throw new Error(`${f}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

export async function loadRadioData(): Promise<RadioData> {
  const [info, schedule, catalog] = await Promise.all([
    getJson<PublicStationInfo>('station.json'),
    getJson<ScheduleFile>('schedule.json'),
    getJson<CatalogMinItem[]>('catalog.min.json'),
  ]);
  return { info, schedule, catalog: new Map(catalog.map((c) => [c.id, c])) };
}

const LS_SEL = 'amma-radio:selection';

export interface Selection {
  mode: Mode;
  lang: LangCode;
  mood: Mood | 'all';
}

function loadSelection(): Selection {
  try {
    const v = JSON.parse(localStorage.getItem(LS_SEL) ?? '{}') as Partial<Selection>;
    return {
      mode: v.mode === 'stories' ? 'stories' : 'songs',
      lang: LANGS.includes(v.lang as LangCode) ? (v.lang as LangCode) : 'te',
      mood: MOODS.includes(v.mood as Mood) ? (v.mood as Mood) : 'all',
    };
  } catch {
    return { mode: 'songs', lang: 'te', mood: 'all' };
  }
}

/** A station with no slots and no fallback order has nothing to play yet ("Coming soon"). */
export function stationIsEmpty(
  schedule: ScheduleFile | undefined,
  id: string | undefined,
): boolean {
  if (!schedule || !id) return true;
  return !schedule.stations[id]?.slots.length && !schedule.fallbackOrder[id]?.length;
}
const LS_VOLUME = 'amma-radio:volume';

let lastStaticAt = 0;
/** Tuning static (WebAudio); follows volume, silent when off; at most one burst per 700 ms. */
function playStatic(volume: number, powered: boolean) {
  const t = Date.now();
  if (t - lastStaticAt < 700) return;
  if (playTuningStatic(volume, powered)) lastStaticAt = t;
}

/** Wait until at least half of `el` is in the viewport (YouTube RMF rule). */
function whenHalfVisible(el: HTMLElement): Promise<void> {
  return new Promise((resolve) => {
    if (typeof IntersectionObserver === 'undefined') return resolve();
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.intersectionRatio >= 0.5)) {
          io.disconnect();
          resolve();
        }
      },
      { threshold: [0, 0.5, 1] },
    );
    io.observe(el);
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}

export function useRadio(
  windowRef: React.RefObject<HTMLDivElement>,
  playerHostRef: React.RefObject<HTMLDivElement>,
) {
  const [data, setData] = useState<RadioData>();
  const [status, setStatus] = useState<Status>('loading');
  const [powered, setPowered] = useState(false);
  const [sel, setSel] = useState<Selection>(loadSelection);
  const [volume, setVolumeState] = useState(() => Number(localStorage.getItem(LS_VOLUME) ?? 70));
  const [track, setTrack] = useState<Track>();
  const [tick, setTick] = useState(0);

  const clock = useMemo(() => new ServerClock(dataUrl('time.json')), []);
  const playerRef = useRef<YT.Player | undefined>(undefined);
  const readyRef = useRef(false);
  const badIds = useRef(new Set<string>());
  const current = useRef<
    { key: string; id: string; filler?: { id: string; dur: number } } | undefined
  >(undefined);
  const poweredRef = useRef(false);
  const volumeRef = useRef(volume);
  const fadeRef = useRef(1);
  const adRef = useRef(false);

  const stations = useMemo(() => data?.info.stations ?? [], [data]);
  const station = useMemo(
    () => selectStation(stations, sel.mode, sel.lang, sel.mood),
    [stations, sel],
  );
  const empty = stationIsEmpty(data?.schedule, station?.id);
  const langs = useMemo(() => {
    const present = new Set(stations.map((s) => s.lang).filter(Boolean));
    return LANGS.filter((l) => present.has(l));
  }, [stations]);

  // ---- load data + clock
  useEffect(() => {
    let alive = true;
    loadRadioData()
      .then((d) => {
        if (!alive) return;
        setData(d);
        setStatus(d.info.stations.length ? 'off' : 'empty');
      })
      .catch(() => alive && setStatus('error'));
    void clock.calibrate();
    // After each recalibration the drift loop re-seeks automatically if we're > 2 s off.
    const stop = clock.startAutoRecalibrate();
    // Pick up a refreshed schedule every 15 minutes (the hourly job may have extended it).
    const iv = window.setInterval(() => {
      loadRadioData()
        .then((d) => alive && setData(d))
        .catch(() => {});
    }, 15 * 60_000);
    return () => {
      alive = false;
      stop();
      window.clearInterval(iv);
    };
  }, [clock]);

  const durationOf = useCallback((id: string) => data?.catalog.get(id)?.durationSec, [data]);

  const applyVolume = useCallback(() => {
    const p = playerRef.current;
    if (!p || !readyRef.current) return;
    const v = Math.round(volumeRef.current * fadeRef.current);
    if (v <= 0) p.mute();
    else {
      p.unMute();
      p.setVolume(v);
    }
  }, []);

  // ---- create the (idle) player once the window is mounted (once per page; StrictMode-safe)
  const creatingRef = useRef(false);
  useEffect(() => {
    const host = playerHostRef.current;
    if (!host || creatingRef.current) return;
    creatingRef.current = true;
    // YouTube replaces the target element with its iframe, so give it a child React doesn't own.
    const target = document.createElement('div');
    host.appendChild(target);
    createPlayer(target, {
      onReady: () => {
        readyRef.current = true;
        applyVolume();
        setTick((t) => t + 1);
      },
      onStateChange: () => setTick((t) => t + 1),
      onError: (code) => {
        if (!SKIP_ERROR_CODES.has(code) || !current.current) return;
        badIds.current.add(current.current.id);
        current.current = { ...current.current, key: '' }; // reload → shared filler
        setStatus('tuning');
      },
    })
      .then((p) => {
        playerRef.current = p;
      })
      .catch(() => setStatus('error'));
  }, [playerHostRef, applyVolume]);

  // ---- the sync loop
  useEffect(() => {
    if (!powered || !data || !station) return;
    const fallback = data.schedule.fallbackOrder[station.id] ?? [];
    const loop = () => {
      const p = playerRef.current;
      if (!p || !readyRef.current || !poweredRef.current) return;
      const t = clock.now();
      const np = nowPlaying(data.schedule, station.id, t, durationOf);
      if (!np) {
        // Empty station ("Coming soon"): silence the set but stay powered.
        if (current.current) {
          current.current = undefined;
          try {
            p.stopVideo();
          } catch {
            /* ignore */
          }
        }
        setTrack(undefined);
        setMediaMetadata(undefined);
        setStatus('empty');
        return;
      }
      const key = `${station.id}:${np.slotStart}:${np.id}`;
      const cur = current.current;
      if (!cur || cur.key !== key) {
        // New slot (or forced resync): pick the song or, if it is known-bad, the shared filler.
        let id = np.id;
        let start = np.offsetSec;
        let filler: { id: string; dur: number } | undefined;
        if (badIds.current.has(np.id)) {
          const f = pickFiller(fallback, np.slotStart, t, durationOf, badIds.current);
          if (f) {
            id = f.id;
            start = f.startSeconds;
            filler = { id: f.id, dur: durationOf(f.id) ?? 0 };
          }
        }
        p.loadVideoById({ videoId: id, startSeconds: Math.max(0, start) });
        if (cur?.key) playStatic(volumeRef.current, poweredRef.current);
        current.current = { key, id, filler };
        adRef.current = false;
        const item = data.catalog.get(id);
        setTrack({
          np,
          playingId: id,
          item,
          nextItem: np.next ? data.catalog.get(np.next.id) : undefined,
        });
        setMediaMetadata(
          item
            ? {
                title: item.title,
                artist:
                  data.info.channels.find((c) => c.id === item.channelId)?.label.en ??
                  data.info.artistName,
                album: data.info.stationName.en,
                videoId: id,
              }
            : undefined,
        );
        setStatus(filler ? 'tuning' : 'playing');
        return;
      }
      // Same slot: drift + ad detection.
      const state = p.getPlayerState();
      if (state === 2 || state === 5 || state === -1) p.playVideo();
      if (state !== 1) return;
      const expected = cur.filler ? ((t - np.slotStart) / 1000) % cur.filler.dur : np.offsetSec;
      const expectedDur = cur.filler ? cur.filler.dur : np.dur;
      const playerDur = p.getDuration();
      const isAd = playerDur > 0 && Math.abs(playerDur - expectedDur) > 3;
      if (isAd !== adRef.current) {
        adRef.current = isAd;
        setStatus(isAd ? 'ad' : cur.filler ? 'tuning' : 'playing');
        if (!isAd) p.seekTo(expected, true); // re-sync after the ad
        return;
      }
      if (isAd) return;
      if (expected < playerDur - 1 && Math.abs(p.getCurrentTime() - expected) > 2)
        p.seekTo(expected, true);
      if (cur.filler) setStatus('playing');
    };
    loop();
    const iv = window.setInterval(loop, 500);
    return () => window.clearInterval(iv);
  }, [powered, data, station, clock, durationOf, tick]);

  // ---- controls
  const powerOn = useCallback(async () => {
    if (poweredRef.current) return;
    poweredRef.current = true;
    setStatus('warming');
    playStatic(volumeRef.current, true);
    if (windowRef.current) await whenHalfVisible(windowRef.current);
    fadeRef.current = 0;
    current.current = undefined;
    setPowered(true);
    const t0 = performance.now();
    const fade = () => {
      fadeRef.current = Math.min(1, (performance.now() - t0) / 1500);
      applyVolume();
      if (fadeRef.current < 1 && poweredRef.current) requestAnimationFrame(fade);
    };
    requestAnimationFrame(fade);
  }, [windowRef, applyVolume]);

  const powerOff = useCallback(() => {
    poweredRef.current = false;
    stopTuningStatic();
    setPowered(false);
    current.current = undefined;
    setTrack(undefined);
    setStatus('off');
    setMediaMetadata(undefined);
    try {
      playerRef.current?.stopVideo();
    } catch {
      /* not ready */
    }
  }, []);

  /** Bumped on every station change: drives the dial's needle sweep / static flicker. */
  const [tuneFx, setTuneFx] = useState(0);

  const select = useCallback((patch: Partial<Selection>) => {
    setSel((prev) => {
      const next = { ...prev, ...patch };
      if (next.mode === 'songs') next.mood = 'all';
      localStorage.setItem(LS_SEL, JSON.stringify(next));
      return next;
    });
    setTuneFx((x) => x + 1);
    playStatic(volumeRef.current, poweredRef.current);
    if (poweredRef.current) setStatus('tuning');
  }, []);

  /** Every mode × language station, in dial (frequency) order. */
  const dial = useMemo(() => dialOrder(stations), [stations]);

  /** Tune straight to a station (dial marker click, TUNING knob). */
  const tuneTo = useCallback(
    (id: string) => {
      const st = stations.find((s) => s.id === id);
      if (!st?.mode || !st.lang) return;
      select({ mode: st.mode, lang: st.lang, mood: st.mood ?? 'all' });
    },
    [stations, select],
  );

  /** ◀ ▶ buttons, arrow keys, media keys: next/previous station across both bands. */
  const stepStation = useCallback(
    (delta: number) => {
      const curMain = dial.find((s) => s.mode === sel.mode && s.lang === sel.lang);
      const target = nextOnDial(dial, curMain?.id, delta, (id) =>
        stationIsEmpty(data?.schedule, id),
      );
      if (target) tuneTo(target.id);
    },
    [dial, sel.mode, sel.lang, data, tuneTo],
  );

  /** LANGUAGE stepping within the current mode (kept for the language push-buttons' order). */
  const stepLanguage = useCallback(
    (delta: number) => {
      if (!langs.length) return;
      const i = Math.max(0, langs.indexOf(sel.lang));
      const n = (((i + delta) % langs.length) + langs.length) % langs.length;
      select({ lang: langs[n] as LangCode });
    },
    [langs, sel.lang, select],
  );

  const setVolume = useCallback(
    (v: number) => {
      volumeRef.current = v;
      setVolumeState(v);
      localStorage.setItem(LS_VOLUME, String(v));
      applyVolume();
    },
    [applyVolume],
  );

  useEffect(() => {
    setMediaHandlers({
      play: () => void powerOn(),
      pause: powerOff,
      next: () => stepStation(1),
      prev: () => stepStation(-1),
    });
  }, [powerOn, powerOff, stepStation]);

  return {
    data,
    status,
    powered,
    stations,
    station,
    sel,
    langs,
    empty,
    volume,
    track,
    clock,
    powerOn,
    powerOff,
    select,
    stepLanguage,
    dial,
    tuneTo,
    stepStation,
    tuneFx,
    setVolume,
  };
}
