interface Props {
  on: boolean;
  labelTe: string;
  labelEn: string;
  ariaLabel: string;
  onToggle: () => void;
}

export function PowerSwitch({ on, labelTe, labelEn, ariaLabel, onToggle }: Props) {
  return (
    <div className="knob">
      <div className="knob__row">
        <button
          type="button"
          className={`power ${on ? 'power--on' : ''}`}
          aria-pressed={on}
          aria-label={ariaLabel}
          onClick={onToggle}
          data-testid="power"
        >
          <span className="knob__cap power__cap" aria-hidden="true">
            <span className="knob__pointer" />
          </span>
          <span className="power__marks" aria-hidden="true">
            <span>OFF</span>
            <span>ON</span>
          </span>
        </button>
      </div>
      <div className="knob__label" aria-hidden="true">
        <span lang="te" className="knob__label-te">
          {labelTe}
        </span>
        <span lang="en" className="knob__label-en">
          {labelEn}
        </span>
      </div>
    </div>
  );
}
