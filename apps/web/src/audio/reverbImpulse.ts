/**
 * Synthetic room impulse for ConvolverNode — early flutter + exponential tail.
 * Not a measured IR; tuned for demo contrast (empty vs MultiFrame).
 */

export type ImpulseParams = {
  sampleRate: number;
  /** Decay time to ~−60 dB (seconds). */
  rt60: number;
  /** Early-reflection / flutter amount 0…1. */
  flutter: number;
};

/** Build mono Float32 IR: discrete early taps + noise tail. */
export function synthesizeRoomImpulse(params: ImpulseParams): Float32Array {
  const sr = params.sampleRate;
  const rt60 = Math.max(0.12, Math.min(3.5, params.rt60));
  const flutter = Math.max(0, Math.min(1, params.flutter));
  const duration = Math.min(4, Math.max(0.25, rt60 * 1.35));
  const n = Math.max(256, Math.floor(sr * duration));
  const out = new Float32Array(n);

  // Direct path
  out[0] = 1;

  // Early reflections (flutter echo) — denser / stronger when empty
  const tapsMs = [8, 14, 21, 29, 37, 48];
  const tapGains = [0.55, 0.42, 0.35, 0.28, 0.22, 0.16];
  for (let i = 0; i < tapsMs.length; i++) {
    const idx = Math.min(n - 1, Math.round((tapsMs[i]! / 1000) * sr));
    const g = tapGains[i]! * (0.35 + 0.65 * flutter);
    const sign = i % 2 === 0 ? 1 : -1;
    out[idx] += sign * g;
  }

  // Exponential noise tail after ~50 ms
  const start = Math.min(n - 1, Math.round(0.05 * sr));
  const decay = Math.exp((-6.9078 / (rt60 * sr))); // ln(1000)/samples for −60 dB
  let env = 0.45 * (0.55 + 0.45 * flutter);
  // Deterministic PRNG so IR is stable across plays
  let seed = Math.floor(rt60 * 1000) ^ Math.floor(flutter * 997) ^ 0x9e3779b9;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };

  for (let i = start; i < n; i++) {
    env *= decay;
    const noise = rand() * 2 - 1;
    out[i] += noise * env;
  }

  // Soft normalize peak
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out[i]!));
  if (peak > 1e-6) {
    const k = 0.92 / peak;
    for (let i = 0; i < n; i++) out[i]! *= k;
  }

  return out;
}

export function impulseToAudioBuffer(ctx: BaseAudioContext, params: ImpulseParams): AudioBuffer {
  const data = synthesizeRoomImpulse(params);
  const buf = ctx.createBuffer(1, data.length, ctx.sampleRate);
  buf.copyToChannel(data, 0);
  return buf;
}
