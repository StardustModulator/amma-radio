import { describe, expect, it } from 'vitest';
import {
  fallbackNowPlaying,
  findSlotIndex,
  nowPlaying,
  pickFiller,
} from '../../src/lib/now-playing';
import type { ScheduleFile } from '../../src/lib/types';

const T0 = Date.UTC(2026, 10, 19, 0, 0, 0);
const durs: Record<string, number> = { a: 100, b: 200, c: 300 };
const dur = (id: string) => durs[id];
const schedule: ScheduleFile = {
  version: 1,
  generatedAt: T0,
  epoch: T0 - 1_000_000,
  stations: {
    all: {
      stationId: 'all',
      slots: [
        { id: 'a', start: T0, dur: 100 },
        { id: 'b', start: T0 + 100_000, dur: 200 },
        { id: 'c', start: T0 + 300_000, dur: 300 },
      ],
    },
    empty: { stationId: 'empty', slots: [] },
  },
  fallbackOrder: { all: ['a', 'b', 'c'], empty: ['c', 'a'] },
};

describe('nowPlaying', () => {
  it('finds the slot at exact boundaries', () => {
    expect(nowPlaying(schedule, 'all', T0, dur)).toMatchObject({
      id: 'a',
      offsetSec: 0,
      fallback: false,
    });
    expect(nowPlaying(schedule, 'all', T0 + 100_000 - 1, dur)).toMatchObject({ id: 'a' });
    expect(nowPlaying(schedule, 'all', T0 + 100_000, dur)).toMatchObject({ id: 'b', offsetSec: 0 });
    expect(nowPlaying(schedule, 'all', T0 + 150_000, dur)?.next?.id).toBe('c');
    expect(findSlotIndex(schedule.stations.all!.slots, T0 - 1)).toBe(-1);
  });

  it('falls back to deterministic modulo mode when the schedule is exhausted or empty', () => {
    const late = T0 + 10 * 86_400_000;
    const np = nowPlaying(schedule, 'all', late, dur);
    expect(np?.fallback).toBe(true);
    // total cycle 600 s; position = (late - epoch) mod 600 s
    const e = ((late - schedule.epoch) / 1000) % 600;
    const expected = e < 100 ? 'a' : e < 300 ? 'b' : 'c';
    expect(np?.id).toBe(expected);
    const empty = fallbackNowPlaying(schedule, 'empty', schedule.epoch + 301_000, dur);
    expect(empty).toMatchObject({ id: 'a', offsetSec: 1 });
    expect(nowPlaying(schedule, 'nope', T0, dur)).toBeUndefined();
  });

  it('two clients pick the same deterministic filler for the same slot', () => {
    const bad = new Set(['b']);
    const x = pickFiller(['a', 'b', 'c'], T0 + 100_000, T0 + 130_000, dur, bad);
    const y = pickFiller(['a', 'b', 'c'], T0 + 100_000, T0 + 130_000, dur, new Set(['b']));
    expect(x).toEqual(y);
    expect(x?.id).not.toBe('b');
    expect(x!.startSeconds).toBe(30 % durs[x!.id]!);
  });
});
