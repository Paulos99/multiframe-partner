/**
 * Demo room-echo comfort — marketing scale, not Sabine / ISO 3382.
 * Percent is driven by object stage; RT60 / wet follow stage + ceiling area.
 */
import type { ObjectStageOption, RoomAnswers } from '../types';
import { round1 } from './bands';

export type ReverbProfile = {
  /** Порхающее эхо в помещении, % (меньше — лучше). Не путать с Rw/Lnw. */
  echoInRoomBefore: number;
  echoInRoomAfter: number;
  /** Approximate decay time for impulse synthesis (seconds). */
  rt60Before: number;
  rt60After: number;
  /** Convolver wet mix 0…1. */
  wetBefore: number;
  wetAfter: number;
  /** Early-reflection strength (flutter) 0…1 — stronger in empty rooms. */
  flutterBefore: number;
  flutterAfter: number;
};

const AREA_ANCHOR_M2 = 18;

function areaM2(room: RoomAnswers): number {
  return room.ceilingAreaM2 && room.ceilingAreaM2 > 0 ? room.ceilingAreaM2 : AREA_ANCHOR_M2;
}

/** Echo in room, % — lower with furnishing / MultiFrame. */
export function echoInRoomPct(stage: ObjectStageOption): { before: number; after: number } {
  switch (stage) {
    case 'newbuild':
      return { before: 100, after: 50 };
    case 'renovation':
      return { before: 75, after: 30 };
    case 'occupied':
    case 'unknown':
    default:
      return { before: 40, after: 10 };
  }
}

/** Area stretch for tail length (large rooms → longer echo). */
function areaScale(area: number): number {
  return Math.sqrt(Math.max(0.55, Math.min(2.4, area / AREA_ANCHOR_M2)));
}

/**
 * Base RT60 (s) for the empty-ish room before MultiFrame, by stage.
 * MultiFrame shortens the tail; furnishing already shortens «before».
 */
function baseRt60(stage: ObjectStageOption): { before: number; after: number } {
  switch (stage) {
    case 'newbuild':
      return { before: 1.55, after: 0.72 };
    case 'renovation':
      return { before: 1.15, after: 0.55 };
    case 'occupied':
    case 'unknown':
    default:
      return { before: 0.85, after: 0.38 };
  }
}

function wetFor(stage: ObjectStageOption): { before: number; after: number } {
  switch (stage) {
    case 'newbuild':
      return { before: 0.52, after: 0.22 };
    case 'renovation':
      return { before: 0.4, after: 0.16 };
    case 'occupied':
    case 'unknown':
    default:
      return { before: 0.32, after: 0.1 };
  }
}

function flutterFor(stage: ObjectStageOption): { before: number; after: number } {
  switch (stage) {
    case 'newbuild':
      return { before: 0.9, after: 0.35 };
    case 'renovation':
      return { before: 0.65, after: 0.25 };
    case 'occupied':
    case 'unknown':
    default:
      return { before: 0.4, after: 0.12 };
  }
}

export function buildReverbProfile(room: RoomAnswers): ReverbProfile {
  const stage = room.objectStage;
  const echoPct = echoInRoomPct(stage);
  const scale = areaScale(areaM2(room));
  const rt = baseRt60(stage);
  const wet = wetFor(stage);
  const flutter = flutterFor(stage);

  return {
    echoInRoomBefore: echoPct.before,
    echoInRoomAfter: echoPct.after,
    rt60Before: round1(rt.before * scale),
    rt60After: round1(rt.after * scale),
    wetBefore: round1(Math.min(0.65, wet.before * (0.92 + 0.08 * scale))),
    wetAfter: round1(Math.min(0.35, wet.after * (0.92 + 0.08 * scale))),
    flutterBefore: round1(flutter.before),
    flutterAfter: round1(flutter.after),
  };
}
