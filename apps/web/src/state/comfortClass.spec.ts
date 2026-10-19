import { describe, expect, it } from 'vitest';
import {
  comfortClassFor,
  comfortTransitionLabel,
  deriveSimulation,
} from './simulation';
import { applyMultiFrame } from './acoustic/multiframe';
import { buildConstruction } from './acoustic/construction';
import {
  FLOOR_ABOVE_OPTIONS,
  HOUSE_TYPE_OPTIONS,
  NOISY_NEIGHBORS_OPTIONS,
  OBJECT_STAGE_OPTIONS,
  PLANNED_CEILING_OPTIONS,
  SLAB_THICKNESS_OPTIONS,
  SLAB_TYPE_OPTIONS,
  type ClassLabel,
  type RoomAnswers,
  type SessionAnswers,
} from './types';
import { DEMO_CLASS_PAIRS } from '../partner/demoSeed';

/** СП 51: А > Б > В > ниже В («Дискомфорт»). */
const RANK: Record<ClassLabel, number> = { below: 0, V: 1, B: 2, A: 3 };

function* allRooms(): Generator<RoomAnswers> {
  for (const slab of SLAB_TYPE_OPTIONS)
    for (const thick of SLAB_THICKNESS_OPTIONS)
      for (const floor of FLOOR_ABOVE_OPTIONS)
        for (const house of HOUSE_TYPE_OPTIONS)
          for (const ceiling of PLANNED_CEILING_OPTIONS)
            for (const neighbors of NOISY_NEIGHBORS_OPTIONS)
              for (const stage of OBJECT_STAGE_OPTIONS)
                yield {
                  roomType: 'living',
                  roomTypeCustom: '',
                  ceilingAreaM2: 18,
                  slabType: slab.id,
                  slabThickness: thick.id,
                  floorAbove: floor.id,
                  houseType: house.id,
                  objectStage: stage.id,
                  plannedCeiling: ceiling.id,
                  noisyNeighbors: neighbors.id,
                  noiseKind: 'mixed',
                  roomWishes: ['from_above', 'privacy_out', 'music_recording'],
                };
}

const answers = (room: RoomAnswers): SessionAnswers =>
  ({ interestFor: 'self', room, scope: 'ceiling' }) as SessionAnswers;

describe('MultiFrame never lowers the comfort class', () => {
  const reachable = new Set<string>();
  const failures: string[] = [];
  for (const room of allRooms()) {
    const sim = deriveSimulation(answers(room));
    const before = comfortClassFor(sim.before.Rw, sim.before.Lnw);
    const after = comfortClassFor(sim.after.Rw, sim.after.Lnw);
    reachable.add(`${before}→${after}`);
    const tag = `${room.slabType}/${room.slabThickness}/${room.floorAbove}/${room.houseType}/${room.plannedCeiling}`;
    if (RANK[after] < RANK[before]) failures.push(`class ${tag}: ${before}→${after}`);
    if (sim.after.Rw < sim.before.Rw) failures.push(`Rw ${tag}: ${sim.before.Rw}→${sim.after.Rw}`);
    if (sim.after.Lnw > sim.before.Lnw) failures.push(`Lnw ${tag}: ${sim.before.Lnw}→${sim.after.Lnw}`);
    if (sim.reverb.echoInRoomAfter > sim.reverb.echoInRoomBefore) failures.push(`echo ${tag}`);
  }

  it('for every problem-meter input: class, Rw, Lnw and echo never get worse', () => {
    expect(failures.slice(0, 10)).toEqual([]);
  });

  it('a slab already at class-A impact (Lnw 55) is not pushed to 56 by the soft floor', () => {
    const room = {
      ...allRooms().next().value!,
      slabType: 'monolith',
      slabThickness: 'over_250',
      floorAbove: 'floating',
      houseType: 'monolith',
    } as RoomAnswers;
    const constr = buildConstruction(room);
    const mf = applyMultiFrame(constr);
    expect(mf.Lnw).toBeLessThanOrEqual(constr.Lnw);
    expect(mf.deltaLnw).toBeLessThanOrEqual(0);
  });

  it('demo analytics pairs are monotonic and reachable by the real calculation', () => {
    for (const [before, after] of DEMO_CLASS_PAIRS) {
      expect(RANK[after]).toBeGreaterThanOrEqual(RANK[before]);
      expect(reachable.has(`${before}→${after}`)).toBe(true);
    }
  });
});

describe('analytics «→» pair order', () => {
  it('renders before on the left and after on the right', () => {
    expect(comfortTransitionLabel('below', 'V')).toBe('Дискомфорт → Допустимый (В)');
    expect(comfortTransitionLabel('V', 'B')).toBe('Допустимый (В) → Комфорт (Б)');
    expect(comfortTransitionLabel('B', 'A')).toBe('Комфорт (Б) → Высокий комфорт (А)');
  });
});
