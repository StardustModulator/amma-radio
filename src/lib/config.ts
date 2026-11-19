import type { ChannelConfig, StationConfig, StationsConfig } from './types';

/** Anything still containing {{...}} is an unfilled placeholder. */
export const isPlaceholder = (v: string | undefined): boolean => !v || v.includes('{{');

export const isChannelId = (id: string): boolean => /^UC[\w-]{22}$/.test(id);

/** Channels that are really configured. */
export function activeChannels(cfg: StationsConfig): ChannelConfig[] {
  return cfg.channels.filter((c) => !isPlaceholder(c.id) && isChannelId(c.id));
}

/** Stations with at least one real channel ('*' counts when any channel is real). */
export function activeStations(cfg: StationsConfig): StationConfig[] {
  const ids = new Set(activeChannels(cfg).map((c) => c.id));
  return cfg.stations
    .map((s): StationConfig =>
      s.channels === '*' ? s : { ...s, channels: s.channels.filter((c) => ids.has(c)) },
    )
    .filter((s) => (s.channels === '*' ? ids.size > 0 : s.channels.length > 0))
    .filter((s) => !isPlaceholder(s.label.en) || !isPlaceholder(s.label.te));
}
