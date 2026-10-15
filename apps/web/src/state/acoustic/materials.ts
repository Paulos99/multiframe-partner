/**
 * Material priors for RU housing stock.
 * Indices (Rw/Lnw) — Trofimov 2026-09-09 for bare RC slabs.
 * Frequency shapes — mass law + coincidence + voids (ISO 12354-style, ASSUMPTION).
 * Flanking — in-situ vs «slab only»; not in Trofimov table.
 */
import type { HouseTypeOption } from '../types';
import { atHz, round1 } from './bands';

export type SlabKind = 'solid' | 'hollow' | 'wood';

export interface SlabMassRef {
  kind: SlabKind;
  thicknessMm: number;
}

export const SOLID_ANCHORS: { mm: number; Rw: number; Lnw: number }[] = [
  { mm: 100, Rw: 47, Lnw: 82 },
  { mm: 120, Rw: 49, Lnw: 80 },
  { mm: 140, Rw: 50, Lnw: 80 },
  { mm: 160, Rw: 52, Lnw: 78 },
  { mm: 180, Rw: 54, Lnw: 76 },
  { mm: 200, Rw: 55, Lnw: 74 },
  { mm: 250, Rw: 56, Lnw: 74 },
];

export const PK220 = { Rw: 52, Lnw: 74 } as const;
/** Bare timber joist + board — ASSUMPTION (Trofimov ТС-6.x is a finished system). */
export const WOOD_BARE = { Rw: 46, Lnw: 84 } as const;

/**
 * Chart impact isolation I(f) = REF − Ln(f). Must clear wood LF Ln (~95–100)
 * or the spectrum tooltip shows negative «дБ» on timber floors.
 */
export const IMPACT_ISO_REF_DB = 110;

export function lnToIsolation(ln: readonly number[]): number[] {
  return ln.map((v) => round1(IMPACT_ISO_REF_DB - v));
}

export function isolationToLn(iso: readonly number[]): number[] {
  return iso.map((v) => round1(IMPACT_ISO_REF_DB - v));
}

const RHO_RC = 2500;
const C_AIR = 343;
/** Longitudinal speed in dense concrete, m/s. */
const CL_CONCRETE = 3400;

export function massKgM2(resolved: SlabMassRef): number {
  const h = resolved.thicknessMm / 1000;
  if (resolved.kind === 'hollow') {
    // Typical ПК-22 ≈ 280–310 kg/m², not solid×void fraction of 2500.
    return 300 * (resolved.thicknessMm / 220);
  }
  if (resolved.kind === 'wood') {
    return 55 + 20 * (resolved.thicknessMm / 200);
  }
  return RHO_RC * h;
}

/**
 * Coincidence frequency of the load-bearing plate (Hz).
 * Dense RC: fc ≈ c² / (1.8 c_L h) → ~105 Hz at 180 mm, ~190 Hz at 100 mm.
 * Hollow: lower stiffness → slightly higher fc + void resonances separately.
 * Wood deck: ~1 kHz (thin OSB/board), not the joist depth.
 */
export function coincidenceHz(resolved: SlabMassRef): number {
  if (resolved.kind === 'wood') return 1250;
  const h = Math.max(0.08, resolved.thicknessMm / 1000);
  const fc = C_AIR ** 2 / (1.8 * CL_CONCRETE * h);
  if (resolved.kind === 'hollow') return fc * 1.25;
  return fc;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function interpSolid(mm: number): { Rw: number; Lnw: number } {
  const x = Math.max(100, Math.min(260, mm));
  if (x <= SOLID_ANCHORS[0]!.mm) {
    return { Rw: SOLID_ANCHORS[0]!.Rw, Lnw: SOLID_ANCHORS[0]!.Lnw };
  }
  for (let i = 0; i < SOLID_ANCHORS.length - 1; i++) {
    const lo = SOLID_ANCHORS[i]!;
    const hi = SOLID_ANCHORS[i + 1]!;
    if (x <= hi.mm) {
      const t = (x - lo.mm) / (hi.mm - lo.mm);
      return { Rw: round1(lerp(lo.Rw, hi.Rw, t)), Lnw: round1(lerp(lo.Lnw, hi.Lnw, t)) };
    }
  }
  const last = SOLID_ANCHORS[SOLID_ANCHORS.length - 1]!;
  return { Rw: last.Rw, Lnw: last.Lnw };
}

export function bareIndices(resolved: SlabMassRef): { Rw: number; Lnw: number } {
  if (resolved.kind === 'hollow') {
    const d = (resolved.thicknessMm - 220) / 40;
    return { Rw: round1(PK220.Rw + d * 0.5), Lnw: round1(PK220.Lnw - d * 0.5) };
  }
  if (resolved.kind === 'wood') {
    const d = (resolved.thicknessMm - 200) / 50;
    return { Rw: round1(WOOD_BARE.Rw + d * 1), Lnw: round1(WOOD_BARE.Lnw - d * 1) };
  }
  return interpSolid(resolved.thicknessMm);
}

export function floorIndexDelta(floor: 'bare' | 'ordinary' | 'floating'): {
  dRw: number;
  dLnw: number;
} {
  // Ordinary finish barely moves Rw in situ; keep a small Lnw credit only.
  if (floor === 'floating') return { dRw: 3, dLnw: -22 };
  if (floor === 'ordinary') return { dRw: 0, dLnw: -2 };
  return { dRw: 0, dLnw: 0 };
}

/**
 * In-situ flanking vs laboratory slab (ISO 12354-1 qualitative).
 * Trofimov table = slab alone; RU apartments measure lower R′w.
 * Unknown house → mass-stock prior (panel-like), not «lab slab».
 */
export function flankingAirDelta(house: HouseTypeOption): number[] {
  switch (house) {
    case 'panel':
      return atHz((f) => (f <= 160 ? -6 : f <= 400 ? -3.5 : -2));
    case 'block':
      return atHz((f) => (f <= 160 ? -4.5 : f <= 400 ? -2.5 : -1.4));
    case 'wood':
      return atHz((f) => (f <= 200 ? -7 : f <= 500 ? -3.5 : -2));
    case 'brick':
      return atHz((f) => (f <= 160 ? -2.5 : f <= 400 ? -1.2 : -0.6));
    case 'monolith':
      return atHz((f) => (f <= 160 ? -2.2 : f <= 400 ? -1 : -0.5));
    default:
      // Unknown → conservative mass-housing prior (between panel and block).
      return atHz((f) => (f <= 160 ? -5 : f <= 400 ? -3 : -1.6));
  }
}

export function flankingImpactDelta(house: HouseTypeOption): number[] {
  // Positive = louder Ln (worse).
  switch (house) {
    case 'panel':
      return atHz((f) => (f <= 250 ? 4 : 2));
    case 'block':
      return atHz((f) => (f <= 250 ? 3 : 1.5));
    case 'wood':
      return atHz((f) => (f <= 200 ? 4.5 : 2.2));
    case 'brick':
      return atHz((f) => (f <= 250 ? 2 : 1));
    case 'monolith':
      return atHz((f) => (f <= 250 ? 1.8 : 0.9));
    default:
      return atHz((f) => (f <= 250 ? 3.5 : 1.6));
  }
}

/** Index flanking on top of Trofimov lab slab (ASSUMPTION for in-situ R′w). */
export function flankingRwShift(house: HouseTypeOption): number {
  switch (house) {
    case 'panel':
      return -4;
    case 'block':
      return -3;
    case 'wood':
      return -4;
    case 'brick':
      return -2;
    case 'monolith':
      return -2;
    default:
      return -3;
  }
}

export function flankingLnwShift(house: HouseTypeOption): number {
  switch (house) {
    case 'panel':
      return 4;
    case 'block':
      return 3;
    case 'wood':
      return 3;
    case 'brick':
      return 2;
    case 'monolith':
      return 2;
    default:
      return 3;
  }
}

/**
 * Extra in-situ leaks vs lab sample: sockets, gaps, non-ideal junctions.
 * Applied only in product `buildConstruction`, not Trofimov fixtures.
 */
export const INSITU_LEAK_RW = -2;
export const INSITU_LEAK_LNW = 1;

/** Stretch drum index hit in «сейчас» (stronger than a lab bare-slab story). */
export function drumRwShift(hasDrum: boolean, lab: boolean): number {
  if (!hasDrum) return 0;
  return lab ? 1 : 2;
}

/**
 * Bare-slab airborne R(f) before Trofimov level calibration.
 * Mass law Sharp/Cremer + coincidence dip + hollow-core void leak + wood LF leak.
 */
export function bareAirborneShape(resolved: SlabMassRef): number[] {
  const m = Math.max(40, massKgM2(resolved));
  const fc = coincidenceHz(resolved);
  return atHz((f) => {
    const mass = 20 * Math.log10(m * f) - 47;
    const oct = Math.log2(f / Math.max(60, fc));
    let coin = -8 * Math.exp(-(oct * oct) / 0.28);
    if (f > fc) coin += Math.min(5, 3.2 * Math.max(0, oct));

    let extra = 0;
    if (resolved.kind === 'hollow') {
      // Thickness / void resonances: deeper 100–250 Hz than a solid of similar Rw.
      extra += f <= 250 ? -5.5 * (1 - (f - 100) / 180) : 0;
      extra += f >= 315 && f <= 630 ? -1.2 : 0;
    }
    if (resolved.kind === 'wood') {
      extra += f <= 125 ? -9 : f <= 200 ? -6 : f <= 400 ? -3 : -0.5;
      const oDeck = Math.log2(f / 1250);
      extra += -6 * Math.exp(-(oDeck * oDeck) / 0.4);
    }
    return mass + coin + extra;
  });
}

/**
 * Extra texture after Rw calibration (zero-ish mean for ISO 717):
 * wood stays weak at 100–250 Hz; ПК keeps a void dip. HF compensates so Rw holds.
 */
export function kindTextureDelta(resolved: SlabMassRef): number[] {
  if (resolved.kind === 'wood') {
    return atHz((f) => {
      if (f <= 100) return -8;
      if (f <= 125) return -7;
      if (f <= 160) return -5.5;
      if (f <= 250) return -3;
      if (f <= 400) return -1;
      if (f >= 2000) return 2.2;
      if (f >= 1000) return 1.4;
      return 0.6;
    });
  }
  if (resolved.kind === 'hollow') {
    return atHz((f) => {
      if (f <= 125) return -3.5;
      if (f <= 200) return -2.5;
      if (f <= 315) return -1.2;
      if (f >= 1250) return 1.2;
      return 0.4;
    });
  }
  return atHz(() => 0);
}

/**
 * Bare Ln(f) prototype (lower = better). Solid-180 shape from typical RC tapping
 * curves; mass and kind as relative corrections, then calibrated to Trofimov Lnw.
 */
export function bareImpactLnShape(resolved: SlabMassRef): number[] {
  const m = Math.max(40, massKgM2(resolved));
  const m180 = RHO_RC * 0.18;
  const massAdj = -15 * Math.log10(m / m180);
  return atHz((f) => {
    // Typical RC: loud 100–315 Hz, falling toward 2–4 kHz.
    const base =
      78 -
      8 * Math.log10(f / 100) +
      (f <= 160 ? 4 : 0) -
      (f >= 1600 ? 6 * Math.log10(f / 1600) : 0);
    let kind = 0;
    if (resolved.kind === 'hollow') {
      kind = f <= 200 ? -1.5 : -2.5;
    }
    if (resolved.kind === 'wood') {
      kind = f <= 160 ? 10 : f <= 400 ? 6 : 3;
    }
    return base + massAdj + kind;
  });
}

export function floorAirDelta(floor: 'bare' | 'ordinary' | 'floating'): number[] {
  if (floor === 'bare') return atHz(() => 0);
  if (floor === 'ordinary') {
    // Thin finish / screed without resilient layer: mostly HF.
    return atHz((f) => (f < 250 ? 0.2 : f < 800 ? 0.8 : 1.4));
  }
  // Floating screed: added mass + decoupling, weaker below the system resonance.
  return atHz((f) => {
    if (f <= 100) return 0.8;
    if (f <= 160) return 1.4;
    if (f <= 315) return 2.4;
    if (f <= 800) return 3.6;
    return 4.4;
  });
}

/** ΔLn(f) to subtract from Ln (positive = quieter). Floating: weak at 100 Hz, strong 250–1600. */
export function floorImpactReduction(floor: 'bare' | 'ordinary' | 'floating'): number[] {
  if (floor === 'bare') return atHz(() => 0);
  if (floor === 'ordinary') {
    return atHz((f) => (f < 200 ? 0.8 : f < 800 ? 2.5 : 4.5));
  }
  return atHz((f) => {
    if (f <= 100) return 5;
    if (f <= 125) return 7;
    if (f <= 160) return 10;
    if (f <= 200) return 14;
    if (f <= 250) return 18;
    if (f <= 315) return 22;
    if (f <= 500) return 26;
    if (f <= 800) return 29;
    if (f <= 1600) return 30;
    if (f <= 2500) return 26;
    return 20;
  });
}

export function drumAirDelta(kind: SlabKind): number[] {
  const light = kind === 'wood' ? 1.4 : kind === 'hollow' ? 1.15 : 1;
  return atHz((f) => {
    if (f < 160 || f > 1000) return 0;
    const t = (Math.log(f) - Math.log(200)) / (Math.log(800) - Math.log(200));
    const clamped = Math.min(1, Math.max(0, t));
    const bell = Math.sin(Math.PI * clamped);
    const skirts = f >= 160 && f <= 1000 && (f < 200 || f > 800) ? 0.45 : 0;
    return -4.5 * light * (bell + skirts);
  });
}
