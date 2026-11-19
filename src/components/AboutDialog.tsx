import { useEffect, useRef } from 'react';
import type { ChannelConfig } from '../lib/types';

interface Props {
  open: boolean;
  onClose: () => void;
  lang: 'te' | 'en';
  title: string;
  body: string;
  sync: string;
  artist: string;
  channelsLabel: string;
  channels: ChannelConfig[];
  closeLabel: string;
}

export const channelUrl = (c: ChannelConfig) =>
  c.handle && !c.handle.includes('{{')
    ? `https://www.youtube.com/${c.handle}`
    : `https://www.youtube.com/channel/${c.id}`;

export function AboutDialog(p: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (p.open && !d.open) d.showModal?.();
    if (!p.open && d.open) d.close();
  }, [p.open]);
  return (
    <dialog ref={ref} className="about" onClose={p.onClose} aria-labelledby="about-title">
      <h2 id="about-title">{p.title}</h2>
      <p>
        {p.body} {p.artist}.
      </p>
      <p>{p.sync}</p>
      <h3>{p.channelsLabel}</h3>
      <ul>
        {p.channels.map((c) => (
          <li key={c.id}>
            <a href={channelUrl(c)} target="_blank" rel="noopener">
              {c.label[p.lang]}
            </a>
          </li>
        ))}
      </ul>
      <button type="button" className="plate-btn" onClick={p.onClose}>
        {p.closeLabel}
      </button>
    </dialog>
  );
}
