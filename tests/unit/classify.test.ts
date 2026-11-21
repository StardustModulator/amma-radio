import { describe, expect, it } from 'vitest';
import { classifyVideo, detectLanguage, detectMoods, looksLikeStory } from '../../src/lib/classify';
import { activeStations } from '../../src/lib/config';
import { generateStations, selectStation, stationId } from '../../src/lib/stations';
import { stationIncludes } from '../../src/lib/schedule';
import { stationIsEmpty } from '../../src/useRadio';
import type {
  ChannelConfig,
  PlaylistConfig,
  ScheduleFile,
  StationsConfig,
} from '../../src/lib/types';

const CH = 'UC6ygpyydpFHCJK_KiXRUVNQ';
const channels: ChannelConfig[] = [
  { id: CH, label: { en: 'A', te: 'అ' }, mode: 'songs', language: 'auto', defaultLanguage: 'te' },
];
const ctx = { channels, playlists: [] as PlaylistConfig[], membership: {}, overrides: {} };
const lang = (title: string) => classifyVideo({ id: 'x', title, channelId: CH }, ctx).lang;

describe('language detection (her real titles)', () => {
  it('uses script first', () => {
    expect(lang('శివ నామమే మధురాతి మధురము')).toBe('te');
    expect(lang('लहरों की मीठी धुन सुनता हूँ ✨Most Romantic Melody')).toBe('hi');
  });
  it('uses explicit language words', () => {
    expect(lang('Kal Raat Ek Sapna Aaya 🌙  Hindi Romantic Song')).toBe('hi');
    expect(lang('child dream English song')).toBe('en');
    expect(lang('happy child telugu song')).toBe('te');
    expect(lang('Canción de cuna en español')).toBe('es');
    expect(lang('Une chanson française')).toBe('fr');
  });
  it('detects all-English titles and falls back to the channel default', () => {
    expect(lang('happy new year, happy new year')).toBe('en');
    expect(lang('narayana seranu')).toBe('te');
    expect(detectLanguage('gokarna shivaya namah')).toBeUndefined();
  });
});

describe('mode + moods', () => {
  it('everything on the channel is Songs unless the title says story', () => {
    expect(classifyVideo({ id: 'a', title: 'శివ గీతం', channelId: CH }, ctx).mode).toBe('songs');
    expect(
      classifyVideo({ id: 'b', title: 'అమ్మ కథ - emotional story', channelId: CH }, ctx),
    ).toMatchObject({
      mode: 'stories',
      lang: 'te',
      moods: ['emotional'],
    });
    expect(looksLikeStory('भूतिया कहानी')).toBe(true);
    expect(detectMoods('Heart touching దెయ్యం story')).toEqual(['fearful', 'heart-touching']);
  });
  it('playlist membership and overrides win', () => {
    const playlists: PlaylistConfig[] = [
      {
        id: 'PLabc1234567890',
        label: { en: 'x', te: 'x' },
        mode: 'stories',
        language: 'hi',
        moods: ['emotional'],
      },
    ];
    const c2 = {
      ...ctx,
      playlists,
      membership: { PLabc1234567890: ['p1'] },
      overrides: { o1: { mode: 'stories' as const, language: 'fr' as const } },
    };
    expect(classifyVideo({ id: 'p1', title: 'శివ గీతం', channelId: CH }, c2)).toMatchObject({
      mode: 'stories',
      lang: 'hi',
      moods: ['emotional'],
    });
    expect(classifyVideo({ id: 'o1', title: 'శివ గీతం', channelId: CH }, c2)).toMatchObject({
      mode: 'stories',
      lang: 'fr',
    });
  });
});

describe('station grid + selection', () => {
  const stations = generateStations();
  it('has songs and stories for all five languages, plus story moods', () => {
    expect(stations).toHaveLength(25);
    expect(stations.map((s) => s.id)).toEqual(
      expect.arrayContaining(['songs-te', 'songs-fr', 'stories-es', 'stories-hi-fearful']),
    );
    expect(new Set(stations.map((s) => s.id)).size).toBe(25);
    expect(activeStations({ channels } as unknown as StationsConfig)).toHaveLength(25);
  });
  it('each language sits at its own dial position', () => {
    const songs = stations.filter((s) => s.mode === 'songs').map((s) => Number(s.freq));
    expect(new Set(songs).size).toBe(5);
    songs.forEach((f) => expect(f).toBeGreaterThanOrEqual(88));
    songs.forEach((f) => expect(f).toBeLessThanOrEqual(108));
  });
  it('selects the right station and ignores moods for songs', () => {
    expect(selectStation(stations, 'songs', 'hi')?.id).toBe('songs-hi');
    expect(selectStation(stations, 'songs', 'hi', 'fearful')?.id).toBe('songs-hi');
    expect(selectStation(stations, 'stories', 'te', 'fearful')?.id).toBe('stories-te-fearful');
    expect(selectStation(stations, 'stories', 'te', 'all')?.id).toBe('stories-te');
    expect(stationId('stories', 'fr', 'heart-touching')).toBe('stories-fr-heart-touching');
  });
  it('stationIncludes matches mode, language and mood', () => {
    const st = selectStation(stations, 'stories', 'te', 'fearful')!;
    expect(
      stationIncludes(st, { channelId: CH, mode: 'stories', lang: 'te', moods: ['fearful'] }),
    ).toBe(true);
    expect(stationIncludes(st, { channelId: CH, mode: 'stories', lang: 'te', moods: [] })).toBe(
      false,
    );
    expect(
      stationIncludes(st, { channelId: CH, mode: 'songs', lang: 'te', moods: ['fearful'] }),
    ).toBe(false);
    const songsTe = selectStation(stations, 'songs', 'te')!;
    expect(stationIncludes(songsTe, { channelId: CH, lang: 'te' })).toBe(true); // mode defaults to songs
  });
  it('empty stations are detected for the "Coming soon" state', () => {
    const sched: ScheduleFile = {
      version: 1,
      generatedAt: 0,
      epoch: 0,
      stations: {
        'songs-te': { stationId: 'songs-te', slots: [{ id: 'a', start: 0, dur: 100 }] },
        'stories-te': { stationId: 'stories-te', slots: [] },
      },
      fallbackOrder: { 'songs-te': ['a'], 'stories-te': [] },
    };
    expect(stationIsEmpty(sched, 'songs-te')).toBe(false);
    expect(stationIsEmpty(sched, 'stories-te')).toBe(true);
    expect(stationIsEmpty(sched, 'songs-fr')).toBe(true);
  });
});
