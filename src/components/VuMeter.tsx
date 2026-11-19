import { useEffect, useRef } from 'react';
import { makeVuSignal } from '../lib/vu';

interface Props {
  active: boolean;
  volume: number;
  seed: number;
  reducedMotion: boolean;
}

/** Decorative simulated VU meter. Also exposes the level as --vu on <html> for the grille. */
export function VuMeter({ active, volume, seed, reducedMotion }: Props) {
  const needle = useRef<SVGGElement>(null);
  useEffect(() => {
    const signal = makeVuSignal(seed);
    let raf = 0;
    let level = 0;
    const t0 = performance.now();
    const frame = () => {
      const target =
        active && volume > 0
          ? signal((performance.now() - t0) / 1000) * (0.35 + 0.65 * (volume / 100))
          : 0;
      level += (target - level) * (reducedMotion ? 0.04 : 0.18);
      const angle = -48 + level * 96;
      needle.current?.setAttribute('transform', `rotate(${angle.toFixed(2)} 100 108)`);
      document.documentElement.style.setProperty('--vu', level.toFixed(3));
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [active, volume, seed, reducedMotion]);

  return (
    <div className="vu" aria-hidden="true">
      <svg viewBox="0 0 200 120" className="vu__svg">
        <rect x="2" y="2" width="196" height="116" rx="10" className="vu__face" />
        <path d="M 30 70 A 85 85 0 0 1 150 40" className="vu__arc" />
        <path d="M 150 40 A 85 85 0 0 1 172 70" className="vu__arc vu__arc--red" />
        {[-48, -32, -16, 0, 16, 32, 48].map((a) => (
          <line
            key={a}
            x1="100"
            y1="30"
            x2="100"
            y2="38"
            className="vu__tick"
            transform={`rotate(${a} 100 108)`}
          />
        ))}
        <text x="34" y="92" className="vu__txt">
          -20
        </text>
        <text x="94" y="20" className="vu__txt">
          0
        </text>
        <text x="160" y="92" className="vu__txt vu__txt--red">
          +3
        </text>
        <text x="100" y="104" className="vu__vu" textAnchor="middle">
          VU
        </text>
        <g ref={needle} transform="rotate(-48 100 108)">
          <line x1="100" y1="108" x2="100" y2="26" className="vu__needle" />
        </g>
        <circle cx="100" cy="108" r="6" className="vu__pivot" />
      </svg>
    </div>
  );
}
