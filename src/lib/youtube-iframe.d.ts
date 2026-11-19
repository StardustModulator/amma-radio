// Minimal typings for the YouTube IFrame Player API (https://developers.google.com/youtube/iframe_api_reference).
declare namespace YT {
  interface PlayerEvent {
    target: Player;
  }
  interface OnStateChangeEvent extends PlayerEvent {
    data: number;
  }
  interface OnErrorEvent extends PlayerEvent {
    data: number;
  }
  interface PlayerOptions {
    width?: string | number;
    height?: string | number;
    videoId?: string;
    host?: string;
    playerVars?: Record<string, string | number>;
    events?: {
      onReady?: (e: PlayerEvent) => void;
      onStateChange?: (e: OnStateChangeEvent) => void;
      onError?: (e: OnErrorEvent) => void;
    };
  }
  class Player {
    constructor(el: HTMLElement | string, opts: PlayerOptions);
    loadVideoById(o: { videoId: string; startSeconds?: number }): void;
    seekTo(seconds: number, allowSeekAhead: boolean): void;
    playVideo(): void;
    pauseVideo(): void;
    stopVideo(): void;
    getCurrentTime(): number;
    getDuration(): number;
    getPlayerState(): number;
    setVolume(v: number): void;
    mute(): void;
    unMute(): void;
    destroy(): void;
    getIframe(): HTMLIFrameElement;
  }
  const PlayerState: { UNSTARTED: -1; ENDED: 0; PLAYING: 1; PAUSED: 2; BUFFERING: 3; CUED: 5 };
}

interface Window {
  YT?: typeof YT;
  onYouTubeIframeAPIReady?: () => void;
}
