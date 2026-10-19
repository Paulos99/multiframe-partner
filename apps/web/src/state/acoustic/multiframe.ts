/**
 * MultiFrame ΔR(f) / Δ isolation — field_in_situ (object tests, not a lab certificate).
 *
 * Anchors (1/3-oct, 100…5000 Hz):
 * - Foamblock 120 / ρ≈650 — light partition proxy (air only); ΔRw ≈ +9
 * - Kostroma concrete 160 / ρ≈1000 — bare/ordinary slab; ΔRw ≈ +2, |ΔLnw| ≈ 6
 * - Andrianova monolith 200 + Polyblock 10 under 60 mm screed — floating floor residual;
 *   ΔRw ≈ +1, |ΔLnw| ≈ 1
 *
 * Bare heavy monolith without floating floor is not in the field set: air stays modest,
 * impact follows Kostroma with mild Rw roll-off (never copy Andrianova’s near-zero ΔLnw).
 */
import { SPECTRUM_HZ, atHz, clamp, round0, round1 } from './bands';
import type { ConstructionResult } from './construction';
import { calibrateToLnw, calibrateToRw, iso717Lnw, iso717Rw } from './iso717';
import { isolationToLn, lnToIsolation } from './materials';
import { scaleIndexDelta } from './marketing';

/** Foamblock 120 — measured ΔR(f) (MF − bare). */
const FOAM_DR: readonly number[] = [
  -3.7, -0.3, -2.3, -4.2, -0.2, 1.7, 4.2, 5.1, 9.3, 11.4, 13.3, 17.8, 17.8, 16.0,
  17.0, 17.9, 20.8, 19.9,
];

/** Kostroma 160 — measured ΔR(f); 4000/5000 padded from 3150 trend. */
const KOSTROMA_DR: readonly number[] = [
  -0.4, -3.9, -2.4, -0.9, -1.3, 3.8, 3.2, 4.9, 3.8, 6.4, 3.4, 5.4, 4.5, 4.0, 3.2,
  1.7, 1.5, 1.4,
];

/** Kostroma — measured Δ impact isolation; HF padded. */
const KOSTROMA_DISO: readonly number[] = [
  4.2, 5.4, 4.1, 4.9, 8.1, 4.5, 7.1, 10.2, 11.1, 13.6, 10.9, 12.1, 14.1, 12.5,
  14.6, 14.3, 14.0, 13.8,
];

/**
 * Andrianova — monolith 200 + Polyblock 10 under 60 mm screed (floating above).
 * Residual MF Δ vs the same floor without MF panels.
 */
const ANDRIANOVA_DR: readonly number[] = [
  1.5, 3.0, -0.7, 1.6, 1.2, 3.4, 2.4, 3.4, 3.7, 0.8, 2.4, 2.9, 2.1, 1.6, 2.5, 2.6,
  2.1, 1.8,
];

const ANDRIANOVA_DISO: readonly number[] = [
  -1.9, 5.6, -1.4, 2.0, 6.3, -0.2, 11.4, 4.1, 1.9, 4.7, 2.7, 3.2, 0.5, 2.6, 3.2,
  0.2, -2.8, -1.9,
];

/** Protocol single-number targets at field anchors. */
const ANCHOR_FOAM_RW = 38;
const ANCHOR_KOSTROMA_RW = 49;
const ANCHOR_HEAVY_RW = 57;

const FOAM_DRW = 9;
const KOSTROMA_DRW = 2;
const HEAVY_BARE_DRW = 1.5;
const FLOATING_DRW = 1;

const KOSTROMA_DLNW = 6;
const HEAVY_BARE_DLNW = 4;
const LIGHT_BARE_DLNW = 7;
const FLOATING_DLNW = 1;

/** Modest stretch-ceiling drum recovery (before already includes drum penalty). */
function drumLift(hasDrum: boolean): number[] {
  if (!hasDrum) return SPECTRUM_HZ.map(() => 0);
  return atHz((f) => {
    if (f < 200 || f > 800) return f >= 160 && f <= 1000 ? 0.4 : 0;
    const t = (Math.log(f) - Math.log(200)) / (Math.log(800) - Math.log(200));
    return 1.4 * Math.sin(Math.PI * t);
  });
}

function blend(a: readonly number[], b: readonly number[], t: number): number[] {
  const u = clamp(t, 0, 1);
  return a.map((v, i) => round1(v * (1 - u) + (b[i] ?? v) * u));
}

/** Piecewise lerp of air Δ shape by before.Rw (foam → Kostroma → Andrianova air). */
function bareAirShape(beforeRw: number): number[] {
  if (beforeRw <= ANCHOR_FOAM_RW) return [...FOAM_DR];
  if (beforeRw <= ANCHOR_KOSTROMA_RW) {
    const t = (beforeRw - ANCHOR_FOAM_RW) / (ANCHOR_KOSTROMA_RW - ANCHOR_FOAM_RW);
    return blend(FOAM_DR, KOSTROMA_DR, t);
  }
  const t = clamp(
    (beforeRw - ANCHOR_KOSTROMA_RW) / (ANCHOR_HEAVY_RW - ANCHOR_KOSTROMA_RW),
    0,
    1,
  );
  return blend(KOSTROMA_DR, ANDRIANOVA_DR, t);
}

/** Impact Δ: Kostroma primary; mild blend toward Andrianova shape on heavy slabs. */
function bareImpactShape(beforeRw: number): number[] {
  if (beforeRw <= ANCHOR_KOSTROMA_RW) return [...KOSTROMA_DISO];
  const t = clamp(
    (beforeRw - ANCHOR_KOSTROMA_RW) / (ANCHOR_HEAVY_RW - ANCHOR_KOSTROMA_RW),
    0,
    1,
  );
  return blend(KOSTROMA_DISO, ANDRIANOVA_DISO, t * 0.35);
}

/**
 * Target ΔRw from field anchors.
 * Floating → Andrianova residual (~1). Else foam(38→9)…Kostroma(49→2)…heavy bare(~1.5).
 */
export function targetDeltaRw(beforeRw: number, floating = false): number {
  if (floating) return FLOATING_DRW;
  if (beforeRw <= ANCHOR_FOAM_RW) return FOAM_DRW;
  if (beforeRw <= ANCHOR_KOSTROMA_RW) {
    const t = (beforeRw - ANCHOR_FOAM_RW) / (ANCHOR_KOSTROMA_RW - ANCHOR_FOAM_RW);
    return round0(FOAM_DRW + t * (KOSTROMA_DRW - FOAM_DRW));
  }
  const t = clamp(
    (beforeRw - ANCHOR_KOSTROMA_RW) / (ANCHOR_HEAVY_RW - ANCHOR_KOSTROMA_RW),
    0,
    1,
  );
  return round0(KOSTROMA_DRW + t * (HEAVY_BARE_DRW - KOSTROMA_DRW));
}

/**
 * Target |ΔLnw|. Floating → Andrianova (~1). Bare: light ~7, Kostroma ~6, heavy bare ~4.
 */
export function targetDeltaLnw(
  beforeRw: number,
  beforeLnw: number,
  floating: boolean,
): number {
  if (floating) return FLOATING_DLNW;
  let base: number;
  if (beforeRw <= ANCHOR_FOAM_RW) base = LIGHT_BARE_DLNW;
  else if (beforeRw <= ANCHOR_KOSTROMA_RW) {
    const t = (beforeRw - ANCHOR_FOAM_RW) / (ANCHOR_KOSTROMA_RW - ANCHOR_FOAM_RW);
    base = LIGHT_BARE_DLNW + t * (KOSTROMA_DLNW - LIGHT_BARE_DLNW);
  } else {
    const t = clamp(
      (beforeRw - ANCHOR_KOSTROMA_RW) / (ANCHOR_HEAVY_RW - ANCHOR_KOSTROMA_RW),
      0,
      1,
    );
    base = KOSTROMA_DLNW + t * (HEAVY_BARE_DLNW - KOSTROMA_DLNW);
  }
  // Slight extra help when impact is still loud (high Lnw).
  const loud = clamp((beforeLnw - 70) * 0.15, -1, 1.5);
  return round0(clamp(base + loud, 3, 8));
}

function scaleToMean(shape: number[], meanTarget: number): number[] {
  const m = shape.reduce((a, b) => a + b, 0) / shape.length;
  if (Math.abs(m) < 0.05) return shape.map((v) => round1(v + meanTarget));
  const k = meanTarget / m;
  return shape.map((v) => round1(v * k));
}

export interface MultiFrameResult {
  R: number[];
  Ln: number[];
  impactIsolation: number[];
  Rw: number;
  Lnw: number;
  deltaRw: number;
  deltaLnw: number;
  deltaRange: { Rw: readonly [number, number]; Lnw: readonly [number, number] };
}

/** Soft floor: ceiling alone must not reach class-A impact (Lnw ≤ 55). */
const MIN_AFTER_LNW = 56;

export function applyMultiFrame(before: ConstructionResult): MultiFrameResult {
  const floating = before.floor === 'floating';
  const dRwTarget = scaleIndexDelta(targetDeltaRw(before.Rw, floating));
  const dLnwTarget = scaleIndexDelta(targetDeltaLnw(before.Rw, before.Lnw, floating));

  const airShape = floating ? [...ANDRIANOVA_DR] : bareAirShape(before.Rw);
  const airDrum = drumLift(before.hasDrum);
  const airCombined = airShape.map((v, i) => v + (airDrum[i] ?? 0));
  const airScaled = scaleToMean(airCombined, dRwTarget);
  let R = before.R.map((v, i) => round1(v + (airScaled[i] ?? 0)));
  R = calibrateToRw(R, SPECTRUM_HZ, before.Rw + dRwTarget);

  const impShape = floating ? [...ANDRIANOVA_DISO] : bareImpactShape(before.Rw);
  const impScaled = scaleToMean(impShape, dLnwTarget);
  let impact = before.impactIsolation.map((v, i) => round1(v + (impScaled[i] ?? 0)));
  let Ln = isolationToLn(impact);
  let afterLnw = before.Lnw - dLnwTarget;
  // The soft floor only caps the gain. It must never push Lnw above «before»:
  // a slab that is already at class-A impact (Lnw ≤ 55) stays there with the ceiling.
  afterLnw = Math.max(afterLnw, Math.min(MIN_AFTER_LNW, before.Lnw));
  Ln = calibrateToLnw(Ln, SPECTRUM_HZ, afterLnw);
  impact = lnToIsolation(Ln);

  const Rw = iso717Rw(R, SPECTRUM_HZ);
  const Lnw = iso717Lnw(Ln, SPECTRUM_HZ);
  const deltaRw = Rw - before.Rw;
  const deltaLnw = Lnw - before.Lnw;
  const absLnw = Math.abs(deltaLnw);

  return {
    R,
    Ln,
    impactIsolation: impact,
    Rw,
    Lnw,
    deltaRw,
    deltaLnw,
    deltaRange: {
      Rw: [Math.max(0, deltaRw - 1), Math.min(16, deltaRw + 2)] as const,
      Lnw: [Math.max(0, absLnw - 1), Math.min(14, absLnw + 2)] as const,
    },
  };
}
