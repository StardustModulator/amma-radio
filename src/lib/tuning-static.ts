// Short burst of radio "between stations" static, synthesised with WebAudio
// (band-passed white noise with a little sweep), so no audio file is needed.
// It always follows the volume knob and never sounds when the set is off.

let ctx: AudioContext | undefined;
const active = new Set<AudioBufferSourceNode>();

function audioContext(): AudioContext | undefined {
  if (ctx) return ctx;
  const AC =
    typeof window !== 'undefined'
      ? (window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
      : undefined;
  if (!AC) return undefined;
  try {
    ctx = new AC();
  } catch {
    ctx = undefined;
  }
  return ctx;
}

/** Peak gain of the static for a 0–100 volume (0 → silent). Pure, for tests. */
export function staticGain(volume: number, powered: boolean): number {
  if (!powered || !(volume > 0)) return 0;
  return Math.min(0.3, 0.3 * (Math.min(100, volume) / 100));
}

/**
 * Play ~`ms` of tuning static. Returns false when nothing was played
 * (radio off, volume 0, or no WebAudio).
 */
export function playTuningStatic(volume: number, powered: boolean, ms = 550): boolean {
  const peak = staticGain(volume, powered);
  if (peak <= 0) return false;
  const ac = audioContext();
  if (!ac) return false;
  try {
    if (ac.state === 'suspended') void ac.resume();
    const secs = ms / 1000;
    const buf = ac.createBuffer(1, Math.max(1, Math.floor(ac.sampleRate * secs)), ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      // white noise with random crackle bursts
      const crackle = Math.random() < 0.002 ? (Math.random() - 0.5) * 4 : 0;
      data[i] = (Math.random() * 2 - 1) * 0.6 + crackle;
    }
    const src = ac.createBufferSource();
    src.buffer = buf;
    const band = ac.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = 0.9;
    const t0 = ac.currentTime;
    band.frequency.setValueAtTime(700, t0);
    band.frequency.exponentialRampToValueAtTime(2600, t0 + secs * 0.6);
    band.frequency.exponentialRampToValueAtTime(1200, t0 + secs);
    const gain = ac.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.04);
    gain.gain.setValueAtTime(peak, t0 + secs * 0.7);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + secs);
    src.connect(band).connect(gain).connect(ac.destination);
    active.add(src);
    src.onended = () => active.delete(src);
    src.start(t0);
    src.stop(t0 + secs + 0.02);
    return true;
  } catch {
    return false;
  }
}

/** Cut any static that is still sounding (e.g. when the radio is switched off). */
export function stopTuningStatic(): void {
  for (const s of active) {
    try {
      s.stop();
    } catch {
      /* already stopped */
    }
  }
  active.clear();
}
