import { mulberry32 } from './shuffle';

/**
 * YouTube exposes no audio data, so the VU meter is simulated: a smooth pseudo-random signal
 * seeded by the slot start (so it's the same "performance" for everyone), scaled by volume.
 * Returns 0..1.
 */
export function makeVuSignal(seed: number): (tSec: number) => number {
  const r = mulberry32(seed);
  const parts = Array.from({ length: 4 }, () => ({
    f: 0.3 + r() * 2.2,
    p: r() * Math.PI * 2,
    a: 0.08 + r() * 0.12,
  }));
  const beat = 1.6 + r() * 0.8;
  return (t) => {
    let v = 0.42;
    for (const { f, p, a } of parts) v += a * Math.sin(2 * Math.PI * f * t + p);
    v += 0.12 * Math.max(0, Math.sin(2 * Math.PI * beat * t)) ** 6;
    return Math.min(1, Math.max(0, v));
  };
}
