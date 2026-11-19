export function OnAirLamp({ on, text }: { on: boolean; text: string }) {
  return (
    <div className={`lamp ${on ? 'lamp--on' : ''}`} data-testid="onair" data-on={on}>
      <span className="lamp__bulb" aria-hidden="true" />
      <span className="lamp__text">{text}</span>
    </div>
  );
}
