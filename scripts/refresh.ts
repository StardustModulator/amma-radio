// Hourly refresh job: discover uploads → update catalogue → extend schedules → write data/*.
// Safe to re-run. Network failures only log warnings and keep the previous data,
// so the radio never goes silent because of a bad run.
import { pathToFileURL } from 'node:url';
import { activeChannels, activeStations } from '../src/lib/config';
import { classify, type ShortsProbe } from '../src/lib/eligibility';
import {
  buildSchedule,
  emptyState,
  fallbackOrderFor,
  HOUR,
  stationIncludes,
} from '../src/lib/schedule';
import type { CatalogItem, Rules, ScheduleFile, StateFile } from '../src/lib/types';
import { loadAll, paths, writeJson, writeScheduleFile } from './io';
import {
  apiGetVideos,
  apiListUploads,
  defaultExec,
  oembedStatus,
  probeShort,
  rssLatest,
  ytdlpListTab,
  type ApiVideo,
  type ExecLike,
  type FetchLike,
  type RssEntry,
  type TabEntry,
} from './youtube';

export interface RefreshDeps {
  root: string;
  now: number;
  fetch: FetchLike;
  exec: ExecLike;
  apiKey?: string;
  fullCrawl?: boolean;
  /** Use yt-dlp channel listing when there is no API key (or the API fails). Default true. */
  useYtDlp?: boolean;
  log?: (msg: string) => void;
  random?: () => number;
}

export interface RefreshResult {
  added: string[];
  changed: string[];
  source: Record<string, 'api' | 'ytdlp' | 'rss-only' | 'none'>;
  warnings: string[];
}

const thumbOf = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
const EPOCH_ISO = new Date(0).toISOString();
const toIso = (s: string): string | undefined => {
  const t = Date.parse(s);
  return Number.isNaN(t) ? undefined : new Date(t).toISOString();
};

export async function refresh(deps: RefreshDeps): Promise<RefreshResult> {
  const log = deps.log ?? ((m: string) => console.log(m));
  const rand = deps.random ?? Math.random;
  const nowIso = new Date(deps.now).toISOString();
  const { config, catalog, state, schedule } = loadAll(deps.root);
  const rules: Rules = config.rules;
  const byId = new Map(catalog.map((c) => [c.id, c]));
  const result: RefreshResult = { added: [], changed: [], source: {}, warnings: [] };
  const warn = (m: string) => {
    result.warnings.push(m);
    log(`::warning::${m}`);
  };
  const checkedThisRun = new Set<string>();

  const upsert = (item: CatalogItem) => {
    const prev = byId.get(item.id);
    if (!prev) result.added.push(item.id);
    else if (prev.eligible !== item.eligible || prev.reason !== item.reason)
      result.changed.push(item.id);
    byId.set(item.id, item);
    checkedThisRun.add(item.id);
  };

  const fromApi = async (v: ApiVideo, channelId: string, bootstrap: boolean) => {
    const prev = byId.get(v.id);
    let probe: ShortsProbe = 'unknown';
    if (v.durationSec <= rules.shortsMaxSeconds && !rules.allowVideoIds.includes(v.id)) {
      if (prev && prev.reason !== 'short' && prev.eligible) probe = 'not_short';
      else if (rules.probeShortsUrl) probe = await probeShort(deps.fetch, v.id);
    }
    const reason = classify(v, rules, probe);
    upsert({
      id: v.id,
      channelId: v.channelId || channelId,
      title: v.title,
      publishedAt: v.publishedAt,
      durationSec: v.durationSec,
      thumb: thumbOf(v.id),
      eligible: !reason,
      ...(reason ? { reason } : {}),
      firstSeenAt: prev?.firstSeenAt ?? (bootstrap ? EPOCH_ISO : nowIso),
      lastCheckedAt: nowIso,
    });
  };

  const channels = activeChannels(config);
  const stations = activeStations(config);
  if (!channels.length)
    warn('No real channel IDs in config/stations.json yet; skipping discovery.');
  if (!deps.apiKey && channels.length) {
    log(
      'YOUTUBE_API_KEY is not set; using the keyless path (yt-dlp channel listing + RSS + oEmbed).',
    );
  }

  // ------------------------------------------------------------ 1+2. discover + enrich
  for (const ch of channels) {
    const known = new Set([...byId.values()].filter((c) => c.channelId === ch.id).map((c) => c.id));
    const bootstrap = known.size === 0;
    result.source[ch.id] = 'none';

    if (deps.apiKey) {
      try {
        const ids = await apiListUploads(
          deps.fetch,
          deps.apiKey,
          ch.id,
          known,
          !!deps.fullCrawl || bootstrap,
        );
        const fresh = ids.filter((id) => !byId.has(id) || deps.fullCrawl);
        const vids = await apiGetVideos(deps.fetch, deps.apiKey, fresh);
        for (const v of vids) await fromApi(v, ch.id, bootstrap);
        log(`[api] ${ch.id}: ${ids.length} listed, ${fresh.length} new/re-crawled`);
        result.source[ch.id] = 'api';
        continue;
      } catch (e) {
        warn(`YouTube Data API failed for ${ch.id} (${String(e)}); falling back to keyless path.`);
      }
    }

    let rss: RssEntry[] = [];
    try {
      rss = await rssLatest(deps.fetch, ch.id);
    } catch (e) {
      warn(`RSS failed for ${ch.id}: ${String(e)}`);
    }
    const rssById = new Map(
      rss.map((r) => [r.id, { ...r, published: toIso(r.published) ?? nowIso }]),
    );

    let videos: TabEntry[] | null = null;
    if (deps.useYtDlp !== false) {
      try {
        videos = await ytdlpListTab(deps.exec, ch.id, 'videos');
      } catch (e) {
        warn(`yt-dlp listing failed for ${ch.id}: ${String(e).slice(0, 300)}`);
      }
    }

    if (!videos) {
      const waiting = rss.filter((r) => !byId.has(r.id));
      if (waiting.length) {
        warn(
          `${waiting.length} new upload(s) seen in RSS for ${ch.id} (maybe Shorts) but durations are unavailable without yt-dlp or an API key; will retry next run.`,
        );
      }
      result.source[ch.id] = rss.length ? 'rss-only' : 'none';
      continue;
    }
    result.source[ch.id] = 'ytdlp';

    let shortIds = new Set<string>();
    try {
      shortIds = new Set((await ytdlpListTab(deps.exec, ch.id, 'shorts')).map((s) => s.id));
    } catch {
      // Channel without a Shorts tab: fine, the Videos tab never lists Shorts anyway.
    }

    const listed = new Set(videos.map((v) => v.id));
    for (const v of videos) {
      const prev = byId.get(v.id);
      if (prev && !deps.fullCrawl && prev.reason !== 'removed') {
        if (prev.title !== v.title) byId.set(v.id, { ...prev, title: v.title });
        continue;
      }
      if (v.durationSec === null) continue; // upcoming premiere etc. → retry later
      const embed = await oembedStatus(deps.fetch, v.id);
      if (embed === 'unknown') continue; // retry next run
      const live = v.liveStatus && v.liveStatus !== 'not_live' && v.liveStatus !== 'was_live';
      const reason = classify(
        {
          id: v.id,
          durationSec: v.durationSec,
          embeddable: embed === 'ok',
          privacyStatus: embed === 'gone' ? 'private' : 'public',
          liveBroadcastContent: live ? 'live' : 'none',
        },
        rules,
        shortIds.has(v.id) ? 'short' : 'not_short', // the Videos tab never lists Shorts
      );
      upsert({
        id: v.id,
        channelId: ch.id,
        title: v.title,
        publishedAt: rssById.get(v.id)?.published ?? prev?.publishedAt ?? nowIso,
        durationSec: v.durationSec,
        thumb: thumbOf(v.id),
        eligible: !reason,
        ...(reason ? { reason } : {}),
        firstSeenAt: prev?.firstSeenAt ?? (bootstrap ? EPOCH_ISO : nowIso),
        lastCheckedAt: nowIso,
      });
    }
    log(`[ytdlp] ${ch.id}: ${videos.length} on Videos tab, ${shortIds.size} Shorts ignored`);

    // Items that vanished from the Videos tab: confirm with oEmbed before dropping.
    if (videos.length) {
      for (const item of [...byId.values()]) {
        if (item.channelId !== ch.id || !item.eligible || listed.has(item.id)) continue;
        const embed = await oembedStatus(deps.fetch, item.id);
        if (embed === 'gone' || embed === 'not_embeddable') {
          upsert({
            ...item,
            eligible: false,
            reason: embed === 'gone' ? 'removed' : 'not_embeddable',
            lastCheckedAt: nowIso,
          });
        } else if (shortIds.has(item.id)) {
          upsert({ ...item, eligible: false, reason: 'short', lastCheckedAt: nowIso });
        }
      }
    }
  }

  // ------------------------------------------------------------ 3. re-check soon-to-air + random sample
  const soon = new Set<string>();
  for (const st of Object.values(schedule.stations)) {
    for (const s of st.slots)
      if (s.start < deps.now + 24 * HOUR && s.start + s.dur * 1000 > deps.now) soon.add(s.id);
  }
  const eligibleNow = [...byId.values()].filter((c) => c.eligible).map((c) => c.id);
  const sample = eligibleNow
    .map((id) => ({ id, r: rand() }))
    .sort((a, b) => a.r - b.r)
    .slice(0, 50)
    .map((x) => x.id);
  const recheck = [...new Set([...soon, ...sample])].filter(
    (id) => byId.has(id) && !checkedThisRun.has(id),
  );
  if (recheck.length && channels.length) {
    if (deps.apiKey) {
      try {
        const vids = await apiGetVideos(deps.fetch, deps.apiKey, recheck);
        const got = new Set(vids.map((v) => v.id));
        for (const v of vids) await fromApi(v, byId.get(v.id)?.channelId ?? '', false);
        for (const id of recheck) {
          const item = byId.get(id);
          if (item && !got.has(id))
            upsert({ ...item, eligible: false, reason: 'removed', lastCheckedAt: nowIso });
        }
      } catch (e) {
        warn(`Re-check via API failed: ${String(e)}`);
      }
    } else {
      for (const id of recheck) {
        const item = byId.get(id);
        if (!item) continue;
        const embed = await oembedStatus(deps.fetch, id);
        if (embed === 'gone' || embed === 'not_embeddable') {
          upsert({
            ...item,
            eligible: false,
            reason: embed === 'gone' ? 'removed' : 'not_embeddable',
            lastCheckedAt: nowIso,
          });
        } else if (embed === 'ok') {
          byId.set(id, { ...item, lastCheckedAt: nowIso });
        }
      }
    }
  }

  // denyVideoIds always wins, even for items already in the catalogue.
  for (const item of byId.values()) {
    if (rules.denyVideoIds.includes(item.id) && item.reason !== 'denied') {
      upsert({ ...item, eligible: false, reason: 'denied' });
    }
  }

  // ------------------------------------------------------------ 4. extend schedules
  const allItems = [...byId.values()].sort(
    (a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.id.localeCompare(b.id),
  );
  const nextState: StateFile = { version: 1, epoch: state.epoch, stations: {} };
  const nextSchedule: ScheduleFile = {
    version: 1,
    generatedAt: deps.now,
    epoch: state.epoch,
    stations: {},
    fallbackOrder: {},
  };
  for (const st of stations) {
    const prevSlots = schedule.stations[st.id]?.slots ?? [];
    const prevState = state.stations[st.id] ?? emptyState();
    const built = buildSchedule(st, allItems, prevSlots, prevState, deps.now, rules);
    nextState.stations[st.id] = built.state;
    nextSchedule.stations[st.id] = { stationId: st.id, slots: built.slots };
    nextSchedule.fallbackOrder[st.id] = fallbackOrderFor(
      st.id,
      allItems.filter((c) => c.eligible && stationIncludes(st, c.channelId)).map((c) => c.id),
    );
    log(`[schedule] ${st.id}: ${built.slots.length} slots, cycle ${built.state.cycleIndex}`);
  }

  // ------------------------------------------------------------ 5. write
  const p = paths(deps.root);
  writeJson(p.catalog, allItems);
  writeJson(p.state, nextState);
  writeScheduleFile(p.schedule, nextSchedule);
  log(
    `[done] catalogue ${allItems.length} (${allItems.filter((c) => c.eligible).length} eligible), ` +
      `+${result.added.length} new, ${result.changed.length} changed`,
  );
  return result;
}

// CLI entry
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const apiKey = (process.env.YOUTUBE_API_KEY || process.env.YT_API_KEY || '').trim() || undefined;
  refresh({
    root: process.cwd(),
    now: Date.now(),
    fetch: (url, init) =>
      fetch(url, { ...init, headers: { 'Accept-Language': 'en', ...(init?.headers ?? {}) } }),
    exec: defaultExec,
    apiKey,
    fullCrawl: process.env.FULL_CRAWL === '1' || process.env.FULL_CRAWL === 'true',
    useYtDlp: process.env.USE_YTDLP !== '0',
  }).catch((e) => {
    console.error(e);
    process.exit(1); // programmer error (network errors are caught inside)
  });
}
