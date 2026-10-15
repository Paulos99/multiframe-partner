/**
 * Construction layer: Trofimov indices + physically shaped R(f) / Ln(f).
 * Neighbors / room type / area do NOT belong here (see receiving.ts).
 *
 * Anchors (bare slab, no stretch drum, no floor, no flanking) — Trofimov 2026-09-09:
 * solid 180 mm → Rw 54 / Lnw 76; ПК 220 → 52 / 74.
 */
import type { HouseTypeOption, RoomAnswers, SlabKey } from '../types';
import { SPECTRUM_HZ, addBands, round0, round1 } from './bands';
import { calibrateToLnw, calibrateToRw, iso717Lnw, iso717Rw } from './iso717';
import {
  bareAirborneShape,
  bareImpactLnShape,
  bareIndices,
  drumAirDelta,
  drumRwShift,
  flankingAirDelta,
  flankingImpactDelta,
  flankingLnwShift,
  flankingRwShift,
  floorAirDelta,
  floorImpactReduction,
  floorIndexDelta,
  INSITU_LEAK_LNW,
  INSITU_LEAK_RW,
  kindTextureDelta,
  lnToIsolation,
  type SlabKind,
} from './materials';

export type { SlabKind };
export type FloorFinish = 'bare' | 'ordinary' | 'floating';

export interface ResolvedSlab {
  kind: SlabKind;
  thicknessMm: number;
  slabKey: SlabKey;
}

export interface ConstructionResult {
  resolved: ResolvedSlab;
  floor: FloorFinish;
  hasDrum: boolean;
  houseType: HouseTypeOption;
  /** Trofimov + floor + drum + in-situ flanking (before MultiFrame). */
  Rw: number;
  Lnw: number;
  /** Airborne R(f), dB. */
  R: number[];
  /** Impact isolation I(f), dB (higher = quieter). Chart series. */
  impactIsolation: number[];
  /** Ln(f) used for Lnw (lower = better). */
  Ln: number[];
}

const THICKNESS_MID: Record<string, number> = {
  up_to_160: 150,
  about_160_200: 180,
  about_200_250: 225,
  over_250: 260,
};

function slabKeyFor(kind: SlabKind, mm: number): SlabKey {
  if (kind === 'hollow') return 'pk220';
  if (kind === 'wood') return '180';
  if (mm <= 150) return '140';
  if (mm <= 170) return '160';
  if (mm <= 190) return '180';
  if (mm <= 225) return '200';
  return 'mono250';
}

export function resolveSlab(room: RoomAnswers): ResolvedSlab {
  const thick = room.slabThickness;
  const mid = thick === 'unknown' ? null : (THICKNESS_MID[thick] ?? null);

  if (room.slabType === 'hollow') {
    return { kind: 'hollow', thicknessMm: mid ?? 220, slabKey: 'pk220' };
  }
  if (room.slabType === 'wood') {
    return { kind: 'wood', thicknessMm: mid ?? 200, slabKey: '180' };
  }
  if (room.slabType === 'monolith') {
    const mm = mid ?? 180;
    return { kind: 'solid', thicknessMm: mm, slabKey: slabKeyFor('solid', mm) };
  }

  switch (room.houseType) {
    case 'panel':
    case 'block':
      return { kind: 'hollow', thicknessMm: mid ?? 220, slabKey: 'pk220' };
    case 'monolith': {
      const mm = mid ?? 200;
      return { kind: 'solid', thicknessMm: mm, slabKey: slabKeyFor('solid', mm) };
    }
    case 'brick': {
      const mm = mid ?? 180;
      return { kind: 'solid', thicknessMm: mm, slabKey: slabKeyFor('solid', mm) };
    }
    case 'wood':
      return { kind: 'wood', thicknessMm: mid ?? 200, slabKey: '180' };
    default: {
      const mm = mid ?? 180;
      return { kind: 'solid', thicknessMm: mm, slabKey: slabKeyFor('solid', mm) };
    }
  }
}

export function resolveFloor(room: RoomAnswers): FloorFinish {
  if (room.floorAbove === 'floating') return 'floating';
  if (room.floorAbove === 'ordinary') return 'ordinary';
  if (room.objectStage === 'newbuild') return 'bare';
  return 'ordinary';
}

/**
 * Stretch air-gap drum in «сейчас».
 * Product comparison is ordinary stretch vs MultiFrame, so the drum is always
 * in the baseline; MultiFrame removes it. `_room` kept for the RoomAnswers API.
 */
export function resolveDrum(_room: RoomAnswers): boolean {
  return true;
}

export function assembleConstruction(
  resolved: ResolvedSlab,
  floor: FloorFinish,
  hasDrum: boolean,
  houseType: HouseTypeOption = 'unknown',
  /** Lab/Trofimov fixtures: no mass-stock prior, no universal in-situ leak. */
  lab = false,
): ConstructionResult {
  const bare = bareIndices(resolved);
  const fd = floorIndexDelta(floor);
  const drumRw = drumRwShift(hasDrum, lab);
  // Lab unknown = pure slab. Product unknown = mass-housing flanking prior.
  const flankRw = lab && houseType === 'unknown' ? 0 : flankingRwShift(houseType);
  const flankLnw = lab && houseType === 'unknown' ? 0 : flankingLnwShift(houseType);
  const leakRw = lab ? 0 : INSITU_LEAK_RW;
  const leakLnw = lab ? 0 : INSITU_LEAK_LNW;
  const targetRw = round0(bare.Rw + fd.dRw - drumRw + flankRw + leakRw);
  const targetLnw = round0(bare.Lnw + fd.dLnw + flankLnw + leakLnw);

  let R = calibrateToRw(bareAirborneShape(resolved), SPECTRUM_HZ, bare.Rw);
  R = addBands(R, kindTextureDelta(resolved));
  R = calibrateToRw(R, SPECTRUM_HZ, bare.Rw);
  R = addBands(R, floorAirDelta(floor));
  if (hasDrum) R = addBands(R, drumAirDelta(resolved.kind));
  if (!(lab && houseType === 'unknown')) {
    R = addBands(R, flankingAirDelta(houseType));
  }
  R = calibrateToRw(R, SPECTRUM_HZ, targetRw);

  let Ln = calibrateToLnw(bareImpactLnShape(resolved), SPECTRUM_HZ, bare.Lnw);
  const floorRed = floorImpactReduction(floor);
  Ln = Ln.map((v, i) => round1(v - (floorRed[i] ?? 0)));
  if (!(lab && houseType === 'unknown')) {
    Ln = addBands(Ln, flankingImpactDelta(houseType));
  }
  Ln = calibrateToLnw(Ln, SPECTRUM_HZ, targetLnw);

  return {
    resolved,
    floor,
    hasDrum,
    houseType,
    Rw: iso717Rw(R, SPECTRUM_HZ),
    Lnw: iso717Lnw(Ln, SPECTRUM_HZ),
    R,
    impactIsolation: lnToIsolation(Ln),
    Ln,
  };
}

export function buildConstruction(room: RoomAnswers): ConstructionResult {
  return assembleConstruction(
    resolveSlab(room),
    resolveFloor(room),
    resolveDrum(room),
    room.houseType,
    false,
  );
}

/** Bare solid 180 mm, no drum, no flanking — Trofimov calibration case. */
export function constructionFixture(opts: {
  kind: SlabKind;
  thicknessMm: number;
  floor?: FloorFinish;
  drum?: boolean;
  houseType?: HouseTypeOption;
}): ConstructionResult {
  const resolved: ResolvedSlab = {
    kind: opts.kind,
    thicknessMm: opts.thicknessMm,
    slabKey: slabKeyFor(opts.kind, opts.thicknessMm),
  };
  return assembleConstruction(
    resolved,
    opts.floor ?? 'bare',
    opts.drum ?? false,
    opts.houseType ?? 'unknown',
    true,
  );
}
