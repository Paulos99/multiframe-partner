/**
 * Dry-stem calibration for public/audio/* (music / stomp / vacuum / clap).
 * Stems are dry sources — room muffling + echo are applied in the playback graph.
 */
import { SPECTRUM_HZ } from '../state/acoustic/bands';

export type StemId = 'music' | 'stomp' | 'vacuum' | 'clap' | 'talk';

export type StemCalibration = {
  /** Measured / estimated file RMS in dBFS. */
  rmsDbFs: number;
  /** Measured / estimated peak in dBFS. */
  peakDbFs: number;
  /**
   * Gain to common loudness BEFORE room processing.
   * Continuous stems → target RMS ≈ −20 dBFS.
   * Clap → peak-normalized (silence after attack skews RMS).
   */
  trimDb: number;
  /** Unused for dry demos (kept for checks). */
  bandRelDb: readonly number[];
};

const FLAT_BANDS = SPECTRUM_HZ.map(() => 0);

/** Target RMS for continuous dry stems before room FX. */
export const STEM_NORM_TARGET_DBFS = -20;
/** Target peak for clap attack. */
export const CLAP_PEAK_TARGET_DBFS = -6;

/**
 * Provisional calibration — trim equals target − estimated RMS/peak.
 * Values are conservative so hot files don't clip after room gain.
 */
export const STEM_CALIBRATION: Record<StemId, StemCalibration> = {
  music: {
    rmsDbFs: -14,
    peakDbFs: -1,
    trimDb: STEM_NORM_TARGET_DBFS - -14, // −6
    bandRelDb: FLAT_BANDS,
  },
  stomp: {
    rmsDbFs: -18,
    peakDbFs: -3,
    trimDb: STEM_NORM_TARGET_DBFS - -18, // −2
    bandRelDb: FLAT_BANDS,
  },
  vacuum: {
    rmsDbFs: -16,
    peakDbFs: -2,
    trimDb: STEM_NORM_TARGET_DBFS - -16, // −4
    bandRelDb: FLAT_BANDS,
  },
  clap: {
    rmsDbFs: -28,
    peakDbFs: -4,
    trimDb: CLAP_PEAK_TARGET_DBFS - -4, // −2
    bandRelDb: FLAT_BANDS,
  },
  /** @deprecated alias → music (old talk stem). */
  talk: {
    rmsDbFs: -14,
    peakDbFs: -1,
    trimDb: STEM_NORM_TARGET_DBFS - -14,
    bandRelDb: FLAT_BANDS,
  },
};

/** Uncomfortable «До» air reference for continuous stems. */
export const PLAYBACK_REF_DBA_AIR = 61;
export const PLAYBACK_REF_DBA_IMPACT = 75;
export const PLAYBACK_REF_DBA_MIXED = 68;
export const PLAYBACK_REF_DBA = PLAYBACK_REF_DBA_AIR;

/** Global headroom after room FX. */
export const MASTER_PLAYBACK_GAIN = 0.62;

export const KEY_BAND_INDICES = [1, 3, 5, 7, 10, 13, 15] as const;

export function keyBandHz(): number[] {
  return KEY_BAND_INDICES.map((i) => SPECTRUM_HZ[i]!);
}

export function stemIdFromPairId(pairId: string): StemId {
  if (pairId.includes('clap') || pairId.includes('echo')) return 'clap';
  if (pairId.includes('stomp') || pairId.includes('impact')) return 'stomp';
  if (pairId.includes('vacuum') || pairId.includes('mixed')) return 'vacuum';
  if (pairId.includes('music') || pairId.includes('air')) return 'music';
  return 'music';
}

export function stemIdFromSrc(src: string): StemId {
  if (src.includes('clap')) return 'clap';
  if (src.includes('stomp')) return 'stomp';
  if (src.includes('vacuum')) return 'vacuum';
  if (src.includes('music') || src.includes('talk')) return 'music';
  return 'music';
}
