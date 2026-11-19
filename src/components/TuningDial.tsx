import type { ReactNode } from 'react';
import type { StationConfig } from '../lib/types';

const MIN = 88;
const MAX = 108;
export const freqToPct = (f: number) =>
  ((Math.min(MAX, Math.max(MIN, f)) - MIN) / (MAX - MIN)) * 100;

interface Props {
  stations: StationConfig[];
  currentFreq: number;
  powered: boolean;
  lang: 'te' | 'en';
  children?: ReactNode;
}

export function TuningDial({ stations, currentFreq, powered, lang, children }: Props) {
  const ticks = [];
  for (let f = MIN; f <= MAX; f += 0.5) {
    const x = 20 + (freqToPct(f) / 100) * 560;
    const major = f % 4 === 0;
    const mid = Number.isInteger(f);
    ticks.push(
      <line
        key={f}
        x1={x}
        x2={x}
        y1={14}
        y2={major ? 34 : mid ? 28 : 22}
        className={major ? 'tick tick--major' : 'tick'}
      />,
    );
    if (major)
      ticks.push(
        <text key={`t${f}`} x={x} y={50} className="dial__num" textAnchor="middle">
          {f}
        </text>,
      );
  }
  const pct = freqToPct(currentFreq);
  return (
    <div className={`dial ${powered ? 'dial--on' : ''}`}>
      <div className="dial__scale">
        <svg
          viewBox="0 0 600 92"
          preserveAspectRatio="none"
          aria-hidden="true"
          className="dial__svg"
        >
          <line x1="20" x2="580" y1="14" y2="14" className="tick" />
          {ticks}
          <text x="590" y="50" className="dial__unit" textAnchor="end">
            MHz
          </text>
        </svg>
        <div className="dial__stations" aria-hidden="true">
          {stations.map((s) => (
            <span
              key={s.id}
              className={`dial__station ${Number(s.freq) === currentFreq ? 'dial__station--active' : ''}`}
              style={{ left: `${freqToPct(Number(s.freq))}%` }}
            >
              <b>{s.freq}</b>
              <span lang={lang}>{s.label[lang]}</span>
            </span>
          ))}
        </div>
        <div
          className="dial__needle-track"
          style={{ transform: `translateX(${pct}%)` }}
          data-testid="needle"
          data-freq={currentFreq}
        >
          <span className="dial__needle" />
        </div>
      </div>
      <div className="dial__card">{children}</div>
    </div>
  );
}
