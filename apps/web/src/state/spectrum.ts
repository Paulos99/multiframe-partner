/**
 * Frequency series for Result charts. Built by the acoustic model (not a flat Δ shift).
 */
import type { SessionAnswers, SpectrumSeries } from './types';
import { SPECTRUM_HZ } from './acoustic/bands';
import { buildConstruction } from './acoustic/construction';
import { applyMultiFrame } from './acoustic/multiframe';

export type { SpectrumSeries };
export { SPECTRUM_HZ };

export function seriesFromBands(
  before: number[],
  after: number[],
  targetDelta: number,
): SpectrumSeries {
  return {
    hz: SPECTRUM_HZ,
    before,
    after,
    targetDelta,
  };
}

export function buildAirSpectrum(answers: SessionAnswers): SpectrumSeries {
  const constr = buildConstruction(answers.room);
  const mf = applyMultiFrame(constr);
  return seriesFromBands(constr.R, mf.R, mf.deltaRw);
}

export function buildImpactSpectrum(answers: SessionAnswers): SpectrumSeries {
  const constr = buildConstruction(answers.room);
  const mf = applyMultiFrame(constr);
  return seriesFromBands(
    constr.impactIsolation,
    mf.impactIsolation,
    Math.abs(mf.deltaLnw),
  );
}
