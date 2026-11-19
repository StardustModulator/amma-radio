// Server-time calibration using the HTTP Date header of a static file (GitHub Pages has no API).
// Local time then advances with performance.now(), so system clock changes don't matter.

export interface ClockSample {
  offset: number;
  rtt: number;
}

export function sampleFromDateHeader(
  dateHeader: string | null,
  sendTime: number,
  rtt: number,
): ClockSample | undefined {
  if (!dateHeader) return undefined;
  const server = Date.parse(dateHeader);
  if (Number.isNaN(server)) return undefined;
  return { offset: server + 500 - (sendTime + rtt / 2), rtt };
}

export class ServerClock {
  private baseServer = Date.now();
  private basePerf = performance.now();
  private timer: number | undefined;

  constructor(private readonly url: string) {}

  now(): number {
    return this.baseServer + (performance.now() - this.basePerf);
  }

  async calibrate(samples = 3): Promise<void> {
    let best: ClockSample | undefined;
    for (let i = 0; i < samples; i++) {
      const send = Date.now();
      const p0 = performance.now();
      try {
        const res = await fetch(`${this.url}?t=${send}`, { cache: 'no-store' });
        const rtt = performance.now() - p0;
        const s = sampleFromDateHeader(res.headers.get('date'), send, rtt);
        if (s && (!best || s.rtt < best.rtt)) best = s;
      } catch {
        // offline: keep the local clock
      }
    }
    // Only trust the header if it's not wildly off (bad proxies) — accept up to 1 day.
    const offset = best && Math.abs(best.offset) < 86_400_000 ? best.offset : 0;
    this.baseServer = Date.now() + offset;
    this.basePerf = performance.now();
  }

  startAutoRecalibrate(onDone?: () => void): () => void {
    const run = () => void this.calibrate().then(onDone);
    this.timer = window.setInterval(run, 10 * 60_000);
    const onVis = () => {
      if (document.visibilityState === 'visible') run();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(this.timer);
      document.removeEventListener('visibilitychange', onVis);
    };
  }
}
