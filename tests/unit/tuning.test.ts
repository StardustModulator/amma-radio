import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { withChannelFallback } from '../../scripts/refresh';
import { classifyVideo } from '../../src/lib/classify';
import { classify } from '../../src/lib/eligibility';
import { stationIncludes } from '../../src/lib/schedule';
import {
  dialOrder,
  generateStations,
  mainStationOf,
  selectStation,
  stationFreq,
  stepStation,
} from '../../src/lib/stations';
import { staticGain } from '../../src/lib/tuning-static';
import type {
  CatalogItem,
  ChannelConfig,
  PlaylistConfig,
  Rules,
  StationsConfig,
} from '../../src/lib/types';

const SONGS = 'UC6ygpyydpFHCJK_KiXRUVNQ';
const TE_STORIES = 'UCRVSCAEXnJsDOn3yPQo3gPA';
const EN_STORIES = 'UCQKMrYMfL82ZV2XNAM9IkAw';
const config = JSON.parse(
  readFileSync(join(__dirname, '../../config/stations.json'), 'utf8'),
) as StationsConfig;
const chan = (id: string) => config.channels.find((c) => c.id === id) as ChannelConfig;

describe('one shared dial: SONGS band then STORIES band', () => {
  const stations = generateStations();
  const order = dialOrder(stations);
  it('lists the 10 mode × language stations in frequency order, songs first', () => {
    expect(order.map((s) => s.id)).toEqual([
      'songs-te',
      'songs-hi',
      'songs-en',
      'songs-es',
      'songs-fr',
      'stories-te',
      'stories-hi',
      'stories-en',
      'stories-es',
      'stories-fr',
    ]);
    const fs = order.map((s) => Number(s.freq));
    expect([...fs].sort((a, b) => a - b)).toEqual(fs);
  });
  it('every station (moods too) has a unique frequency inside 88–108 MHz', () => {
    const fs = stations.map((s) => Number(s.freq));
    expect(new Set(fs).size).toBe(stations.length);
    fs.forEach((f) => {
      expect(f).toBeGreaterThanOrEqual(88);
      expect(f).toBeLessThanOrEqual(108);
    });
    expect(stationFreq('songs', 'te')).toBe('88.6');
    expect(stationFreq('stories', 'te')).toBe('98.2');
    // moods sit between their language and the next one
    expect(Number(stationFreq('stories', 'te', 'heart-touching'))).toBeLessThan(
      Number(stationFreq('stories', 'hi')),
    );
  });
  it('◀ ▶ step across bands and wrap around', () => {
    expect(stepStation(order, 'songs-fr', 1)?.id).toBe('stories-te');
    expect(stepStation(order, 'stories-te', -1)?.id).toBe('songs-fr');
    expect(stepStation(order, 'stories-fr', 1)?.id).toBe('songs-te');
    expect(stepStation(order, 'songs-te', -1)?.id).toBe('stories-fr');
    expect(stepStation(order, 'songs-te', 2)?.id).toBe('songs-en');
    expect(stepStation(order, undefined, 1)?.id).toBe('songs-te');
  });
  it('skips stations with nothing on air (unless all are empty)', () => {
    const full = new Set(['songs-te', 'songs-en', 'stories-te', 'stories-es']);
    const empty = (id: string) => !full.has(id);
    expect(stepStation(order, 'songs-en', 1, empty)?.id).toBe('stories-te');
    expect(stepStation(order, 'stories-te', 1, empty)?.id).toBe('stories-es');
    expect(stepStation(order, 'stories-es', 1, empty)?.id).toBe('songs-te');
    expect(stepStation(order, 'songs-te', -1, empty)?.id).toBe('stories-es');
    expect(stepStation(order, 'songs-te', 1, () => true)?.id).toBe('songs-hi');
  });
  it('a mood station belongs to its language on the dial', () => {
    const mood = selectStation(stations, 'stories', 'te', 'fearful');
    expect(mainStationOf(stations, mood)?.id).toBe('stories-te');
    expect(mainStationOf(stations, selectStation(stations, 'songs', 'hi'))?.id).toBe('songs-hi');
  });
});

describe('tuning static', () => {
  it('follows the volume knob and is silent when off or muted', () => {
    expect(staticGain(70, false)).toBe(0);
    expect(staticGain(0, true)).toBe(0);
    expect(staticGain(100, true)).toBeCloseTo(0.3);
    expect(staticGain(50, true)).toBeCloseTo(0.15);
    expect(staticGain(25, true)).toBeLessThan(staticGain(80, true));
  });
});

describe("Amma's story channels (config/stations.json)", () => {
  const ctx = {
    channels: config.channels,
    playlists: [
      { id: 'PLsongsHindiXXXX', label: { en: 'x', te: 'x' }, mode: 'songs', language: 'hi' },
    ] as PlaylistConfig[],
    membership: { PLsongsHindiXXXX: ['teStory1'] },
    overrides: {},
  };
  it('Telugu stories channel → always Telugu Stories, even with song-like titles or playlists', () => {
    for (const title of ['అగాధం లోకి', 'comedy track 2', 'Hindi song remix', 'FoodComedy 1']) {
      const c = classifyVideo({ id: 'teStory1', title, channelId: TE_STORIES }, ctx);
      expect([c.mode, c.lang]).toEqual(['stories', 'te']);
    }
  });
  it('English stories channel → English, or Spanish/French when the title clearly says so', () => {
    const c = (title: string) => classifyVideo({ id: 'v', title, channelId: EN_STORIES }, ctx);
    expect(c('The Perfect Song For Your Fiancée 💍  My Beautiful Dream')).toMatchObject({
      mode: 'stories',
      lang: 'en',
    });
    expect(c('Un cuento en español para dormir')).toMatchObject({ mode: 'stories', lang: 'es' });
    expect(c('Une histoire en français')).toMatchObject({ mode: 'stories', lang: 'fr' });
    // Telugu/Hindi clues can't move it out of en/es/fr
    expect(c('Telugu story in English')).toMatchObject({ lang: 'en' });
    expect(c('हिन्दी कहानी')).toMatchObject({ lang: 'en' });
  });
  it('the songs channel is unchanged', () => {
    const c = classifyVideo({ id: 'v', title: 'శివ నామమే', channelId: SONGS }, ctx);
    expect([c.mode, c.lang]).toEqual(['songs', 'te']);
  });
  it('long stories (49 min) and short non-Shorts clips are allowed on the Telugu stories channel', () => {
    const rules = { ...config.rules, ...chan(TE_STORIES).rules } as Rules;
    const v = { embeddable: true, privacyStatus: 'public', liveBroadcastContent: 'none' };
    expect(classify({ ...v, id: 'a', durationSec: 2939 }, rules, 'not_short')).toBeUndefined();
    expect(classify({ ...v, id: 'b', durationSec: 55 }, rules, 'not_short')).toBeUndefined();
    expect(classify({ ...v, id: 'c', durationSec: 55 }, rules, 'short')).toBe('short');
    // global rules still cap the songs channel
    expect(classify({ ...v, id: 'a', durationSec: 2939 }, config.rules, 'not_short')).toBe(
      'too_long',
    );
  });
});

describe('Spanish/French Stories fall back to the English stories channel', () => {
  const stations = generateStations();
  const item = (id: string, channelId: string, lang: 'en' | 'es' | 'te'): CatalogItem => ({
    id,
    channelId,
    title: id,
    publishedAt: '2026-01-01T00:00:00Z',
    durationSec: 200,
    thumb: '',
    eligible: true,
    firstSeenAt: '1970-01-01T00:00:00Z',
    lastCheckedAt: '2026-01-01T00:00:00Z',
    mode: 'stories',
    lang,
    moods: [],
  });
  const st = (id: string) => stations.find((s) => s.id === id)!;
  it('empty es/fr stations play the English stories channel', () => {
    const items = [item('en1', EN_STORIES, 'en'), item('te1', TE_STORIES, 'te')];
    for (const id of ['stories-es', 'stories-fr']) {
      const fb = withChannelFallback(st(id), items, config.channels);
      expect(fb.id).toBe(id);
      expect(fb.channels).toEqual([EN_STORIES]);
      expect(items.filter((c) => stationIncludes(fb, c)).map((c) => c.id)).toEqual(['en1']);
    }
  });
  it('stops borrowing once the language has its own videos; never applies elsewhere', () => {
    const items = [item('en1', EN_STORIES, 'en'), item('es1', EN_STORIES, 'es')];
    expect(withChannelFallback(st('stories-es'), items, config.channels)).toBe(st('stories-es'));
    expect(withChannelFallback(st('stories-hi'), items, config.channels)).toBe(st('stories-hi'));
    expect(withChannelFallback(st('songs-es'), items, config.channels)).toBe(st('songs-es'));
    expect(withChannelFallback(st('stories-fr-fearful'), items, config.channels)).toBe(
      st('stories-fr-fearful'),
    );
  });
});
