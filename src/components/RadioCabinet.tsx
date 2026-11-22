import { useEffect, useRef, useState } from 'react';
import { formatClock } from '../lib/duration';
import { t as tr, type I18nKey, type Lang } from '../lib/i18n';
import { useRadio } from '../useRadio';
import { AboutDialog, channelUrl } from './AboutDialog';
import { Knob } from './Knob';
import { Marquee } from './Marquee';
import { OnAirLamp } from './OnAirLamp';
import { PictureWindow } from './PictureWindow';
import { PowerSwitch } from './PowerSwitch';
import { TuningDial, type Band } from './TuningDial';
import { VuMeter } from './VuMeter';
import { ModeSwitch } from './ModeSwitch';
import { PushButtonRow } from './PushButtonRow';
import { LANG_NATIVE, MOOD_LABEL, mainStationOf, selectStation } from '../lib/stations';
import { stationIsEmpty } from '../useRadio';
import { MOODS, type LangCode, type Mood } from '../lib/types';

const LS_LANG = 'amma-radio:lang';

function usePrefersReducedMotion() {
  const [r, setR] = useState(
    () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  );
  useEffect(() => {
    const m = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const on = () => setR(m.matches);
    m?.addEventListener('change', on);
    return () => m?.removeEventListener('change', on);
  }, []);
  return r;
}

function isNightInIndia(d = new Date()) {
  const h = Number(
    new Intl.DateTimeFormat('en-GB', {
      hour: 'numeric',
      hourCycle: 'h23',
      timeZone: 'Asia/Kolkata',
    }).format(d),
  );
  return h >= 19 || h < 6;
}

export function RadioCabinet() {
  const [lang, setLang] = useState<Lang>(() =>
    localStorage.getItem(LS_LANG) === 'en' ? 'en' : 'te',
  );
  const [tv, setTv] = useState(false);
  const [about, setAbout] = useState(false);
  const [night, setNight] = useState(isNightInIndia);
  const reducedMotion = usePrefersReducedMotion();
  const windowRef = useRef<HTMLDivElement>(null);
  const playerHostRef = useRef<HTMLDivElement>(null);
  const r = useRadio(windowRef, playerHostRef);
  const L = (k: I18nKey) => tr(lang, k);

  useEffect(() => {
    document.documentElement.lang = lang;
    localStorage.setItem(LS_LANG, lang);
  }, [lang]);
  useEffect(() => {
    const iv = window.setInterval(() => setNight(isNightInIndia()), 60_000);
    return () => window.clearInterval(iv);
  }, []);

  // countdown
  const [, force] = useState(0);
  useEffect(() => {
    if (!r.powered) return;
    const iv = window.setInterval(() => force((x) => x + 1), 1000);
    return () => window.clearInterval(iv);
  }, [r.powered]);

  const info = r.data?.info;
  const name = info?.stationName ?? { te: '', en: '' };
  const freq = Number(r.station?.freq ?? 88);
  const track = r.track;
  const channel = track?.item
    ? info?.channels.find((c) => c.id === track.item?.channelId)
    : undefined;
  const title = track?.item?.title ?? '';
  const nextTitle = track?.nextItem?.title ?? '';
  // es/fr Stories borrow the English stories channel until they have their own videos.
  const borrowed = !!(
    track?.item?.lang &&
    r.station?.lang &&
    !r.station.mood &&
    track.item.lang !== r.station.lang
  );
  const left = track ? Math.max(0, (track.np.endsAt - r.clock.now()) / 1000) : 0;
  const playing =
    r.powered && (r.status === 'playing' || r.status === 'ad' || r.status === 'tuning');

  useEffect(() => {
    if (info) document.title = `${info.stationName.te} · ${info.stationName.en}`;
  }, [info]);

  const marquee = title
    ? `${tr('te', 'nowPlaying')} · ${tr('en', 'nowPlaying')}: ${title}${nextTitle ? `  ·  ${tr('te', 'next')} / ${tr('en', 'next')}: ${nextTitle}` : ''}`
    : `${name.te} · ${name.en} — ${info?.tagline[lang] ?? ''}`;

  const sched = r.data?.schedule;
  const mainStation = mainStationOf(r.stations, r.station);
  const dialIndex = Math.max(
    0,
    r.dial.findIndex((s) => s.id === mainStation?.id),
  );
  const isEmpty = (id: string) => stationIsEmpty(sched, id);
  const bands: Band[] = (['songs', 'stories'] as const).map((m) => {
    const fs = r.dial.filter((s) => s.mode === m).map((s) => Number(s.freq));
    return {
      id: m,
      from: fs.length ? Math.min(...fs) - 0.6 : 88,
      to: fs.length ? Math.max(...fs) + 0.6 : 88,
      te: tr('te', m),
      en: tr('en', m),
    };
  });
  const readout = {
    freq: r.station?.freq ?? '--.-',
    band: `${tr('te', r.sel.mode)} · ${tr('en', r.sel.mode)}`,
    name: r.station?.label[lang] ?? '',
    sub: r.station?.lang ? LANG_NATIVE[r.station.lang] : undefined,
  };

  // ← / → anywhere on the page change station (knobs/sliders keep their own arrows).
  const stepRef = useRef(r.stepStation);
  stepRef.current = r.stepStation;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const el = e.target as HTMLElement | null;
      if (el?.closest('input, textarea, select, [role="slider"], [contenteditable="true"], dialog'))
        return;
      e.preventDefault();
      stepRef.current(e.key === 'ArrowRight' ? 1 : -1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const langOptions = r.langs.map((l) => ({
    id: l,
    label: LANG_NATIVE[l],
    lang: l,
    empty: stationIsEmpty(sched, selectStation(r.stations, r.sel.mode, l)?.id),
  }));
  const moodOptions = (['all', ...MOODS] as const).map((m) => ({
    id: m,
    label: MOOD_LABEL[m].te,
    sub: MOOD_LABEL[m].en,
    lang: 'te',
    empty: stationIsEmpty(sched, selectStation(r.stations, 'stories', r.sel.lang, m)?.id),
  }));

  let statusLine = '';
  if (r.status === 'loading') statusLine = L('loading');
  else if (r.status === 'empty') statusLine = L('noSongs');
  else if (r.status === 'error') statusLine = L('noSongs');
  else if (r.status === 'warming') statusLine = L('loading');
  else if (r.status === 'tuning') statusLine = L('tuning');
  else if (r.status === 'ad') statusLine = `${tr('te', 'adBreak')} / ${tr('en', 'adBreak')}`;

  return (
    <div
      className={`room ${night ? 'room--night' : ''} ${reducedMotion ? 'reduced-motion' : ''} ${playing ? 'is-playing' : ''}`}
    >
      <main className="cabinet" aria-label={`${name.te} ${name.en}`}>
        <header className="cabinet__top">
          <div className="cabinet__rail">
            <PowerSwitch
              on={r.powered}
              labelTe={tr('te', 'power')}
              labelEn={tr('en', 'power')}
              ariaLabel={r.powered ? L('powerOffLabel') : L('powerOnLabel')}
              onToggle={() => (r.powered ? r.powerOff() : void r.powerOn())}
            />
            <OnAirLamp
              on={playing}
              text={playing ? `${tr('te', 'onAir')} · ${tr('en', 'onAir')}` : `${L('offAir')}`}
            />
          </div>
          <div className="nameplate">
            <h1>
              <span className="nameplate__te" lang="te">
                {name.te}
              </span>
              <span className="nameplate__en" lang="en">
                {name.en}
              </span>
            </h1>
          </div>
        </header>

        <div className="cabinet__face">
          <section className="cabinet__left">
            <ModeSwitch
              mode={r.sel.mode}
              onChange={(mode) => r.select({ mode })}
              groupLabel={L('mode')}
              labels={{
                songs: {
                  te: tr('te', 'songs'),
                  en: tr('en', 'songs'),
                  tagTe: tr('te', 'songsTagline'),
                  tagEn: tr('en', 'songsTagline'),
                },
                stories: {
                  te: tr('te', 'stories'),
                  en: tr('en', 'stories'),
                  tagTe: tr('te', 'storiesTagline'),
                  tagEn: tr('en', 'storiesTagline'),
                },
              }}
            />
            <TuningDial
              stations={r.dial}
              currentId={mainStation?.id}
              currentFreq={freq}
              powered={r.powered}
              lang={lang}
              bands={bands}
              readout={readout}
              tuneFx={r.tuneFx}
              isEmpty={isEmpty}
              onTune={r.tuneTo}
              onStep={r.stepStation}
              prevLabel={L('prevStation')}
              nextLabel={L('nextStation')}
            >
              {r.empty && r.status !== 'loading' ? (
                <div className="soon" data-testid="coming-soon" aria-live="polite">
                  <p className="soon__title">
                    <span lang="te">{tr('te', 'comingSoon')}</span> ·{' '}
                    <span lang="en">{tr('en', 'comingSoon')}</span>
                  </p>
                  <p className="soon__station">{r.station?.label[lang]}</p>
                  <p className="soon__body">{L('comingSoonBody')}</p>
                </div>
              ) : !r.powered ? (
                <button
                  type="button"
                  className="dial__hint"
                  onClick={() => void r.powerOn()}
                  disabled={!r.stations.length}
                >
                  <span lang="te">{tr('te', 'turnOn')}</span> ·{' '}
                  <span lang="en">{tr('en', 'turnOn')}</span>
                </button>
              ) : (
                <div className="nowcard" aria-live="polite" aria-atomic="true">
                  <p className="nowcard__label">{L('nowPlaying')}</p>
                  <p className="nowcard__title" data-testid="now-title">
                    {title || statusLine || '…'}
                  </p>
                  <p className="nowcard__meta">
                    {channel ? <span>{channel.label[lang]}</span> : null}
                    {track ? (
                      <span className="nowcard__time">
                        {formatClock(left)} {L('remaining')}
                      </span>
                    ) : null}
                  </p>
                </div>
              )}
            </TuningDial>
            <PushButtonRow
              options={langOptions}
              value={r.sel.lang}
              onChange={(id) => r.select({ lang: id as LangCode })}
              groupLabel={L('contentLanguage')}
              testId="lang-row"
            />
            {r.sel.mode === 'stories' ? (
              <PushButtonRow
                options={moodOptions}
                value={r.sel.mood}
                onChange={(id) => r.select({ mood: id as Mood | 'all' })}
                groupLabel={L('moodLabel')}
                small
                testId="mood-row"
              />
            ) : null}
            <Marquee text={marquee} />
            {statusLine && r.powered && r.status !== 'empty' ? (
              <p className="status" role="status">
                {statusLine}
              </p>
            ) : null}
            {!r.powered && r.status === 'error' ? (
              <p className="status" role="status">
                {statusLine}
              </p>
            ) : null}
            {r.powered && track?.np.fallback ? <p className="status">{L('fallbackMode')}</p> : null}
            {r.powered && borrowed ? (
              <p className="status" data-testid="borrowed-note">
                {L('fallbackStation')}
              </p>
            ) : null}

            <PictureWindow
              ref={windowRef}
              playerHostRef={playerHostRef}
              tv={tv}
              onToggleTv={() => setTv((x) => !x)}
              tvLabel={`📺 ${L('tv')}`}
              tvAria={tv ? L('tvOff') : L('tvOn')}
              title={L('pictureWindow')}
            />
          </section>

          <section className="cabinet__right">
            <div className="grille" aria-hidden="true">
              <div className="grille__cloth" />
              <div className="grille__slats" />
            </div>
            <VuMeter
              active={playing}
              volume={r.volume}
              seed={track?.np.slotStart ?? 1}
              reducedMotion={reducedMotion}
            />
            <div className="controls">
              <Knob
                labelTe={tr('te', 'volume')}
                labelEn={tr('en', 'volume')}
                ariaLabel={L('volume')}
                value={r.volume}
                min={0}
                max={100}
                step={5}
                valueText={(v) => `${L('volumeValue')} ${Math.round(v)}%`}
                onChange={r.setVolume}
                decreaseLabel={L('decrease')}
                increaseLabel={L('increase')}
              />
              <Knob
                labelTe={tr('te', 'tuningKnob')}
                labelEn={tr('en', 'tuningKnob')}
                ariaLabel={L('tuningKnob')}
                value={dialIndex}
                min={0}
                max={Math.max(0, r.dial.length - 1)}
                step={1}
                detents
                valueText={(v) => {
                  const st = r.dial[Math.round(v)];
                  return st ? `${st.freq} MHz ${st.label[lang]}` : L('stationValue');
                }}
                onChange={(v) => {
                  const st = r.dial[v];
                  if (st) r.tuneTo(st.id);
                }}
                decreaseLabel={L('decrease')}
                increaseLabel={L('increase')}
              />
            </div>
          </section>
        </div>

        <footer className="cabinet__foot">
          <div className="langswitch" role="group" aria-label={L('language')}>
            <button
              type="button"
              aria-pressed={lang === 'te'}
              onClick={() => setLang('te')}
              lang="te"
            >
              తెలుగు
            </button>
            <span aria-hidden="true">|</span>
            <button
              type="button"
              aria-pressed={lang === 'en'}
              onClick={() => setLang('en')}
              lang="en"
            >
              English
            </button>
          </div>
          <button type="button" className="plate-btn" onClick={() => setAbout(true)}>
            {L('about')}
          </button>
          <nav className="channels" aria-label={L('channels')}>
            {info?.channels.map((c) => (
              <a key={c.id} href={channelUrl(c)} target="_blank" rel="noopener">
                ▶ {c.label[lang]}
              </a>
            ))}
          </nav>
        </footer>
        <p className="mobile-note" lang={lang}>
          {L('mobileNote')}
        </p>
      </main>
      <AboutDialog
        open={about}
        onClose={() => setAbout(false)}
        lang={lang}
        title={`${name[lang]} — ${L('about')}`}
        body={L('aboutBody')}
        sync={L('aboutSync')}
        artist={info?.artistName ?? ''}
        channelsLabel={L('channels')}
        channels={info?.channels ?? []}
        closeLabel={L('close')}
      />
    </div>
  );
}
