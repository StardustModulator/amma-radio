import { hashString } from './shuffle';
import type { NowPlaying, ScheduleFile, Slot, VideoId } from './types';

/** Index of the slot containing t, or -1. Slots must be sorted by start. */
export function findSlotIndex(slots: readonly Slot[], t: number): number {
  let lo = 0;
  let hi = slots.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const s = slots[mid] as Slot;
    if (t < s.start) hi = mid - 1;
    else if (t >= s.start + s.dur * 1000) lo = mid + 1;
    else return mid;
  }
  return -1;
}

export type DurationLookup = (id: VideoId) => number | undefined;

export function nowPlaying(
  schedule: ScheduleFile,
  stationId: string,
  t: number,
  durationOf: DurationLookup,
): NowPlaying | undefined {
  const slots = schedule.stations[stationId]?.slots ?? [];
  const i = findSlotIndex(slots, t);
  if (i >= 0) {
    const s = slots[i] as Slot;
    return {
      id: s.id,
      offsetSec: (t - s.start) / 1000,
      slotStart: s.start,
      dur: s.dur,
      endsAt: s.start + s.dur * 1000,
      next: slots[i + 1],
      fallback: false,
    };
  }
  return fallbackNowPlaying(schedule, stationId, t, durationOf);
}

/** Deterministic modulo mode for when the schedule ran out (job stopped) or is missing. */
export function fallbackNowPlaying(
  schedule: ScheduleFile,
  stationId: string,
  t: number,
  durationOf: DurationLookup,
): NowPlaying | undefined {
  const order = (schedule.fallbackOrder[stationId] ?? [])
    .map((id) => ({ id, dur: durationOf(id) ?? 0 }))
    .filter((x) => x.dur > 0);
  const totalMs = order.reduce((a, x) => a + x.dur * 1000, 0);
  if (!totalMs) return undefined;
  const sinceEpoch = t - schedule.epoch;
  const cycleStart = t - (((sinceEpoch % totalMs) + totalMs) % totalMs);
  let e = t - cycleStart;
  let start = cycleStart;
  for (let k = 0; k < order.length; k++) {
    const x = order[k] as { id: string; dur: number };
    const ms = x.dur * 1000;
    if (e < ms) {
      const nextX = order[(k + 1) % order.length] as { id: string; dur: number };
      return {
        id: x.id,
        offsetSec: e / 1000,
        slotStart: start,
        dur: x.dur,
        endsAt: start + ms,
        next: { id: nextX.id, start: start + ms, dur: nextX.dur },
        fallback: true,
      };
    }
    e -= ms;
    start += ms;
  }
  return undefined;
}

/**
 * When a video errors in the player, every client deterministically picks the same filler
 * for the remainder of the slot.
 */
export function pickFiller(
  fallbackOrder: readonly VideoId[],
  slotStart: number,
  t: number,
  durationOf: DurationLookup,
  badIds: ReadonlySet<VideoId>,
): { id: VideoId; startSeconds: number } | undefined {
  const n = fallbackOrder.length;
  if (!n) return undefined;
  const base = hashString(String(slotStart)) % n;
  for (let k = 0; k < n; k++) {
    const id = fallbackOrder[(base + k) % n] as VideoId;
    const dur = durationOf(id);
    if (badIds.has(id) || !dur) continue;
    const elapsed = Math.max(0, (t - slotStart) / 1000);
    return { id, startSeconds: elapsed % dur };
  }
  return undefined;
}
