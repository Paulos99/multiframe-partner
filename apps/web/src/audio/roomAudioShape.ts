/**
 * Dry-stem → room playback shape.
 *
 * Continuous (music/stomp/vacuum): muffling through slab + room echo.
 * Clap: in-room source — almost no slab filter; contrast is echo length/wet.
 */
import { SPECTRUM_HZ, clamp, round1 } from '../state/acoustic/bands';
import {
  MARKETING_AFTER_GAIN_MAX,
  MARKETING_AFTER_GAIN_MIN,
  scaleAudioDelta,
} from '../state/acoustic/marketing';
import type { AudioPair, DerivedSimulation } from '../state/types';
import {
  KEY_BAND_INDICES,
  PLAYBACK_REF_DBA_AIR,
  PLAYBACK_REF_DBA_IMPACT,
  PLAYBACK_REF_DBA_MIXED,
  STEM_CALIBRATION,
  stemIdFromPairId,
  stemIdFromSrc,
  type StemId,
} from './stemCalibration';

export type AudioPlayGroup = 'air' | 'impact' | 'mixed' | 'echo';

export type RoomAudioShape = {
  stemId: StemId;
  mode: 'isolation' | 'echo';
  /** Broadband room offset vs dry stem — shared «До» base. */
  beforeGainDb: number;
  /** Relative После loudness vs До (≤ 0). Isolation only. */
  afterGainDb: number;
  /** Low-pass cutoff Hz for slab muffling (До). */
  mufflingHzBefore: number;
  /** Low-pass cutoff Hz with MultiFrame (После) — slightly more open / less harsh. */
  mufflingHzAfter: number;
  /** Peaking EQ residual for После (isolation). */
  deltaEqDb: number[];
  /** Echo params for this side pair. */
  rt60Before: number;
  rt60After: number;
  wetBefore: number;
  wetAfter: number;
  flutterBefore: number;
  flutterAfter: number;
  targetBeforeDb: number;
  targetAfterDb: number;
};

function mixBands(a: readonly number[], b: readonly number[]): number[] {
  return a.map((v, i) => round1((v + (b[i] ?? v)) / 2));
}

function pickBands(
  sim: DerivedSimulation,
  group: AudioPlayGroup,
): { before: number[]; after: number[]; targetBeforeDb: number; targetAfterDb: number } {
  if (group === 'echo') {
    // Clap is local — use air received levels only as a soft loudness cue
    return {
      before: sim.receivedAirBands.before,
      after: sim.receivedAirBands.after,
      targetBeforeDb: sim.receivedAirDb.before,
      targetAfterDb: sim.receivedAirDb.after,
    };
  }
  if (group === 'air') {
    return {
      before: sim.receivedAirBands.before,
      after: sim.receivedAirBands.after,
      targetBeforeDb: sim.receivedAirDb.before,
      targetAfterDb: sim.receivedAirDb.after,
    };
  }
  if (group === 'impact') {
    return {
      before: sim.receivedImpactBands.before,
      after: sim.receivedImpactBands.after,
      targetBeforeDb: sim.receivedImpactDb.before,
      targetAfterDb: sim.receivedImpactDb.after,
    };
  }
  const before = mixBands(sim.receivedAirBands.before, sim.receivedImpactBands.before);
  const after = mixBands(sim.receivedAirBands.after, sim.receivedImpactBands.after);
  return {
    before,
    after,
    targetBeforeDb: round1((sim.receivedAirDb.before + sim.receivedImpactDb.before) / 2),
    targetAfterDb: round1((sim.receivedAirDb.after + sim.receivedImpactDb.after) / 2),
  };
}

function playbackRefDb(group: AudioPlayGroup): number {
  if (group === 'impact') return PLAYBACK_REF_DBA_IMPACT;
  if (group === 'mixed') return PLAYBACK_REF_DBA_MIXED;
  return PLAYBACK_REF_DBA_AIR;
}

/**
 * Map received-room dBA → playback offset from dry stem («До» only).
 * Keep «До» present (uncomfortable) — slab muffling does the «through wall» feel.
 */
export function playbackGainForReceivedDb(
  receivedDba: number,
  group: AudioPlayGroup = 'air',
): number {
  if (group === 'echo') return 0;
  const delta = receivedDba - playbackRefDb(group);
  if (delta <= 0) return clamp(round1(delta * 0.55), -10, 0);
  return clamp(round1(delta * 0.25), 0, 3);
}

/** Music «До» — neighbours rarely blast that loud; −30% amplitude ≈ −3.1 dB. */
const AIR_BEFORE_LEVEL_SCALE = 0.7;
const AIR_BEFORE_EXTRA_DB = round1(20 * Math.log10(AIR_BEFORE_LEVEL_SCALE));

/**
 * Dry stems need a real through-slab low-pass.
 * До and После share the same muffling: После is quieter vs that muffled До,
 * not a clearer version of the dry sample.
 */
function mufflingHz(sim: DerivedSimulation, group: AudioPlayGroup): number {
  const Rw = sim.before.Rw;
  // Weaker floor → more HF leak; stronger → darker.
  const leak = clamp((50 - Rw) * 70, -500, 700);
  const base =
    group === 'impact' ? 980 : group === 'mixed' ? 1250 : 1550;
  return round1(clamp(base + leak, 700, 2400));
}

/** Floor so До/После always reads on dry household stems. */
function demoAfterFloorDb(group: AudioPlayGroup): number {
  if (group === 'impact') return -11;
  if (group === 'mixed') return -9;
  return -8;
}

/**
 * Quieter После: received Δ, index Δ (Rw/Lnw), and a demo floor — take the strongest cut.
 */
function isolationAfterGainDb(
  sim: DerivedSimulation,
  group: AudioPlayGroup,
  targetBeforeDb: number,
  targetAfterDb: number,
): number {
  const rawDelta = targetAfterDb - targetBeforeDb;
  const fromReceived = scaleAudioDelta(rawDelta);
  const fromIndex =
    group === 'impact'
      ? scaleAudioDelta(-Math.abs(sim.delta.Lnw))
      : group === 'air'
        ? scaleAudioDelta(-Math.abs(sim.delta.Rw))
        : scaleAudioDelta(
            -((Math.abs(sim.delta.Rw) + Math.abs(sim.delta.Lnw)) / 2),
          );
  const strongest = Math.min(fromReceived, fromIndex, demoAfterFloorDb(group));
  return clamp(round1(strongest), MARKETING_AFTER_GAIN_MIN, MARKETING_AFTER_GAIN_MAX);
}

export function buildRoomAudioShape(
  sim: DerivedSimulation,
  group: AudioPlayGroup,
  stemId: StemId,
): RoomAudioShape {
  void STEM_CALIBRATION[stemId];
  const rev = sim.reverb;
  const mode = group === 'echo' || stemId === 'clap' ? 'echo' : 'isolation';
  const { before, after, targetBeforeDb, targetAfterDb } = pickBands(sim, group);

  if (mode === 'echo') {
    return {
      stemId,
      mode,
      beforeGainDb: 0,
      afterGainDb: -1.5,
      mufflingHzBefore: 12000,
      mufflingHzAfter: 14000,
      deltaEqDb: KEY_BAND_INDICES.map(() => 0),
      rt60Before: rev.rt60Before,
      rt60After: rev.rt60After,
      wetBefore: rev.wetBefore,
      wetAfter: rev.wetAfter,
      flutterBefore: rev.flutterBefore,
      flutterAfter: rev.flutterAfter,
      targetBeforeDb,
      targetAfterDb,
    };
  }

  const beforeGainDb = round1(
    playbackGainForReceivedDb(targetBeforeDb, group) +
      (group === 'air' ? AIR_BEFORE_EXTRA_DB : 0),
  );
  const afterGainDb = isolationAfterGainDb(sim, group, targetBeforeDb, targetAfterDb);
  const slabHz = mufflingHz(sim, group);
  const rawDelta = targetAfterDb - targetBeforeDb;
  // Residual EQ on После only — never brighten vs До (no positive gains).
  const deltaEqDb = KEY_BAND_INDICES.map((i) => {
    const bandDelta = (after[i] ?? 0) - (before[i] ?? 0);
    const residual = bandDelta - rawDelta;
    const cut = Math.min(0, scaleAudioDelta(residual));
    const tilt = i >= 4 ? -0.8 : i >= 2 ? -0.4 : 0;
    return clamp(cut + tilt, -14, 0);
  });

  return {
    stemId,
    mode,
    beforeGainDb,
    afterGainDb,
    mufflingHzBefore: slabHz,
    mufflingHzAfter: slabHz,
    deltaEqDb,
    // Light room air on isolation demos too (tails shorter than clap)
    rt60Before: round1(rev.rt60Before * 0.55),
    rt60After: round1(rev.rt60After * 0.55),
    wetBefore: round1(rev.wetBefore * 0.45),
    wetAfter: round1(rev.wetAfter * 0.45),
    flutterBefore: round1(rev.flutterBefore * 0.5),
    flutterAfter: round1(rev.flutterAfter * 0.5),
    targetBeforeDb,
    targetAfterDb,
  };
}

export function buildRoomAudioShapeForPair(
  sim: DerivedSimulation,
  pair: Pick<AudioPair, 'id' | 'group' | 'beforeSrc'>,
): RoomAudioShape {
  const stemId = pair.beforeSrc
    ? stemIdFromSrc(pair.beforeSrc)
    : stemIdFromPairId(pair.id);
  const group = (pair.group as AudioPlayGroup) ?? 'air';
  return buildRoomAudioShape(sim, group, stemId);
}

export function effectiveAfterBandDb(shape: RoomAudioShape): number[] {
  return shape.deltaEqDb.map((d) => round1(shape.afterGainDb + d));
}

export function assertSpectrumAligned(levels: readonly number[]): boolean {
  return levels.length === SPECTRUM_HZ.length;
}

export { STEM_NORM_TARGET_DBFS, STEM_CALIBRATION } from './stemCalibration';
