// Data sources for the refresh job. Runs ONLY in GitHub Actions / Node, never in the browser.
// No media is ever downloaded: we only read public metadata (IDs, titles, durations).
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parseIsoDuration } from '../src/lib/duration';

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

const API = 'https://www.googleapis.com/youtube/v3';

async function withRetry<T>(fn: () => Promise<T>, tries = 3, label = 'request'): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (i < tries - 1) await new Promise((r) => setTimeout(r, 500 * 2 ** i));
    }
  }
  throw new Error(`${label} failed after ${tries} tries: ${String(last)}`);
}

async function getJson<T>(fetchFn: FetchLike, url: string): Promise<T> {
  return withRetry(
    async () => {
      const res = await fetchFn(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url.replace(/key=[^&]+/, 'key=***')}`);
      return (await res.json()) as T;
    },
    3,
    'YouTube API',
  );
}

export const uploadsPlaylistId = (channelId: string): string => `UU${channelId.slice(2)}`;

// ---------------------------------------------------------------- Data API v3 (preferred)

interface PlaylistItemsResponse {
  nextPageToken?: string;
  items?: { contentDetails?: { videoId?: string } }[];
}

/** List upload IDs newest-first; stop paging once a page contains a known ID (unless full). */
export async function apiListUploads(
  fetchFn: FetchLike,
  key: string,
  channelId: string,
  known: ReadonlySet<string>,
  full: boolean,
): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 200; page++) {
    const url =
      `${API}/playlistItems?part=contentDetails&maxResults=50&playlistId=${uploadsPlaylistId(channelId)}` +
      `${pageToken ? `&pageToken=${pageToken}` : ''}&key=${key}`;
    const data = await getJson<PlaylistItemsResponse>(fetchFn, url);
    const pageIds = (data.items ?? [])
      .map((i) => i.contentDetails?.videoId)
      .filter((x): x is string => !!x);
    ids.push(...pageIds);
    if (!data.nextPageToken) break;
    if (!full && pageIds.some((id) => known.has(id))) break;
    pageToken = data.nextPageToken;
  }
  return ids;
}

/** Every video ID in a playlist (playlists are small; always a full crawl, 1 unit per 50). */
export async function apiListPlaylist(
  fetchFn: FetchLike,
  key: string,
  playlistId: string,
): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 100; page++) {
    const url =
      `${API}/playlistItems?part=contentDetails&maxResults=50&playlistId=${playlistId}` +
      `${pageToken ? `&pageToken=${pageToken}` : ''}&key=${key}`;
    const data = await getJson<PlaylistItemsResponse>(fetchFn, url);
    ids.push(
      ...(data.items ?? []).map((i) => i.contentDetails?.videoId).filter((x): x is string => !!x),
    );
    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }
  return ids;
}

export interface ApiVideo {
  id: string;
  channelId: string;
  title: string;
  publishedAt: string;
  durationSec: number;
  embeddable: boolean;
  privacyStatus: string;
  liveBroadcastContent: string;
}

interface VideosResponse {
  items?: {
    id: string;
    snippet?: {
      channelId?: string;
      title?: string;
      publishedAt?: string;
      liveBroadcastContent?: string;
    };
    contentDetails?: { duration?: string };
    status?: { embeddable?: boolean; privacyStatus?: string };
  }[];
}

/** videos.list in batches of 50. IDs missing from the response were removed/made private. */
export async function apiGetVideos(
  fetchFn: FetchLike,
  key: string,
  ids: string[],
): Promise<ApiVideo[]> {
  const out: ApiVideo[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    const url = `${API}/videos?part=contentDetails,status,snippet,liveStreamingDetails&id=${batch.join(',')}&key=${key}`;
    const data = await getJson<VideosResponse>(fetchFn, url);
    for (const v of data.items ?? []) {
      out.push({
        id: v.id,
        channelId: v.snippet?.channelId ?? '',
        title: v.snippet?.title ?? v.id,
        publishedAt: v.snippet?.publishedAt ?? new Date(0).toISOString(),
        durationSec: parseIsoDuration(v.contentDetails?.duration ?? 'P0D'),
        embeddable: v.status?.embeddable !== false,
        privacyStatus: v.status?.privacyStatus ?? 'public',
        liveBroadcastContent: v.snippet?.liveBroadcastContent ?? 'none',
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------- RSS (official, keyless, latest ~15)

export interface RssEntry {
  id: string;
  title: string;
  published: string;
}

const decodeXml = (s: string): string =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');

export function parseRss(xml: string): RssEntry[] {
  const entries: RssEntry[] = [];
  for (const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const body = m[1] ?? '';
    const id = /<yt:videoId>([^<]+)<\/yt:videoId>/.exec(body)?.[1];
    const title = /<title>([^<]*)<\/title>/.exec(body)?.[1] ?? '';
    const published = /<published>([^<]+)<\/published>/.exec(body)?.[1] ?? '';
    if (id) entries.push({ id, title: decodeXml(title), published });
  }
  return entries;
}

export async function rssLatest(
  fetchFn: FetchLike,
  channelId: string,
  kind: 'channel_id' | 'playlist_id' = 'channel_id',
): Promise<RssEntry[]> {
  return withRetry(
    async () => {
      const res = await fetchFn(`https://www.youtube.com/feeds/videos.xml?${kind}=${channelId}`);
      if (!res.ok) throw new Error(`RSS HTTP ${res.status}`);
      return parseRss(await res.text());
    },
    3,
    'RSS',
  );
}

// ---------------------------------------------------------------- oEmbed (official, keyless)

export type EmbedStatus = 'ok' | 'not_embeddable' | 'gone' | 'unknown';

/** 200 → embeddable, 401/403 → embedding disabled, 404/400 → removed or private. */
export async function oembedStatus(fetchFn: FetchLike, id: string): Promise<EmbedStatus> {
  try {
    const res = await fetchFn(
      `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`,
    );
    if (res.ok) return 'ok';
    if (res.status === 401 || res.status === 403) return 'not_embeddable';
    if (res.status === 404 || res.status === 400) return 'gone';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

// ---------------------------------------------------------------- Shorts probe (unofficial heuristic)

export async function probeShort(
  fetchFn: FetchLike,
  id: string,
): Promise<'short' | 'not_short' | 'unknown'> {
  try {
    const res = await fetchFn(`https://www.youtube.com/shorts/${id}`, {
      method: 'HEAD',
      redirect: 'manual',
    });
    if (res.status === 200) return 'short';
    if (res.status >= 300 && res.status < 400) return 'not_short';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

// ---------------------------------------------------------------- yt-dlp channel listing (keyless)
// Used ONLY to list a channel's public "Videos" and "Shorts" tabs (--flat-playlist: IDs, titles,
// durations). It never downloads or streams media. It's unofficial and YouTube may block it;
// the job falls back to RSS and keeps the previous data when it does.

export interface TabEntry {
  id: string;
  title: string;
  durationSec: number | null;
  liveStatus: string | null;
  channelId?: string;
}

export type ExecLike = (cmd: string, args: string[]) => Promise<string>;

const execFileP = promisify(execFile);
export const defaultExec: ExecLike = async (cmd, args) =>
  (await execFileP(cmd, args, { maxBuffer: 64 * 1024 * 1024, timeout: 180_000 })).stdout;

interface FlatPlaylist {
  entries?: {
    id?: string;
    title?: string;
    duration?: number | null;
    live_status?: string | null;
    channel_id?: string | null;
  }[];
}

export function ytdlpListTab(
  exec: ExecLike,
  channelId: string,
  tab: 'videos' | 'shorts',
): Promise<TabEntry[]> {
  return ytdlpList(exec, `https://www.youtube.com/channel/${channelId}/${tab}`);
}

export function ytdlpListPlaylist(exec: ExecLike, playlistId: string): Promise<TabEntry[]> {
  return ytdlpList(exec, `https://www.youtube.com/playlist?list=${playlistId}`);
}

async function ytdlpList(exec: ExecLike, url: string): Promise<TabEntry[]> {
  const out = await exec(process.env.YTDLP_BIN || 'yt-dlp', [
    '--flat-playlist',
    '--dump-single-json',
    '--no-warnings',
    '--skip-download',
    url,
  ]);
  const data = JSON.parse(out) as FlatPlaylist;
  return (data.entries ?? [])
    .filter((e) => !!e.id)
    .map((e) => ({
      id: e.id as string,
      title: e.title ?? (e.id as string),
      durationSec: typeof e.duration === 'number' ? Math.round(e.duration) : null,
      liveStatus: e.live_status ?? null,
      ...(e.channel_id ? { channelId: e.channel_id } : {}),
    }));
}
