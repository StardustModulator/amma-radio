export type Lang = 'te' | 'en';

const en = {
  onAir: 'ON AIR',
  offAir: 'OFF AIR',
  volume: 'VOLUME',
  station: 'STATION',
  power: 'POWER',
  turnOn: 'Turn on the radio',
  nowPlaying: 'Now playing',
  next: 'Next',
  tuning: 'Tuning…',
  adBreak: 'Ad break',
  remaining: 'left',
  tv: 'TV',
  tvOn: 'Make the picture window bigger',
  tvOff: 'Make the picture window smaller',
  about: 'About',
  close: 'Close',
  aboutBody: 'Music plays through YouTube’s official player; all songs ©',
  aboutSync:
    'Like real radio, everyone hears the same song at the same moment. New songs join automatically.',
  channels: 'YouTube channels',
  language: 'Language',
  pictureWindow: 'Picture window',
  noSongs: 'No songs on air yet. Please check back soon.',
  loading: 'Warming up the valves…',
  volumeValue: 'Volume',
  stationValue: 'Station',
  powerOnLabel: 'Turn radio on',
  powerOffLabel: 'Turn radio off',
  decrease: 'Decrease',
  increase: 'Increase',
  fallbackMode: 'Playing from memory (schedule is being refreshed)',
  mobileNote: 'Keep this page open: phones usually stop YouTube when the screen locks.',
} as const;

export type I18nKey = keyof typeof en;

// Every key must exist in Telugu too (missing key = compile error).
const te: Record<I18nKey, string> = {
  onAir: 'ప్రసారంలో',
  offAir: 'ప్రసారం లేదు',
  volume: 'శబ్దం',
  station: 'స్టేషన్',
  power: 'పవర్',
  turnOn: 'ఆన్ చేయండి',
  nowPlaying: 'ఇప్పుడు వింటున్నారు',
  next: 'తదుపరి',
  tuning: 'ట్యూనింగ్…',
  adBreak: 'ప్రకటన',
  remaining: 'మిగిలింది',
  tv: 'టీవీ',
  tvOn: 'చిత్ర గవాక్షాన్ని పెద్దది చేయండి',
  tvOff: 'చిత్ర గవాక్షాన్ని చిన్నది చేయండి',
  about: 'గురించి',
  close: 'మూసివేయండి',
  aboutBody: 'పాటలు యూట్యూబ్ అధికారిక ప్లేయర్ ద్వారా ప్లే అవుతాయి; అన్ని పాటలు ©',
  aboutSync: 'నిజమైన రేడియోలాగే, అందరూ ఒకే సమయంలో ఒకే పాట వింటారు. కొత్త పాటలు వాటంతట అవే చేరుతాయి.',
  channels: 'యూట్యూబ్ ఛానెల్స్',
  language: 'భాష',
  pictureWindow: 'చిత్ర గవాక్షం',
  noSongs: 'ఇంకా పాటలు ప్రసారంలో లేవు. త్వరలో మళ్ళీ చూడండి.',
  loading: 'వాల్వులు వేడెక్కుతున్నాయి…',
  volumeValue: 'శబ్దం',
  stationValue: 'స్టేషన్',
  powerOnLabel: 'రేడియో ఆన్ చేయండి',
  powerOffLabel: 'రేడియో ఆఫ్ చేయండి',
  decrease: 'తగ్గించు',
  increase: 'పెంచు',
  fallbackMode: 'జ్ఞాపకం నుండి ప్లే అవుతోంది (షెడ్యూల్ నవీకరించబడుతోంది)',
  mobileNote: 'ఈ పేజీని తెరిచే ఉంచండి: స్క్రీన్ లాక్ అయితే ఫోన్లలో యూట్యూబ్ ఆగిపోతుంది.',
};

export const dictionaries: Record<Lang, Record<I18nKey, string>> = { en, te };

export function t(lang: Lang, key: I18nKey): string {
  return dictionaries[lang][key];
}
