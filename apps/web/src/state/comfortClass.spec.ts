import { describe, expect, it } from 'vitest';
import {
  FELT_STEPS,
  IMPACT_SCALE_STEPS,
  NORM_ROWS,
  airFeltAfterMultiFrame,
  airFeltFromIndex,
  comfortClassAfterMultiFrame,
  comfortClassFor,
  comfortTransitionLabel,
  comfortTransitionRank,
  deriveSimulation,
  impactFeltAfterMultiFrame,
  impactFeltFromIndex,
  mergeComfortTransitions,
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
  HYBRID_CLASS_LABELS,
  SCALE_LEVELS,
  SCALE_LEVEL_LABELS,
  type ClassLabel,
  type RoomAnswers,
  type SessionAnswers,
} from './types';
import { DEMO_CLASS_PAIRS } from '../partner/demoSeed';

/** СП 51: А > Б > В > ниже В (уровень «Дискомфорт»). */
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
  it('renders before on the left and after on the right, in three levels', () => {
    expect(comfortTransitionLabel('below', 'V')).toBe('Дискомфорт → Комфорт');
    expect(comfortTransitionLabel('V', 'B')).toBe('Комфорт → Комфорт');
    expect(comfortTransitionLabel('B', 'A')).toBe('Комфорт → Высокий комфорт');
    expect(comfortTransitionLabel('below', 'A')).toBe('Дискомфорт → Высокий комфорт');
  });

  it('merges the old four classes into three levels', () => {
    const merged = mergeComfortTransitions([
      { key: 'below→V', count: 4 },
      { key: 'V→B', count: 2 },
      { key: 'B→B', count: 1 },
      { key: 'V→V', count: 3 },
      { key: 'B→A', count: 5 },
    ]);
    expect(Object.fromEntries(merged.map((m) => [m.key, m.count]))).toEqual({
      'discomfort→comfort': 4,
      'comfort→comfort': 6,
      'comfort→high': 5,
    });
    expect(comfortTransitionLabel('comfort', 'high')).toBe('Комфорт → Высокий комфорт');
    expect(comfortTransitionRank('comfort→comfort')).toBeLessThan(comfortTransitionRank('discomfort→high'));
  });
});

describe('шкала Проблемомера: ровно три уровня', () => {
  it('имеет три названия и никаких «допустимо / ниже допустимого»', () => {
    expect(SCALE_LEVELS).toEqual(['discomfort', 'comfort', 'high']);
    expect(FELT_STEPS).toEqual(SCALE_LEVELS);
    const names = [
      ...Object.values(SCALE_LEVEL_LABELS),
      ...Object.values(HYBRID_CLASS_LABELS),
      ...NORM_ROWS.map((r) => `${r.label} ${r.sp}`),
    ].join(' | ');
    expect(Object.values(SCALE_LEVEL_LABELS)).toEqual(['Дискомфорт', 'Комфорт', 'Высокий комфорт']);
    expect(names).not.toMatch(/допустим|сильный дискомфорт|важно для вас|до 17 дБ/i);
    expect(new Set(NORM_ROWS.map((r) => r.label)).size).toBe(3);
  });

  it('воздух: Rw от порогов СП (54 и 50 дБ)', () => {
    expect(airFeltFromIndex(54)).toBe('high');
    expect(airFeltFromIndex(53)).toBe('comfort');
    expect(airFeltFromIndex(50)).toBe('comfort');
    expect(airFeltFromIndex(49)).toBe('discomfort');
  });

  it('удар: Lnw до 60 дБ — «Комфорт», выше — «Дискомфорт»; высокого комфорта по удару нет', () => {
    expect(impactFeltFromIndex(55)).toBe('comfort');
    expect(impactFeltFromIndex(60)).toBe('comfort');
    expect(impactFeltFromIndex(61)).toBe('discomfort');
    expect(IMPACT_SCALE_STEPS).toEqual(['discomfort', 'comfort']);
  });

  it('классы СП сводятся к уровням: А → высокий, Б и В → комфорт, ниже В → дискомфорт', () => {
    expect(HYBRID_CLASS_LABELS.A).toBe('Высокий комфорт');
    expect(HYBRID_CLASS_LABELS.B).toBe('Комфорт');
    expect(HYBRID_CLASS_LABELS.V).toBe('Комфорт');
    expect(HYBRID_CLASS_LABELS.below).toBe('Дискомфорт');
  });

  it('«с MultiFrame» никогда не «Дискомфорт», «сейчас» — может быть', () => {
    expect(airFeltAfterMultiFrame(41)).toBe('comfort');
    expect(impactFeltAfterMultiFrame(75)).toBe('comfort');
    expect(comfortClassAfterMultiFrame(41, 75)).toBe('V');
    expect(airFeltFromIndex(41)).toBe('discomfort');
    let afterDiscomfort = 0;
    let impactAfterHigh = 0;
    for (const room of allRooms()) {
      const sim = deriveSimulation(answers(room));
      if (airFeltAfterMultiFrame(sim.after.Rw) === 'discomfort') afterDiscomfort++;
      if (impactFeltAfterMultiFrame(sim.after.Lnw) === 'discomfort') afterDiscomfort++;
      if (comfortClassAfterMultiFrame(sim.after.Rw, sim.after.Lnw) === 'below') afterDiscomfort++;
      if (impactFeltAfterMultiFrame(sim.after.Lnw) === ('high' as string)) impactAfterHigh++;
    }
    expect(afterDiscomfort).toBe(0);
    expect(impactAfterHigh).toBe(0);
  }, 60_000);
});
