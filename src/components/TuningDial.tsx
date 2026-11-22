import { useEffect, useState, type ReactNode } from 'react';
import type { LangCode, StationConfig } from '../lib/types';

const MIN = 88;
const MAX = 108;
export const freqToPct = (f: number) =>
  ((Math.min(MAX, Math.max(MIN, f)) - MIN) / (MAX - MIN)) * 100;

/** Short marker text on the dial glass. */
export const LANG_SHORT: Record<LangCode, string> = {
  te: 'తె',
  hi: 'हि',
  en: 'EN',
  es: 'ES',
  fr: 'FR',
};

export interface Band {
  id: string;
  from: number;
  to: number;
  te: string;
  en: string;
}

interface Props {
  /** Main stations in dial order (both bands). */
  stations: StationConfig[];
  /** id of the main station the needle belongs to */
  currentId?: string;
  currentFreq: number;
  powered: boolean;
  lang: 'te' | 'en';
  bands: Band[];
  /** Frequency window: what is tuned in right now. */
  readout: { freq: string; band: string; name: string; sub?: string };
  /** Bumped on each station change → needle sweep + static flicker. */
  tuneFx: number;
  isEmpty: (id: string) => boolean;
  onTune: (id: string) => void;
  onStep: (delta: number) => void;
  prevLabel: string;
  nextLabel: string;
  children?: ReactNode;
}

export function TuningDial(p: Props) {
  const [tuning, setTuning] = useState(false);
  useEffect(() => {
    if (!p.tuneFx) return;
    setTuning(true);
    const t = window.setTimeout(() => setTuning(false), 750);
    return () => window.clearTimeout(t);
  }, [p.tuneFx]);

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
  const pct = freqToPct(p.currentFreq);
  return (
    <div
      className={`dial ${p.powered ? 'dial--on' : ''} ${tuning ? 'dial--tuning' : ''}`}
      data-testid="dial"
      data-tuning={tuning}
    >
      <div className="dial__head">
        <button
          type="button"
          className="dial__step"
          onClick={() => p.onStep(-1)}
          aria-label={p.prevLabel}
          title={p.prevLabel}
          data-testid="station-prev"
        >
          ◀
        </button>
        <div
          className="dial__readout"
          data-testid="freq-display"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <span className="dial__mhz">
            <b data-testid="freq-value">{p.readout.freq}</b> MHz
          </span>
          <span className="dial__band">{p.readout.band}</span>
          <span className="dial__name" lang={p.lang} data-testid="station-name">
            {p.readout.name}
          </span>
          {p.readout.sub ? <span className="dial__sub">{p.readout.sub}</span> : null}
        </div>
        <button
          type="button"
          className="dial__step"
          onClick={() => p.onStep(1)}
          aria-label={p.nextLabel}
          title={p.nextLabel}
          data-testid="station-next"
        >
          ▶
        </button>
      </div>
      <div className="dial__scale">
        <div className="dial__bands" aria-hidden="true">
          {p.bands.map((b) => (
            <span
              key={b.id}
              className={`dial__bandcap dial__bandcap--${b.id}`}
              style={{
                left: `${freqToPct(b.from)}%`,
                width: `${freqToPct(b.to) - freqToPct(b.from)}%`,
              }}
            >
              <span lang="te">{b.te}</span> <span lang="en">{b.en}</span>
            </span>
          ))}
        </div>
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
        <div className="dial__stations">
          {p.stations.map((s) => (
            <button
              type="button"
              key={s.id}
              tabIndex={-1}
              className={`dial__station dial__station--${s.mode} ${s.id === p.currentId ? 'dial__station--active' : ''} ${p.isEmpty(s.id) ? 'dial__station--empty' : ''}`}
              style={{ left: `${freqToPct(Number(s.freq))}%` }}
              onClick={() => p.onTune(s.id)}
              aria-label={`${s.freq} MHz ${s.label[p.lang]}`}
              data-station={s.id}
            >
              <b>{s.freq}</b>
              <span>{s.lang ? LANG_SHORT[s.lang] : s.label[p.lang]}</span>
            </button>
          ))}
        </div>
        <div
          className="dial__needle-track"
          style={{ transform: `translateX(${pct}%)` }}
          data-testid="needle"
          data-freq={p.currentFreq}
        >
          <span className="dial__needle" />
        </div>
        <div className="dial__noise" aria-hidden="true" />
      </div>
      <div className="dial__card">{p.children}</div>
    </div>
  );
}
