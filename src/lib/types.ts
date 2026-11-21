// Shared by the refresh job (scripts/) and the browser client (src/).

export type VideoId = string;

export interface Bilingual {
  en: string;
  te: string;
}

export type IneligibleReason =
  'short' | 'too_short' | 'too_long' | 'live' | 'private' | 'not_embeddable' | 'denied' | 'removed';

export interface CatalogItem {
  id: VideoId;
  channelId: string;
  title: string;
  publishedAt: string; // ISO
  durationSec: number;
  thumb: string;
  eligible: boolean;
  reason?: IneligibleReason;
  firstSeenAt: string; // ISO, drives "new upload" priority
  lastCheckedAt: string; // ISO
  mode?: Mode;
  lang?: LangCode;
  moods?: Mood[];
  why?: string;
}

/** What the browser gets (eligible items only). */
export interface CatalogMinItem {
  id: VideoId;
  title: string;
  channelId: string;
  durationSec: number;
  thumb: string;
  mode?: Mode;
  lang?: LangCode;
  moods?: Mood[];
}

export interface Slot {
  id: VideoId;
  start: number; // unix ms
  dur: number; // seconds
}

export interface StationSchedule {
  stationId: string;
  slots: Slot[];
}

export interface ScheduleFile {
  version: 1;
  generatedAt: number;
  epoch: number;
  stations: Record<string, StationSchedule>;
  fallbackOrder: Record<string, VideoId[]>;
}

export interface StationState {
  cycleIndex: number;
  remaining: VideoId[];
  aired: VideoId[];
}

export type Mode = 'songs' | 'stories';
export type LangCode = 'te' | 'hi' | 'en' | 'es' | 'fr';
export type Mood = 'emotional' | 'fearful' | 'heart-touching';

export const MODES: readonly Mode[] = ['songs', 'stories'];
export const LANGS: readonly LangCode[] = ['te', 'hi', 'en', 'es', 'fr'];
export const MOODS: readonly Mood[] = ['emotional', 'fearful', 'heart-touching'];

export interface ChannelConfig {
  id: string;
  handle?: string;
  label: Bilingual;
  /** What this channel's uploads are by default (default: "songs"). */
  mode?: Mode;
  /** Language of uploads, or "auto" to detect from the title (default: "auto"). */
  language?: LangCode | 'auto';
  /** Language used when "auto" detection finds no clue (default: "te"). */
  defaultLanguage?: LangCode;
  /** Treat uploads whose titles say story/కథ/कहानी… as Stories (default: true). */
  detectStories?: boolean;
}

/** A YouTube playlist used as a source. Everything in it gets this mode/language/moods. */
export interface PlaylistConfig {
  id: string; // PL…
  label: Bilingual;
  mode: Mode;
  language: LangCode | 'auto';
  moods?: Mood[];
}

/** Manual per-video corrections (config/classification-overrides.json). */
export interface ClassificationOverride {
  mode?: Mode;
  language?: LangCode;
  moods?: Mood[];
  note?: string;
}

export interface Classification {
  mode: Mode;
  lang: LangCode;
  moods: Mood[];
  /** How we decided (for debugging in data/catalog.json). */
  why: string;
}

export interface StationConfig {
  id: string;
  freq: string;
  label: Bilingual;
  /** Legacy channel filter (used when mode/lang are absent). */
  channels: '*' | string[];
  mode?: Mode;
  lang?: LangCode;
  mood?: Mood;
}

export interface Rules {
  shortsMaxSeconds: number;
  probeShortsUrl: boolean;
  minSeconds: number;
  maxSeconds: number;
  horizonHours: number;
  lockMinutes: number;
  newUploadWindowDays: number;
  denyVideoIds: string[];
  allowVideoIds: string[];
}

export interface StationsConfig {
  stationName: Bilingual;
  tagline: Bilingual;
  artistName: string;
  siteUrl?: string;
  timezone: string;
  channels: ChannelConfig[];
  playlists?: PlaylistConfig[];
  /** Optional legacy list; when absent stations are generated (mode × language × mood). */
  stations?: StationConfig[];
  languages?: LangCode[];
  rules: Rules;
}

/** Public runtime config written to public/data/station.json. */
export interface PublicStationInfo {
  stationName: Bilingual;
  tagline: Bilingual;
  artistName: string;
  channels: ChannelConfig[];
  playlists?: PlaylistConfig[];
  stations: StationConfig[];
}

export interface NowPlaying {
  id: VideoId;
  offsetSec: number;
  slotStart: number;
  dur: number;
  endsAt: number;
  next?: Slot;
  fallback: boolean;
}

export interface StateFile {
  version: 1;
  epoch: number;
  stations: Record<string, StationState>;
}

/** data/playlists.json: last known membership of each playlist source. */
export type PlaylistMembership = Record<string, { ids: VideoId[]; fetchedAt: string }>;
