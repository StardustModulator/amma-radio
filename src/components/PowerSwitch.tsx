interface Props {
  on: boolean;
  labelTe: string;
  labelEn: string;
  ariaLabel: string;
  onToggle: () => void;
}

/** The big POWER push-button on the top rail of the cabinet, with its pilot light. */
export function PowerSwitch({ on, labelTe, labelEn, ariaLabel, onToggle }: Props) {
  return (
    <button
      type="button"
      className={`power ${on ? 'power--on' : ''}`}
      aria-pressed={on}
      aria-label={ariaLabel}
      onClick={onToggle}
      data-testid="power"
    >
      <span className="power__btn" aria-hidden="true">
        <svg viewBox="0 0 24 24" className="power__icon">
          <path d="M12 3v8" />
          <path d="M6.3 6.8a8 8 0 1 0 11.4 0" />
        </svg>
      </span>
      <span className="power__text" aria-hidden="true">
        <span lang="te" className="power__te">
          {labelTe}
        </span>
        <span lang="en" className="power__en">
          {labelEn}
        </span>
        <span className="power__state">
          <span className="power__pilot" />
          {on ? 'ON' : 'OFF'}
        </span>
      </span>
    </button>
  );
}
