export function Marquee({ text }: { text: string }) {
  return (
    <div className="marquee" aria-hidden="true">
      <div className="marquee__track">
        <span>{text}</span>
        <span>{text}</span>
      </div>
      <div className="marquee__static">{text}</div>
    </div>
  );
}
