/** Parse an ISO-8601 duration like PT3M5S, PT1H2S, P0D, P1DT2H into seconds. */
export function parseIsoDuration(iso: string): number {
  const m = /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(iso);
  if (!m) return 0;
  const [, w, d, h, min, s] = m;
  return Math.round(
    Number(w ?? 0) * 604800 +
      Number(d ?? 0) * 86400 +
      Number(h ?? 0) * 3600 +
      Number(min ?? 0) * 60 +
      Number(s ?? 0),
  );
}

/** 3:05 / 1:02:03 */
export function formatClock(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h ? String(m).padStart(2, '0') : String(m);
  return `${h ? `${h}:` : ''}${mm}:${String(sec).padStart(2, '0')}`;
}
