/**
 * Demo / marketing lift on top of the field-anchor engine.
 * Not a measurement, certificate, or guaranteed Δ.
 */
import { round1 } from './bands';

/** Indices, charts, % quieter — +30% vs the field model. */
export const MARKETING_INDEX_SCALE = 1.3;

/** Playback «После» — +50% vs the field model (stronger than the numbers). */
export const MARKETING_AUDIO_SCALE = 1.5;

/** Extra on already-scaled sim so audio lands at +50%, not +30%. */
export const MARKETING_AUDIO_VS_INDEX = MARKETING_AUDIO_SCALE / MARKETING_INDEX_SCALE;

export const MARKETING_AFTER_GAIN_MIN = -20;
export const MARKETING_AFTER_GAIN_MAX = -3;

export function scaleIndexDelta(db: number): number {
  return round1(db * MARKETING_INDEX_SCALE);
}

export function scaleAudioDelta(db: number): number {
  return round1(db * MARKETING_AUDIO_VS_INDEX);
}
