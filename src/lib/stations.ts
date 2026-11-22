// Generated station grid: every mode × language is its own synced station; Stories also get
// one station per mood. The dial frequency depends on the language (and mood, slightly).
import type { LangCode, Mode, Mood, StationConfig } from './types';
import { LANGS, MODES, MOODS } from './types';

export const LANG_NATIVE: Record<LangCode, string> = {
  te: 'తెలుగు',
  hi: 'हिन्दी',
  en: 'English',
  es: 'Español',
  fr: 'Français',
};
const LANG_TE: Record<LangCode, string> = {
  te: 'తెలుగు',
  hi: 'హిందీ',
  en: 'ఇంగ్లీష్',
  es: 'స్పానిష్',
  fr: 'ఫ్రెంచ్',
};
const LANG_EN: Record<LangCode, string> = {
  te: 'Telugu',
  hi: 'Hindi',
  en: 'English',
  es: 'Spanish',
  fr: 'French',
};
export const MOOD_LABEL: Record<Mood | 'all', { en: string; te: string }> = {
  all: { en: 'All', te: 'అన్నీ' },
  emotional: { en: 'Emotional', te: 'భావోద్వేగ' },
  fearful: { en: 'Fearful / Horror', te: 'భయానక' },
  'heart-touching': { en: 'Heart-touching', te: 'హృదయాన్ని తాకే' },
};
export const MODE_LABEL: Record<Mode, { en: string; te: string }> = {
  songs: { en: 'Songs', te: 'పాటలు' },
  stories: { en: 'Stories', te: 'కథలు' },
};

/**
 * One shared 88–108 MHz dial, like a real set: the SONGS band sits on the left half,
 * the STORIES band on the right half, five languages each (story moods sit just above
 * their language: +0.4 / +0.8 / +1.2 MHz).
 */
export const BAND_START: Record<Mode, number> = { songs: 88.6, stories: 98.2 };
export const LANG_STEP = 1.8;
export const MOOD_STEP = 0.4;

export function stationFreq(mode: Mode, lang: LangCode, mood?: Mood): string {
  const i = Math.max(0, LANGS.indexOf(lang));
  const m = mood ? MOODS.indexOf(mood) + 1 : 0;
  return (BAND_START[mode] + LANG_STEP * i + MOOD_STEP * m).toFixed(1);
}

export function stationId(mode: Mode, lang: LangCode, mood?: Mood): string {
  return mood ? `${mode}-${lang}-${mood}` : `${mode}-${lang}`;
}

export function generateStations(langs: readonly LangCode[] = LANGS): StationConfig[] {
  const out: StationConfig[] = [];
  for (const mode of MODES) {
    for (const lang of langs) {
      const base = {
        channels: '*' as const,
        mode,
        lang,
      };
      out.push({
        ...base,
        id: stationId(mode, lang),
        freq: stationFreq(mode, lang),
        label: {
          en: `${LANG_EN[lang]} ${MODE_LABEL[mode].en}`,
          te: `${LANG_TE[lang]} ${MODE_LABEL[mode].te}`,
        },
      });
      if (mode === 'stories') {
        MOODS.forEach((mood) =>
          out.push({
            ...base,
            mood,
            id: stationId(mode, lang, mood),
            freq: stationFreq(mode, lang, mood),
            label: {
              en: `${LANG_EN[lang]} Stories · ${MOOD_LABEL[mood].en}`,
              te: `${LANG_TE[lang]} కథలు · ${MOOD_LABEL[mood].te}`,
            },
          }),
        );
      }
    }
  }
  return out;
}

/** Pick the station for a UI selection; falls back to the mood-less station. */
export function selectStation(
  stations: readonly StationConfig[],
  mode: Mode,
  lang: LangCode,
  mood: Mood | 'all' = 'all',
): StationConfig | undefined {
  const wantMood = mode === 'stories' && mood !== 'all' ? mood : undefined;
  return (
    stations.find((s) => s.mode === mode && s.lang === lang && s.mood === wantMood) ??
    stations.find((s) => s.mode === mode && s.lang === lang && !s.mood)
  );
}

/** The stations the tuning dial / ◀ ▶ buttons step through: every mode × language, by frequency. */
export function dialOrder(stations: readonly StationConfig[]): StationConfig[] {
  return stations.filter((s) => !s.mood).sort((a, b) => Number(a.freq) - Number(b.freq));
}

/**
 * Next station on the dial in direction `delta` (wraps around). Stations for which
 * `isEmpty` is true are skipped, unless every station is empty.
 */
export function stepStation(
  order: readonly StationConfig[],
  currentId: string | undefined,
  delta: number,
  isEmpty: (id: string) => boolean = () => false,
): StationConfig | undefined {
  const n = order.length;
  if (!n) return undefined;
  const dir = delta < 0 ? -1 : 1;
  const steps = Math.max(1, Math.abs(Math.trunc(delta)));
  let i = order.findIndex((s) => s.id === currentId);
  if (i < 0) i = dir > 0 ? -1 : 0;
  const anyFull = order.some((s) => !isEmpty(s.id));
  for (let k = 0; k < steps; k++) {
    for (let tries = 0; tries < n; tries++) {
      i = (((i + dir) % n) + n) % n;
      if (!anyFull || !isEmpty((order[i] as StationConfig).id)) break;
    }
  }
  return order[i];
}

/** The main (mood-less) station a selection belongs to, for the dial needle. */
export function mainStationOf(
  stations: readonly StationConfig[],
  station: StationConfig | undefined,
): StationConfig | undefined {
  if (!station?.mood) return station;
  return stations.find((s) => !s.mood && s.mode === station.mode && s.lang === station.lang);
}
