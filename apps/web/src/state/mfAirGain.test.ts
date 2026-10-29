import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MF_AIR_GAIN, MF_AIR_GAIN_MAX } from './acoustic/multiframe';
import { buildConstruction } from './acoustic/construction';
import { airClassFor, deriveSimulation } from './simulation';
import {
  FLOOR_ABOVE_OPTIONS,
  HOUSE_TYPE_OPTIONS,
  NOISY_NEIGHBORS_OPTIONS,
  OBJECT_STAGE_OPTIONS,
  PLANNED_CEILING_OPTIONS,
  SLAB_THICKNESS_OPTIONS,
  SLAB_TYPE_OPTIONS,
  type RoomAnswers,
  type SessionAnswers,
} from './types';

function* rooms(floors = FLOOR_ABOVE_OPTIONS.map((f) => f.id)): Generator<RoomAnswers> {
  for (const slab of SLAB_TYPE_OPTIONS)
    for (const thick of SLAB_THICKNESS_OPTIONS)
      for (const floorAbove of floors)
        for (const house of HOUSE_TYPE_OPTIONS)
          for (const ceiling of PLANNED_CEILING_OPTIONS)
            for (const nb of NOISY_NEIGHBORS_OPTIONS)
              for (const st of OBJECT_STAGE_OPTIONS)
                yield {
                  roomType: 'living', roomTypeCustom: '', ceilingAreaM2: 18,
                  slabType: slab.id, slabThickness: thick.id, floorAbove,
                  houseType: house.id, objectStage: st.id, plannedCeiling: ceiling.id,
                  noisyNeighbors: nb.id, noiseKind: 'mixed',
                  roomWishes: ['from_above', 'privacy_out', 'music_recording'],
                } as RoomAnswers;
}
const sim = (room: RoomAnswers) =>
  deriveSimulation({ interestFor: 'self', room, scope: 'ceiling' } as SessionAnswers);

describe('MF_AIR_GAIN — прибавка MultiFrame по воздушному шуму', () => {
  it('утверждённая таблица', () => {
    assert.deepEqual(MF_AIR_GAIN, {
      hollow: { up_to_160: 11, about_160_200: 10, about_200_250: 10, over_250: 9 },
      solid: { up_to_160: 11, about_160_200: 8, about_200_250: 6, over_250: 6 },
      wood: { up_to_160: 15, about_160_200: 15, about_200_250: 15, over_250: 15 },
    });
    assert.equal(MF_AIR_GAIN_MAX, 15);
  });

  it('везде: прибавка 0…15, «сейчас» не зависит от MultiFrame, итог ≤ 59', () => {
    for (const room of rooms()) {
      const s = sim(room);
      assert.equal(s.before.Rw, buildConstruction(room).Rw);
      const g = s.after.Rw - s.before.Rw;
      assert.ok(g >= 0 && g <= 15, `gain ${g}`);
      assert.ok(s.after.Rw <= 59, `after ${s.after.Rw}`);
    }
  });

  it('реальные сценарии (пол сверху «не знаю»): ≥ 90% «Высокий комфорт», итог ≤ 57', () => {
    let n = 0;
    let high = 0;
    for (const room of rooms(['unknown'])) {
      const s = sim(room);
      n++;
      if (airClassFor(s.after.Rw) === 'A') high++;
      assert.ok(s.after.Rw <= 57);
    }
    assert.ok(high / n >= 0.9, `${high}/${n}`);
  });
});
