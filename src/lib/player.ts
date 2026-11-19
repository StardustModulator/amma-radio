// YouTube IFrame API loader + thin wrapper. Audio ONLY ever plays through the official player.

let apiPromise: Promise<typeof YT> | undefined;

export function loadYouTubeApi(): Promise<typeof YT> {
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    if (window.YT?.Player) return resolve(window.YT);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      if (window.YT) resolve(window.YT);
    };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.async = true;
    s.onerror = () => {
      apiPromise = undefined;
      reject(new Error('Could not load the YouTube player'));
    };
    document.head.appendChild(s);
  });
  return apiPromise;
}

/** Error codes that mean "this video can't play here" → skip to the deterministic filler. */
export const SKIP_ERROR_CODES = new Set([2, 5, 100, 101, 150]);

export interface PlayerHandlers {
  onReady: () => void;
  onStateChange: (state: number) => void;
  onError: (code: number) => void;
}

export async function createPlayer(el: HTMLElement, h: PlayerHandlers): Promise<YT.Player> {
  const yt = await loadYouTubeApi();
  return new yt.Player(el, {
    width: '100%',
    height: '100%',
    host: 'https://www.youtube.com',
    playerVars: {
      controls: 0,
      disablekb: 1,
      modestbranding: 1,
      rel: 0,
      playsinline: 1,
      iv_load_policy: 3,
      fs: 0,
      origin: window.location.origin,
    },
    events: {
      onReady: () => h.onReady(),
      onStateChange: (e) => h.onStateChange(e.data),
      onError: (e) => h.onError(e.data),
    },
  });
}
