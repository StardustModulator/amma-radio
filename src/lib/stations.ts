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

/** Dial positions per language (MHz on the 88–108 scale). */
export const LANG_FREQ: Record<LangCode, number> = {
  te: 88.6,
  hi: 93.2,
  en: 97.8,
  es: 102.4,
  fr: 107,
};

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
        freq: LANG_FREQ[lang].toFixed(1),
        label: {
          en: `${LANG_EN[lang]} ${MODE_LABEL[mode].en}`,
          te: `${LANG_TE[lang]} ${MODE_LABEL[mode].te}`,
        },
      });
      if (mode === 'stories') {
        MOODS.forEach((mood, i) =>
          out.push({
            ...base,
            mood,
            id: stationId(mode, lang, mood),
            freq: (LANG_FREQ[lang] + 0.6 * (i + 1)).toFixed(1),
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
