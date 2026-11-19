export interface SessionMeta {
  title: string;
  artist: string;
  album: string;
  videoId: string;
}

export function setMediaMetadata(m: SessionMeta | undefined): void {
  if (!('mediaSession' in navigator)) return;
  try {
    navigator.mediaSession.metadata = m
      ? new MediaMetadata({
          title: m.title,
          artist: m.artist,
          album: m.album,
          artwork: [
            {
              src: `https://i.ytimg.com/vi/${m.videoId}/hqdefault.jpg`,
              sizes: '480x360',
              type: 'image/jpeg',
            },
            {
              src: `https://i.ytimg.com/vi/${m.videoId}/maxresdefault.jpg`,
              sizes: '1280x720',
              type: 'image/jpeg',
            },
          ],
        })
      : null;
  } catch {
    /* best effort */
  }
}

export function setMediaHandlers(h: {
  play: () => void;
  pause: () => void;
  next: () => void;
  prev: () => void;
}): void {
  if (!('mediaSession' in navigator)) return;
  const set = (a: MediaSessionAction, fn: () => void) => {
    try {
      navigator.mediaSession.setActionHandler(a, fn);
    } catch {
      /* unsupported action */
    }
  };
  set('play', h.play);
  set('pause', h.pause);
  set('nexttrack', h.next);
  set('previoustrack', h.prev);
}
