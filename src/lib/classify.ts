// Pure classification of a video into (mode, language, moods).
// Priority: manual override > playlist membership > title clues > channel defaults.
import type {
  ChannelConfig,
  Classification,
  ClassificationOverride,
  LangCode,
  Mode,
  Mood,
  PlaylistConfig,
} from './types';

const TELUGU = /[\u0C00-\u0C7F]/;
const DEVANAGARI = /[\u0900-\u097F]/;

const has = (title: string, re: RegExp) => re.test(title.toLowerCase());

// Explicit language words in a title ("... Hindi Song", "telugu song", "Canción en español").
const LANG_WORDS: [LangCode, RegExp][] = [
  ['hi', /\bhindi\b|हिन्दी|हिंदी/],
  ['te', /\btelugu\b|తెలుగు/],
  ['es', /\bspanish\b|\bespañol\b|\bespanol\b|\ben español\b|\bcanci[oó]n\b/],
  ['fr', /\bfrench\b|\bfran[cç]ais(e)?\b|\bchanson\b/],
  ['en', /\benglish\b/],
];

// Small English vocabulary: a title made only of these words is treated as English.
const ENGLISH_WORDS = new Set(
  (
    'a an and the of to in on for with my your our is are be happy new year song songs music kids kid ' +
    'child children dream dreams love life day night good morning evening fun ultimate story stories ' +
    'mother mom amma father friend friends home heart sweet little baby birthday school dance party ' +
    'world sun moon star stars rain sky go we you me i it this that time best'
  ).split(' '),
);

const STORY_WORDS =
  /\bstory\b|\bstories\b|\bkatha\b|కథ|कहानी|कथा|\bhistoria\b|\bcuento\b|\bhistoire\b|\bconte\b/;

const MOOD_WORDS: [Mood, RegExp][] = [
  ['fearful', /horror|fear|scary|ghost|haunted|దెయ్య|భయ|భూత|डर|भूत|miedo|terror|peur|fantôme/],
  ['emotional', /emotional|sad|tears|భావోద్వేగ|కన్నీ|भावुक|दर्द|emocional|émouvant|triste/],
  ['heart-touching', /heart[\s-]?touching|touching|హృదయ|దిల్|दिल छू|दिल को छू|conmovedor|touchant/],
];

/** Language from the title alone; undefined when there is no clue. */
export function detectLanguage(title: string): { lang: LangCode; why: string } | undefined {
  const t = title.toLowerCase();
  for (const [lang, re] of LANG_WORDS) if (re.test(t)) return { lang, why: `title says ${lang}` };
  if (TELUGU.test(title)) return { lang: 'te', why: 'Telugu script' };
  if (DEVANAGARI.test(title)) return { lang: 'hi', why: 'Devanagari script' };
  if (/[ñ¿¡]/.test(t)) return { lang: 'es', why: 'Spanish characters' };
  if (/[çœèêàù]/.test(t)) return { lang: 'fr', why: 'French characters' };
  const words = t
    .replace(/[^\p{L}\s']/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (words.length >= 2 && words.every((w) => ENGLISH_WORDS.has(w))) {
    return { lang: 'en', why: 'all-English words' };
  }
  return undefined;
}

export function detectMoods(title: string): Mood[] {
  return MOOD_WORDS.filter(([, re]) => has(title, re)).map(([m]) => m);
}

export function looksLikeStory(title: string): boolean {
  return has(title, STORY_WORDS);
}

export interface ClassifyInput {
  id: string;
  title: string;
  channelId: string;
}

export interface ClassifyContext {
  channels: readonly ChannelConfig[];
  playlists: readonly PlaylistConfig[];
  /** playlistId → video IDs currently in it */
  membership: Readonly<Record<string, readonly string[]>>;
  overrides: Readonly<Record<string, ClassificationOverride>>;
}

export function classifyVideo(v: ClassifyInput, ctx: ClassifyContext): Classification {
  const why: string[] = [];
  const channel = ctx.channels.find((c) => c.id === v.channelId);
  const playlist = ctx.playlists.find((p) => ctx.membership[p.id]?.includes(v.id));
  const ov = ctx.overrides[v.id];
  const titleLang = detectLanguage(v.title);

  // mode
  let mode: Mode;
  if (ov?.mode) {
    mode = ov.mode;
    why.push('mode: override');
  } else if (channel?.lockMode && channel.mode) {
    mode = channel.mode;
    why.push('mode: channel (locked)');
  } else if (playlist) {
    mode = playlist.mode;
    why.push(`mode: playlist ${playlist.id}`);
  } else if ((channel?.detectStories ?? true) && looksLikeStory(v.title)) {
    mode = 'stories';
    why.push('mode: title looks like a story');
  } else {
    mode = channel?.mode ?? 'songs';
    why.push('mode: channel default');
  }

  // language
  let lang: LangCode;
  if (ov?.language) {
    lang = ov.language;
    why.push('lang: override');
  } else if (channel?.lockMode && channel.language && channel.language !== 'auto') {
    lang = channel.language;
    why.push('lang: channel (locked)');
  } else if (playlist && playlist.language !== 'auto') {
    lang = playlist.language;
    why.push(`lang: playlist ${playlist.id}`);
  } else if (channel?.language && channel.language !== 'auto') {
    lang = channel.language;
    why.push('lang: channel setting');
  } else if (titleLang && (!channel?.languages || channel.languages.includes(titleLang.lang))) {
    lang = titleLang.lang;
    why.push(`lang: ${titleLang.why}`);
  } else {
    lang = channel?.defaultLanguage ?? 'te';
    why.push('lang: channel default (no clue in title)');
  }

  // moods
  const moods = new Set<Mood>(ov?.moods ?? []);
  if (!ov?.moods) {
    for (const m of playlist?.moods ?? []) moods.add(m);
    for (const m of detectMoods(v.title)) moods.add(m);
  }
  return { mode, lang, moods: [...moods], why: why.join('; ') };
}
