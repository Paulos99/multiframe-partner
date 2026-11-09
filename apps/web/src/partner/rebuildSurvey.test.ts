import assert from 'node:assert/strict';
import test from 'node:test';
import { buildLocalDemoObjects } from './demoSeed.ts';
import { freshSurveyFromRoom, sessionFromRoom } from './roomLink.ts';
import { createInitialSession } from '../state/session.ts';
import { ROOM_SUBSTEPS } from '../state/types.ts';

const chernov = buildLocalDemoObjects().find((o) => o.id === 'obj_a11')!;

test('Чернов: «Пересобрать» профиль открывает Проблемомер на первом вопросе, а не на заставке', () => {
  assert.ok(chernov, 'в демо есть комната Чернова');
  const session = freshSurveyFromRoom(chernov);
  assert.equal(session.step, 'room');
  assert.equal(session.roomSubstep, ROOM_SUBSTEPS[0]);
  assert.equal(session.derived, null, 'старых результатов нет');
});

test('Чернов: опрос заново — тип и площадь комнаты сохраняются, прежние ответы не подставляются', () => {
  const base = createInitialSession().answers.room;
  const fresh = freshSurveyFromRoom(chernov).answers.room;
  const old = sessionFromRoom(chernov).answers.room;
  assert.equal(fresh.ceilingAreaM2, chernov.room.areaM2);
  assert.equal(fresh.roomType, old.roomType);
  assert.equal(old.slabType, 'hollow');
  assert.equal(fresh.slabType, base.slabType);
  assert.equal(fresh.houseType, base.houseType);
});
