import type { Mode } from '../lib/types';

interface Props {
  mode: Mode;
  onChange: (m: Mode) => void;
  groupLabel: string;
  labels: Record<Mode, { te: string; en: string; tagTe: string; tagEn: string }>;
}

/** Two big piano-key switches, like the band keys on an old valve set. */
export function ModeSwitch({ mode, onChange, groupLabel, labels }: Props) {
  return (
    <div className="modes" role="group" aria-label={groupLabel}>
      {(['songs', 'stories'] as const).map((m) => (
        <button
          key={m}
          type="button"
          className={`modekey modekey--${m} ${mode === m ? 'modekey--down' : ''}`}
          aria-pressed={mode === m}
          onClick={() => onChange(m)}
          data-testid={`mode-${m}`}
        >
          <span className="modekey__lamp" aria-hidden="true" />
          <span className="modekey__te" lang="te">
            {labels[m].te}
          </span>
          <span className="modekey__en" lang="en">
            {labels[m].en}
          </span>
          <span className="modekey__tag">
            <span lang="te">{labels[m].tagTe}</span> · <span lang="en">{labels[m].tagEn}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
