import { describe, expect, it } from 'vitest';
import { parseIsoDuration, formatClock } from '../../src/lib/duration';
import { classify } from '../../src/lib/eligibility';
import { activeChannels, activeStations } from '../../src/lib/config';
import { seededShuffle } from '../../src/lib/shuffle';
import type { Rules, StationsConfig } from '../../src/lib/types';
import { parseRss } from '../../scripts/youtube';

const rules: Rules = {
  shortsMaxSeconds: 180,
  probeShortsUrl: true,
  minSeconds: 60,
  maxSeconds: 1200,
  horizonHours: 48,
  lockMinutes: 10,
  newUploadWindowDays: 7,
  denyVideoIds: ['deny'],
  allowVideoIds: ['allow'],
};
const facts = {
  durationSec: 240,
  embeddable: true,
  privacyStatus: 'public',
  liveBroadcastContent: 'none',
};

describe('parseIsoDuration', () => {
  it('parses common forms', () => {
    expect(parseIsoDuration('PT3M5S')).toBe(185);
    expect(parseIsoDuration('PT1H2S')).toBe(3602);
    expect(parseIsoDuration('P0D')).toBe(0);
    expect(parseIsoDuration('P1DT1M')).toBe(86460);
    expect(parseIsoDuration('garbage')).toBe(0);
    expect(formatClock(185)).toBe('3:05');
    expect(formatClock(3725)).toBe('1:02:05');
  });
});

describe('classify', () => {
  it('excludes Shorts unless allow-listed, respecting the probe', () => {
    expect(classify({ ...facts, id: 'x', durationSec: 45 }, rules, 'short')).toBe('short');
    expect(classify({ ...facts, id: 'x', durationSec: 150 }, rules, 'unknown')).toBe('short');
    expect(classify({ ...facts, id: 'x', durationSec: 150 }, rules, 'not_short')).toBeUndefined();
    expect(classify({ ...facts, id: 'x', durationSec: 45 }, rules, 'not_short')).toBe('too_short');
    expect(classify({ ...facts, id: 'allow', durationSec: 45 }, rules, 'short')).toBeUndefined();
  });
  it('excludes deny-listed, private, live, unembeddable, too long', () => {
    expect(classify({ ...facts, id: 'deny' }, rules)).toBe('denied');
    expect(classify({ ...facts, id: 'x', privacyStatus: 'private' }, rules)).toBe('private');
    expect(classify({ ...facts, id: 'x', privacyStatus: 'unlisted' }, rules)).toBe('private');
    expect(classify({ ...facts, id: 'allow', privacyStatus: 'unlisted' }, rules)).toBeUndefined();
    expect(classify({ ...facts, id: 'x', liveBroadcastContent: 'upcoming' }, rules)).toBe('live');
    expect(classify({ ...facts, id: 'x', embeddable: false }, rules)).toBe('not_embeddable');
    expect(classify({ ...facts, id: 'x', durationSec: 5000 }, rules)).toBe('too_long');
    expect(classify({ ...facts, id: 'x' }, rules)).toBeUndefined();
  });
});

describe('config placeholders', () => {
  it('ignores {{...}} channels and their stations', () => {
    const cfg = {
      channels: [
        { id: 'UC6ygpyydpFHCJK_KiXRUVNQ', label: { en: 'A', te: 'అ' } },
        { id: '{{CHANNEL_ID_2}}', label: { en: '{{CH2_EN}}', te: '{{CH2_TE}}' } },
      ],
      stations: [
        { id: 'all', freq: '88.5', label: { en: 'All', te: 'అన్ని' }, channels: '*' },
        {
          id: 'ch2',
          freq: '101.7',
          label: { en: '{{CH2_EN}}', te: '{{CH2_TE}}' },
          channels: ['{{CHANNEL_ID_2}}'],
        },
      ],
    } as unknown as StationsConfig;
    expect(activeChannels(cfg).map((c) => c.id)).toEqual(['UC6ygpyydpFHCJK_KiXRUVNQ']);
    expect(activeStations(cfg).map((s) => s.id)).toEqual(['all']);
  });
});

describe('seededShuffle', () => {
  it('is a deterministic permutation', () => {
    const a = seededShuffle([1, 2, 3, 4, 5, 6, 7], 42);
    expect(a).toEqual(seededShuffle([1, 2, 3, 4, 5, 6, 7], 42));
    expect([...a].sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});

describe('parseRss', () => {
  it('extracts ids, titles and dates', () => {
    const xml = `<feed><entry><yt:videoId>abc</yt:videoId><title>శివ &amp; గీతం</title><published>2026-11-01T00:00:00+00:00</published></entry></feed>`;
    expect(parseRss(xml)).toEqual([
      { id: 'abc', title: 'శివ & గీతం', published: '2026-11-01T00:00:00+00:00' },
    ]);
  });
});
