import { describe, expect, it } from 'vitest';
import {
  buildSchedule,
  cycleOrder,
  emptyState,
  slotEnd,
  type ScheduleInput,
} from '../../src/lib/schedule';
import type { Slot, StationConfig } from '../../src/lib/types';

const station: StationConfig = {
  id: 'all',
  freq: '88.5',
  label: { en: 'All', te: 'అన్ని' },
  channels: '*',
};
const rules = { horizonHours: 6, lockMinutes: 10, newUploadWindowDays: 7 };
const NOW = Date.UTC(2026, 10, 19, 12, 0, 0);
const OLD = new Date(0).toISOString();

const song = (id: string, dur = 200, extra: Partial<ScheduleInput> = {}): ScheduleInput => ({
  id,
  channelId: 'UCx',
  durationSec: dur,
  publishedAt: '2026-01-01T00:00:00.000Z',
  firstSeenAt: OLD,
  eligible: true,
  ...extra,
});
const catalog = ['a', 'b', 'c', 'd', 'e', 'f'].map((id, i) => song(id, 180 + i * 17));

function expectContiguous(slots: Slot[]) {
  for (let i = 1; i < slots.length; i++) {
    expect(slots[i]!.start).toBe(slotEnd(slots[i - 1]!));
  }
}

describe('buildSchedule', () => {
  it('produces contiguous slots that cover now..horizon', () => {
    const { slots } = buildSchedule(station, catalog, [], emptyState(), NOW, rules);
    expectContiguous(slots);
    expect(slots[0]!.start).toBeLessThanOrEqual(NOW);
    expect(slotEnd(slots[slots.length - 1]!)).toBeGreaterThanOrEqual(NOW + 6 * 3_600_000);
  });

  it('plays each song exactly once per cycle and shuffles the next cycle differently', () => {
    const { slots } = buildSchedule(station, catalog, [], emptyState(), NOW, rules);
    const n = catalog.length;
    const c1 = slots.slice(0, n).map((s) => s.id);
    const c2 = slots.slice(n, 2 * n).map((s) => s.id);
    expect(new Set(c1).size).toBe(n);
    expect(new Set(c2).size).toBe(n);
    expect(c2).not.toEqual(c1);
  });

  it('never repeats a song back-to-back across cycle boundaries', () => {
    const { slots } = buildSchedule(station, catalog, [], emptyState(), NOW, {
      ...rules,
      horizonHours: 200,
    });
    for (let i = 1; i < slots.length; i++) expect(slots[i]!.id).not.toBe(slots[i - 1]!.id);
  });

  it('is deterministic for the same inputs', () => {
    const a = buildSchedule(station, catalog, [], emptyState(), NOW, rules);
    const b = buildSchedule(station, catalog, [], emptyState(), NOW, rules);
    expect(a).toEqual(b);
    expect(cycleOrder('all', 3, ['x', 'y', 'z'])).toEqual(cycleOrder('all', 3, ['z', 'y', 'x']));
  });

  it('is stable when re-run later: slots before lockUntil never change', () => {
    const first = buildSchedule(station, catalog, [], emptyState(), NOW, rules);
    const later = NOW + 30 * 60_000;
    const second = buildSchedule(station, catalog, first.slots, first.state, later, rules);
    const lockUntil = later + 10 * 60_000;
    const before = first.slots.filter((s) => s.start < lockUntil && slotEnd(s) > later - 3_600_000);
    for (const s of before) expect(second.slots).toContainEqual(s);
    expectContiguous(second.slots);
    // re-running at the same time is a no-op
    const third = buildSchedule(station, catalog, second.slots, second.state, later, rules);
    expect(third.slots).toEqual(second.slots);
  });

  it('inserts a new upload right after the locked window without touching locked slots', () => {
    const first = buildSchedule(station, catalog, [], emptyState(), NOW, rules);
    const later = NOW + 5 * 60_000;
    const fresh = song('NEW', 240, {
      firstSeenAt: new Date(later).toISOString(),
      publishedAt: new Date(later).toISOString(),
    });
    const second = buildSchedule(
      station,
      [...catalog, fresh],
      first.slots,
      first.state,
      later,
      rules,
    );
    const lockUntil = later + 10 * 60_000;
    const locked = second.slots.filter((s) => s.start < lockUntil);
    for (const s of locked) expect(first.slots).toContainEqual(s);
    const firstPostLock = second.slots.find((s) => s.start >= lockUntil);
    expect(firstPostLock?.id).toBe('NEW');
    expectContiguous(second.slots);
    // ...and it is not double-played later in the same cycle
    const idx = second.slots.findIndex((s) => s.id === 'NEW');
    const rest = second.slots.slice(idx + 1, idx + catalog.length);
    expect(rest.map((s) => s.id)).not.toContain('NEW');
  });

  it('drops ineligible videos from future slots and re-packs the gap', () => {
    const first = buildSchedule(station, catalog, [], emptyState(), NOW, rules);
    const victim = first.slots.find((s) => s.start > NOW + 3_600_000)!.id;
    const cat2 = catalog.map((c) => (c.id === victim ? { ...c, eligible: false } : c));
    const later = NOW + 60_000;
    const second = buildSchedule(station, cat2, first.slots, first.state, later, rules);
    expect(second.slots.filter((s) => s.start >= later).map((s) => s.id)).not.toContain(victim);
    expectContiguous(second.slots.filter((s) => s.start >= later));
  });

  it('keeps previous slots when there is nothing eligible', () => {
    const first = buildSchedule(station, catalog, [], emptyState(), NOW, rules);
    const res = buildSchedule(station, [], first.slots, first.state, NOW, rules);
    expect(res.slots.length).toBeGreaterThan(0);
  });

  it('respects station channel filters', () => {
    const st: StationConfig = { ...station, id: 'ch2', channels: ['UCother'] };
    const res = buildSchedule(
      st,
      [...catalog, song('o1', 200, { channelId: 'UCother' })],
      [],
      emptyState(),
      NOW,
      rules,
    );
    expect(new Set(res.slots.map((s) => s.id))).toEqual(new Set(['o1']));
  });
});
