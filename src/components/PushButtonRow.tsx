interface Option {
  id: string;
  label: string;
  sub?: string;
  lang?: string;
  empty?: boolean;
}

interface Props {
  options: Option[];
  value: string;
  onChange: (id: string) => void;
  groupLabel: string;
  small?: boolean;
  testId?: string;
}

/** A row of ivory push-buttons (band selector). Empty stations get a dimmed "soon" dot. */
export function PushButtonRow({ options, value, onChange, groupLabel, small, testId }: Props) {
  return (
    <div
      className={`pushrow ${small ? 'pushrow--small' : ''}`}
      role="group"
      aria-label={groupLabel}
      data-testid={testId}
    >
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          className={`pushbtn ${value === o.id ? 'pushbtn--down' : ''} ${o.empty ? 'pushbtn--empty' : ''}`}
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
          data-id={o.id}
        >
          <span className="pushbtn__label" lang={o.lang}>
            {o.label}
          </span>
          {o.sub ? <span className="pushbtn__sub">{o.sub}</span> : null}
        </button>
      ))}
    </div>
  );
}
