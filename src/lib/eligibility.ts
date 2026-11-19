import type { IneligibleReason, Rules } from './types';

export interface VideoFacts {
  id: string;
  durationSec: number;
  embeddable: boolean;
  privacyStatus: string; // public | unlisted | private
  liveBroadcastContent: string; // none | live | upcoming
}

/**
 * Result of probing https://www.youtube.com/shorts/{id}:
 *  - 'short'     -> 200 (it renders as a Short)
 *  - 'not_short' -> 3xx redirect to /watch
 *  - 'unknown'   -> probe disabled / failed / ambiguous (use the duration rule only)
 */
export type ShortsProbe = 'short' | 'not_short' | 'unknown';

/** Pure eligibility decision. Returns undefined when the video may be played. */
export function classify(
  v: VideoFacts,
  rules: Rules,
  probe: ShortsProbe = 'unknown',
): IneligibleReason | undefined {
  if (rules.denyVideoIds.includes(v.id)) return 'denied';
  const allowed = rules.allowVideoIds.includes(v.id);
  if (!v.embeddable) return 'not_embeddable';
  if (v.privacyStatus !== 'public' && !(allowed && v.privacyStatus === 'unlisted'))
    return 'private';
  if (v.liveBroadcastContent !== 'none') return 'live';
  if (allowed) return undefined; // overrides Shorts + duration filters
  if (v.durationSec <= rules.shortsMaxSeconds && probe !== 'not_short') return 'short';
  if (v.durationSec < rules.minSeconds) return 'too_short';
  if (v.durationSec > rules.maxSeconds) return 'too_long';
  return undefined;
}
