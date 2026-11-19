import { hashString, seededShuffle } from './shuffle';
import type { Rules, Slot, StationConfig, StationState, VideoId } from './types';

export interface ScheduleInput {
  id: VideoId;
  channelId: string;
  durationSec: number;
  publishedAt: string;
  firstSeenAt: string;
  eligible: boolean;
}

export type ScheduleRules = Pick<Rules, 'horizonHours' | 'lockMinutes' | 'newUploadWindowDays'>;

export const HOUR = 3_600_000;
export const DAY = 86_400_000;

export const emptyState = (): StationState => ({ cycleIndex: 0, remaining: [], aired: [] });

export function stationIncludes(station: StationConfig, channelId: string): boolean {
  return station.channels === '*' || station.channels.includes(channelId);
}

export const slotEnd = (s: Slot): number => s.start + s.dur * 1000;

export function cycleOrder(
  stationId: string,
  cycleIndex: number,
  ids: readonly VideoId[],
): VideoId[] {
  return seededShuffle([...ids].sort(), hashString(`${stationId}:${cycleIndex}`));
}

export function fallbackOrderFor(stationId: string, ids: readonly VideoId[]): VideoId[] {
  return seededShuffle([...ids].sort(), hashString(`${stationId}:fallback`));
}

/**
 * Extend a station's absolute-time schedule up to now + horizon.
 * Pure: never mutates its inputs.
 *
 * - Slots that already started (or start before now + lockMinutes) are never rewritten,
 *   so adding songs never changes what is playing now.
 * - Kept slots whose video became ineligible are dropped and the following future
 *   slots are re-packed so the schedule stays contiguous.
 * - New uploads (first seen within newUploadWindowDays, not yet aired this cycle) jump the queue.
 * - Otherwise each cycle is a seeded shuffle of all eligible songs (same for everyone).
 */
export function buildSchedule(
  station: StationConfig,
  catalog: readonly ScheduleInput[],
  prevSlots: readonly Slot[],
  prevState: StationState,
  now: number,
  rules: ScheduleRules,
): { slots: Slot[]; state: StationState } {
  const state: StationState = {
    cycleIndex: prevState.cycleIndex,
    remaining: [...prevState.remaining],
    aired: [...prevState.aired],
  };
  const eligible = catalog.filter((v) => v.eligible && stationIncludes(station, v.channelId));
  const byId = new Map(eligible.map((v) => [v.id, v]));
  const historyFrom = now - HOUR;

  if (eligible.length === 0) {
    return {
      slots: prevSlots.filter((s) => slotEnd(s) > historyFrom).map((s) => ({ ...s })),
      state,
    };
  }

  const lockUntil = now + rules.lockMinutes * 60_000;

  // 1) keep history + every still-eligible planned slot; re-pack future ones contiguously.
  //    (Future slots are kept, not regenerated, so per-cycle state stays consistent.)
  const keep: Slot[] = [];
  for (const s of prevSlots) {
    if (!(slotEnd(s) > historyFrom && byId.has(s.id))) continue;
    const prev = keep[keep.length - 1];
    if (prev && s.start >= now && s.start !== slotEnd(prev)) {
      keep.push({ ...s, start: slotEnd(prev) });
    } else {
      keep.push({ ...s });
    }
  }
  const locked = keep.filter((s) => s.start < lockUntil);
  const planned = keep.filter((s) => s.start >= lockUntil);
  const keptIds = new Set(keep.map((s) => s.id));

  // Clean state of ids that are no longer eligible.
  state.remaining = state.remaining.filter((id) => byId.has(id));

  // 2) priority queue: fresh uploads, newest first, inserted right after the locked window.
  const windowMs = rules.newUploadWindowDays * DAY;
  const newIds = eligible
    .filter(
      (v) =>
        now - Date.parse(v.firstSeenAt) < windowMs &&
        !state.aired.includes(v.id) &&
        !keptIds.has(v.id),
    )
    .sort(
      (a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || a.id.localeCompare(b.id),
    )
    .map((v) => v.id);

  const out: Slot[] = [...locked];
  const lastLocked = locked[locked.length - 1];
  let cursor = lastLocked ? slotEnd(lastLocked) : Math.floor(now / 1000) * 1000;
  for (const id of newIds) {
    const item = byId.get(id) as ScheduleInput;
    out.push({ id, start: cursor, dur: item.durationSec });
    cursor += item.durationSec * 1000;
    state.aired.push(id);
    state.remaining = state.remaining.filter((r) => r !== id);
  }
  for (const s of planned) {
    out.push({ ...s, start: cursor });
    cursor += s.dur * 1000;
  }

  const horizon = now + rules.horizonHours * HOUR;
  const eligibleIds = eligible.map((v) => v.id);
  let lastId = out[out.length - 1]?.id;
  let guard = 0;

  // 3) cycle queue: seeded shuffle per cycle, extended up to the horizon.
  while (cursor < horizon) {
    if (++guard > 1_000_000) throw new Error('buildSchedule: runaway loop');
    if (state.remaining.length === 0) {
      state.cycleIndex += 1;
      const order = cycleOrder(station.id, state.cycleIndex, eligibleIds);
      if (order.length > 1 && order[0] === lastId) {
        [order[0], order[1]] = [order[1] as VideoId, order[0] as VideoId];
      }
      state.remaining = order;
      state.aired = [];
    }
    const id = state.remaining.shift();
    const item = id ? byId.get(id) : undefined;
    if (!id || !item) continue;
    out.push({ id, start: cursor, dur: item.durationSec });
    state.aired.push(id);
    cursor += item.durationSec * 1000;
    lastId = id;
  }
  return { slots: out, state };
}
