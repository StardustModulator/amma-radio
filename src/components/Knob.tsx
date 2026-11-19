import { useId } from 'react';
import { KnobHeadless, KnobHeadlessLabel, useKnobKeyboardControls } from 'react-knob-headless';

interface Props {
  labelTe: string;
  labelEn: string;
  ariaLabel: string;
  value: number;
  min: number;
  max: number;
  step: number;
  /** Detented knob (STATION): rounds to integers and buzzes on each detent. */
  detents?: boolean;
  valueText: (v: number) => string;
  onChange: (v: number) => void;
  decreaseLabel: string;
  increaseLabel: string;
}

const ANGLE = 135; // ±135° sweep

export function Knob(p: Props) {
  const id = useId();
  const labelId = `${id}-label`;
  const round = (v: number) => (p.detents ? Math.round(v) : Math.round(v));
  const set = (raw: number) => {
    const v = Math.min(p.max, Math.max(p.min, round(raw)));
    if (v !== p.value) {
      if (p.detents) navigator.vibrate?.(10);
      p.onChange(v);
    }
  };
  const keyboard = useKnobKeyboardControls({
    valueRaw: p.value,
    valueMin: p.min,
    valueMax: p.max,
    step: p.step,
    stepLarger: p.detents ? p.step : p.step * 10,
    onValueRawChange: set,
  });
  const frac = p.max === p.min ? 0.5 : (p.value - p.min) / (p.max - p.min);
  const angle = -ANGLE + frac * ANGLE * 2;
  return (
    <div className="knob">
      <div className="knob__row">
        <button
          type="button"
          className="knob__step"
          aria-label={`${p.decreaseLabel}: ${p.ariaLabel}`}
          onClick={() => set(p.value - p.step)}
        >
          −
        </button>
        <KnobHeadless
          id={id}
          className="knob__body"
          aria-labelledby={labelId}
          valueRaw={p.value}
          valueMin={p.min}
          valueMax={p.max}
          dragSensitivity={p.detents ? 0.012 : 0.006}
          valueRawRoundFn={round}
          valueRawDisplayFn={p.valueText}
          onValueRawChange={set}
          axis="xy"
          includeIntoTabOrder
          {...keyboard}
        >
          <div className="knob__cap" style={{ transform: `rotate(${angle}deg)` }}>
            <span className="knob__pointer" />
          </div>
        </KnobHeadless>
        <button
          type="button"
          className="knob__step"
          aria-label={`${p.increaseLabel}: ${p.ariaLabel}`}
          onClick={() => set(p.value + p.step)}
        >
          +
        </button>
      </div>
      <KnobHeadlessLabel id={labelId} className="knob__label">
        <span lang="te" className="knob__label-te">
          {p.labelTe}
        </span>
        <span lang="en" className="knob__label-en">
          {p.labelEn}
        </span>
      </KnobHeadlessLabel>
    </div>
  );
}
