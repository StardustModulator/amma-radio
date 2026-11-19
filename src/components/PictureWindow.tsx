import { forwardRef, type RefObject } from 'react';

interface Props {
  tv: boolean;
  onToggleTv: () => void;
  tvLabel: string;
  tvAria: string;
  title: string;
  playerHostRef: RefObject<HTMLDivElement>;
}

/**
 * The visible YouTube player (YouTube RMF: ≥200×200, nothing on top of it, playback only while
 * at least half of it is on screen). Decorations sit AROUND it (bezel padding), never over it.
 */
export const PictureWindow = forwardRef<HTMLDivElement, Props>(function PictureWindow(
  { tv, onToggleTv, tvLabel, tvAria, title, playerHostRef },
  ref,
) {
  return (
    <div className={`picture ${tv ? 'picture--tv' : ''}`}>
      <div className="picture__bezel">
        <div
          className="picture__glass"
          ref={ref}
          data-testid="picture-window"
          aria-label={title}
          role="region"
        >
          <div ref={playerHostRef} id="yt-player" />
        </div>
      </div>
      <button
        type="button"
        className="tv-toggle"
        aria-pressed={tv}
        aria-label={tvAria}
        onClick={onToggleTv}
      >
        {tvLabel}
      </button>
    </div>
  );
});
