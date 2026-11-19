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
}

/** What the browser gets (eligible items only). */
export interface CatalogMinItem {
  id: VideoId;
  title: string;
  channelId: string;
  durationSec: number;
  thumb: string;
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

export interface ChannelConfig {
  id: string;
  handle?: string;
  label: Bilingual;
}

export interface StationConfig {
  id: string;
  freq: string;
  label: Bilingual;
  channels: '*' | string[];
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
  stations: StationConfig[];
  rules: Rules;
}

/** Public runtime config written to public/data/station.json. */
export interface PublicStationInfo {
  stationName: Bilingual;
  tagline: Bilingual;
  artistName: string;
  channels: ChannelConfig[];
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
