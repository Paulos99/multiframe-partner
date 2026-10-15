/**
 * Receiving-room layer: source spectrum through R(f)/Ln(f), then Sabine-like A(f).
 * Does not change construction Rw/Lnw.
 *
 * L2(f) ≈ L1(f) − R(f) + 10·log10(S/A(f))   (airborne)
 * L2,imp(f) ≈ Ln(f) + 10·log10(A0/A(f)) + source   (impact, A0 = 10 m²)
 * Displayed "dBA" = A-weighted energy sum of those bands (orientative).
 */
import type { RoomAnswers, RoomType } from '../types';
import { atHz, clamp, round1 } from './bands';
import { aWeightedSumDb } from './aweight';
import type { ConstructionResult } from './construction';
import type { MultiFrameResult } from './multiframe';

const H_ROOM = 2.7;
const A0_IMPACT = 10;
/** Calibrated so solid 180 / living / 18 m² / occupied / unknown neighbors ≈ 50 dBA. */
const AIR_L1_OFFSET = 78.5;
/** Calibrated so the same case, Lnw 76, ≈ 64 dB-like impact. */
const IMPACT_L1_OFFSET = -10.5;

function areaM2(room: RoomAnswers): number {
  return room.ceilingAreaM2 && room.ceilingAreaM2 > 0 ? room.ceilingAreaM2 : 18;
}

function aspectWH(s: number): { w: number; l: number } {
  const l = Math.sqrt(1.4 * s);
  return { l, w: s / l };
}

function surfaceArea(s: number): number {
  const { w, l } = aspectWH(s);
  return 2 * s + 2 * (w + l) * H_ROOM;
}

function alpha1000(roomType: RoomType | null): number {
  switch (roomType) {
    case 'bedroom':
      return 0.28;
    case 'kids':
      return 0.24;
    case 'living':
      return 0.2;
    case 'office':
      return 0.18;
    case 'kitchen':
      return 0.12;
    default:
      return 0.18;
  }
}

function furnishingFactor(room: RoomAnswers): number {
  switch (room.objectStage) {
    case 'newbuild':
      return 0.62;
    case 'renovation':
      return 0.78;
    case 'occupied':
      return 1;
    default:
      return 0.9;
  }
}

/**
 * Job tilts the in-room mix (L2 / demo), not construction Rw/Lnw.
 * Incoming noise → impact; privacy / music → airborne speech band.
 */
function wishUseAdj(room: RoomAnswers, f: number, kind: 'air' | 'impact'): number {
  // Lazy import avoided — keep pure: inline via dynamic wishes list.
  const wishes = room.roomWishes ?? [];
  if (wishes.length === 0) return 0;
  let sum = 0;
  for (const wish of wishes) {
    switch (wish) {
      case 'from_above':
        sum += kind === 'impact' ? (f <= 250 ? 2.4 : 1.1) : f >= 200 && f <= 2500 ? 1.1 : 0.3;
        break;
      case 'privacy_out':
      case 'music_recording':
        sum += kind === 'air' ? (f >= 250 && f <= 2500 ? 2.6 : 0.5) : f <= 200 ? -0.4 : 0;
        break;
      case 'general':
        sum +=
          kind === 'air'
            ? f >= 250 && f <= 4000
              ? 1.4
              : 0.6
            : f >= 250 && f <= 2000
              ? 1.3
              : 0.5;
        break;
      default:
        break;
    }
  }
  return Math.min(sum, kind === 'air' ? 4.5 : 4.0);
}

/** Equivalent absorption A(f), m² sabin. Kitchen stays hard at HF; bedroom more HF. */
export function absorptionM2(room: RoomAnswers): number[] {
  const s = areaM2(room);
  const sTot = surfaceArea(s);
  const a1k = alpha1000(room.roomType) * furnishingFactor(room);
  const kitchen = room.roomType === 'kitchen';
  return atHz((f) => {
    const hf = Math.log(f / 100) / Math.log(50);
    const tilt = kitchen ? 0.35 + 0.35 * hf : 0.45 + 0.55 * hf;
    const a = clamp(a1k * tilt, 0.04, 0.55);
    return round1(a * sTot);
  });
}

export function neighborSourceDb(room: RoomAnswers): number {
  switch (room.noisyNeighbors) {
    case 'usually_quiet':
      return -4;
    case 'sometimes_noisy':
      return 3;
    case 'often_noisy':
      return 7;
    default:
      return 0;
  }
}

/** Airborne source-room band levels (unweighted). */
export function sourceAirBands(room: RoomAnswers): number[] {
  const n = neighborSourceDb(room);
  const party = room.noisyNeighbors === 'often_noisy';
  return atHz((f) => {
    // Dwelling mix: speech/TV around 250–2000 Hz; party adds LF music.
    const pink = -4.5 * Math.log2(f / 500);
    const speech = f >= 200 && f <= 2500 ? 4.5 : 0;
    const lfParty = party && f <= 160 ? 5 : party && f <= 250 ? 2.5 : 0;
    let roomAdj = 0;
    switch (room.roomType) {
      case 'office':
        roomAdj = f >= 250 && f <= 2000 ? 2.5 : 0;
        break;
      case 'kitchen':
        roomAdj = f >= 400 && f <= 4000 ? 3 : 1;
        break;
      case 'kids':
        roomAdj = f <= 400 ? 1.5 : 0.5;
        break;
      case 'bedroom':
        roomAdj = -1;
        break;
      default:
        roomAdj = 0;
    }
    return AIR_L1_OFFSET + pink + speech + lfParty + roomAdj + n + wishUseAdj(room, f, 'air');
  });
}

/** Extra impact excitation in the source room (added to Ln path). */
export function sourceImpactBands(room: RoomAnswers): number[] {
  const n = neighborSourceDb(room);
  return atHz((f) => {
    let kind = 0;
    switch (room.roomType) {
      case 'kids':
        kind = f <= 250 ? 6 : f <= 800 ? 3 : 1;
        break;
      case 'kitchen':
        kind = f >= 250 && f <= 2000 ? 3 : 1.5;
        break;
      case 'office':
        kind = f <= 200 ? -1 : 0.5;
        break;
      case 'bedroom':
        kind = -1;
        break;
      default:
        kind = 0;
    }
    const heavy = room.noisyNeighbors === 'often_noisy' && f <= 315 ? 2 : 0;
    return IMPACT_L1_OFFSET + n * 0.65 + kind + heavy + wishUseAdj(room, f, 'impact');
  });
}

function receiveAir(L1: number[], R: number[], A: number[], s: number): number[] {
  return L1.map((L, i) => {
    const a = Math.max(1.2, A[i] ?? 10);
    return round1(L - (R[i] ?? 0) + 10 * Math.log10(s / a));
  });
}

function receiveImpact(Ln: number[], extra: number[], A: number[]): number[] {
  return Ln.map((L, i) => {
    const a = Math.max(1.2, A[i] ?? 10);
    return round1(L + (extra[i] ?? 0) + 10 * Math.log10(A0_IMPACT / a));
  });
}

export interface ReceivingResult {
  airDba: { before: number; after: number };
  impactDba: { before: number; after: number };
  airBands: { before: number[]; after: number[] };
  impactBands: { before: number[]; after: number[] };
  absorption: number[];
}

export function buildReceiving(
  room: RoomAnswers,
  before: ConstructionResult,
  after: Pick<MultiFrameResult, 'R' | 'Ln'>,
): ReceivingResult {
  const s = areaM2(room);
  const A = absorptionM2(room);
  const L1 = sourceAirBands(room);
  const impExtra = sourceImpactBands(room);
  const airBefore = receiveAir(L1, before.R, A, s);
  const airAfter = receiveAir(L1, after.R, A, s);
  const impBefore = receiveImpact(before.Ln, impExtra, A);
  const impAfter = receiveImpact(after.Ln, impExtra, A);
  return {
    airDba: { before: aWeightedSumDb(airBefore), after: aWeightedSumDb(airAfter) },
    impactDba: { before: aWeightedSumDb(impBefore), after: aWeightedSumDb(impAfter) },
    airBands: { before: airBefore, after: airAfter },
    impactBands: { before: impBefore, after: impAfter },
    absorption: A,
  };
}

export function roomTypeSource(roomType: RoomType | null): { air: number; impact: number } {
  switch (roomType) {
    case 'kids':
      return { air: 1, impact: 4 };
    case 'kitchen':
      return { air: 2, impact: 2 };
    case 'office':
      return { air: 2, impact: 0 };
    default:
      return { air: 0, impact: 0 };
  }
}

export function areaTermDb(area: number | null): number {
  const s = area && area > 0 ? area : 18;
  return clamp(10 * Math.log10(s / 18), -3, 3);
}

export interface SourceMix {
  airDb: number;
  impactDb: number;
  areaDb: number;
  receivedAirOffset: number;
  receivedImpactOffset: number;
}

export function buildSource(room: RoomAnswers): SourceMix {
  const n = neighborSourceDb(room);
  const rt = roomTypeSource(room.roomType);
  const areaDb = areaTermDb(room.ceilingAreaM2);
  return {
    airDb: n + rt.air,
    impactDb: n + rt.impact,
    areaDb,
    receivedAirOffset: n + rt.air - areaDb,
    receivedImpactOffset: n + rt.impact - areaDb,
  };
}

/** @deprecated scalar fallback; prefer buildReceiving */
export function receivedAirDb(Rw: number, offset: number): number {
  return round1(104 - Rw + offset);
}

export function receivedImpactDb(Lnw: number, offset: number): number {
  return round1(Lnw - 12 + offset);
}

export function quietFromReceivedAir(receivedDb: number): number {
  return Math.round(clamp(((62 - receivedDb) / (62 - 38)) * 100, 4, 96));
}

export function quietFromReceivedImpact(receivedDb: number): number {
  return Math.round(clamp(((72 - receivedDb) / (72 - 42)) * 100, 4, 96));
}
