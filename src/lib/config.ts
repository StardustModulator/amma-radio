import { generateStations } from './stations';
import type { ChannelConfig, PlaylistConfig, StationConfig, StationsConfig } from './types';

/** Anything still containing {{...}} is an unfilled placeholder. */
export const isPlaceholder = (v: string | undefined): boolean => !v || v.includes('{{');

export const isChannelId = (id: string): boolean => /^UC[\w-]{22}$/.test(id);

/** Channels that are really configured. */
export function activeChannels(cfg: StationsConfig): ChannelConfig[] {
  return cfg.channels.filter((c) => !isPlaceholder(c.id) && isChannelId(c.id));
}

export const isPlaylistId = (id: string): boolean => /^(PL|OL|UU|FL|LL)[\w-]{10,}$/.test(id);

/** Playlists that are really configured. */
export function activePlaylists(cfg: StationsConfig): PlaylistConfig[] {
  return (cfg.playlists ?? []).filter((p) => !isPlaceholder(p.id) && isPlaylistId(p.id));
}

/**
 * Stations to schedule. Without an explicit `stations` list the full grid
 * (songs/stories × languages × moods) is generated — empty ones show "Coming soon".
 */
export function activeStations(cfg: StationsConfig): StationConfig[] {
  if (!cfg.stations) return generateStations(cfg.languages);
  const ids = new Set(activeChannels(cfg).map((c) => c.id));
  return cfg.stations
    .map((s): StationConfig =>
      s.channels === '*' ? s : { ...s, channels: s.channels.filter((c) => ids.has(c)) },
    )
    .filter((s) => (s.channels === '*' ? ids.size > 0 : s.channels.length > 0))
    .filter((s) => !isPlaceholder(s.label.en) || !isPlaceholder(s.label.te));
}
