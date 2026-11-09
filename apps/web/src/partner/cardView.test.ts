import assert from 'node:assert/strict';
import test from 'node:test';
import type { JobObject } from '../../../../packages/shared/partner';
import { PROJECT_STAGES, ROOM_STAGES, roomNextStep, stageStates } from './cardView.ts';

const room = (patch: Record<string, unknown>) => ({ id: 'r', status: 'draft', room: { areaM2: 20 }, documents: [], ...patch }) as unknown as JobObject;

test('шкала этапов: пройденные, текущий и впереди', () => {
  assert.deepEqual(stageStates(ROOM_STAGES, 'quote_sent'), ['done', 'done', 'current', 'todo', 'todo']);
  assert.deepEqual(stageStates(PROJECT_STAGES, 'new'), ['current', 'todo', 'todo', 'todo', 'todo']);
  assert.deepEqual(stageStates(PROJECT_STAGES, 'done'), ['done', 'done', 'done', 'done', 'current']);
});

test('без площади первым шагом просим площадь', () => {
  const step = roomNextStep(room({ room: {} }), true);
  assert.equal(step.action, 'area');
  assert.equal(step.button, 'Указать площадь в Проблемомере');
});

test('черновик: Проблемомер, затем калькулятор, затем КП', () => {
  assert.equal(roomNextStep(room({}), true).action, 'diagnosis');
  assert.equal(roomNextStep(room({ room: { areaM2: 20, classBefore: 'below' } }), true).action, 'calculator');
  const ready = room({ room: { areaM2: 20, classBefore: 'below' }, estimate: { panels: 10, dowels: 20, totalCost: 1000 } });
  assert.equal(roomNextStep(ready, true).action, 'offer');
  assert.equal(roomNextStep(ready, false).button, '');
});

test('монтаж: завершает только тот, кто меняет этапы', () => {
  assert.equal(roomNextStep(room({ status: 'install' }), true).action, 'finish');
  assert.equal(roomNextStep(room({ status: 'install' }), false).action, null);
});

test('закрытая комната без кнопки', () => {
  const step = roomNextStep(room({ status: 'closed' }), true);
  assert.equal(step.button, '');
  assert.match(step.text, /закрыта/);
});
