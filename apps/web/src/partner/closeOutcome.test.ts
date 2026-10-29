import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  REFUSAL_COMMENT_MAX,
  REFUSAL_OTHER_KEY,
  REFUSAL_REASONS,
  cleanRefusal,
  refusalStats,
} from '../../../../packages/shared/refusal.js';
import { PHONE_ROLES, cleanClientPhone, phoneStageAllowed, phoneRoomStatusAllowed, roleSeesClientPhone, projectStageOf } from '../../../../packages/shared/clientPhone.js';
import { closeChoiceError, projectStageLabel, refusalLine, roomStageLabel } from './closeOutcome.ts';

test('причины отказа совпадают с причинами тренажёра плюс «Другая причина»', () => {
  const trainer = JSON.parse(readFileSync(new URL('../trainer/content/objections.json', import.meta.url), 'utf8'));
  const keys = trainer.refusalReasons.map((r: { key: string }) => r.key);
  assert.deepEqual(REFUSAL_REASONS.map((r) => r.key), [...keys, REFUSAL_OTHER_KEY]);
});

test('надписи: «Завершён» без причины и «Отказ» с причиной', () => {
  const refusal = { reasonKey: 'price_too_high', comment: 'ушли к конкуренту', at: '2026-10-01T10:00:00Z', by: 'u1' };
  assert.equal(roomStageLabel({ status: 'closed' }), 'Завершён');
  assert.equal(roomStageLabel({ status: 'closed', refusal }), 'Отказ');
  assert.equal(roomStageLabel({ status: 'install' }), 'Монтаж');
  assert.equal(projectStageLabel({}, 'done'), 'Завершён');
  assert.equal(projectStageLabel({ refusal }, 'done'), 'Отказ');
  assert.equal(projectStageLabel({ refusal }, 'measure'), 'Замер');
  assert.match(refusalLine({ refusal }), /^Отказ: .*Дорого.*ушли к конкуренту/);
  assert.equal(refusalLine({}), '');
});

test('окно закрытия: отказ без причины не проходит, «Другая причина» требует комментарий', () => {
  assert.equal(closeChoiceError('completed', '', ''), '');
  assert.notEqual(closeChoiceError('refused', '', ''), '');
  assert.equal(closeChoiceError('refused', 'price_too_high', ''), '');
  assert.notEqual(closeChoiceError('refused', REFUSAL_OTHER_KEY, '  '), '');
  assert.equal(closeChoiceError('refused', REFUSAL_OTHER_KEY, 'уезжают'), '');
});

test('cleanRefusal: неизвестная причина и длинный комментарий отклоняются', () => {
  assert.ok(cleanRefusal({ reasonKey: 'nope' }).error);
  assert.ok(cleanRefusal({ reasonKey: REFUSAL_OTHER_KEY }).error);
  assert.equal(cleanRefusal({ reasonKey: 'price_too_high', comment: 'я'.repeat(REFUSAL_COMMENT_MAX + 50) }).value?.comment.length, REFUSAL_COMMENT_MAX);
  const ok = cleanRefusal({ reasonKey: 'price_too_high', comment: ' дорого ' }, { userId: 'u1', now: '2026-10-01T10:00:00Z' });
  assert.equal(ok.value?.comment, 'дорого');
  assert.equal(cleanRefusal(null).value, null);
});

test('аналитика отказов: считает только закрытые с причиной и учитывает период', () => {
  const room = (id: string, status: string, reasonKey: string | null, at: string) => ({
    id, status, updatedAt: at, ...(reasonKey ? { refusal: { reasonKey, comment: '', at, by: null } } : {}),
  });
  const rooms = [
    room('a', 'closed', 'price_too_high', '2026-10-05T10:00:00Z'),
    room('b', 'closed', 'price_too_high', '2026-10-06T10:00:00Z'),
    room('c', 'closed', 'not_needed', '2026-10-07T10:00:00Z'),
    room('d', 'closed', null, '2026-10-07T10:00:00Z'),
    room('e', 'closed', 'price_too_high', '2026-09-01T10:00:00Z'),
    room('f', 'install', null, '2026-10-07T10:00:00Z'),
  ];
  const all = refusalStats(rooms);
  assert.equal(all.total, 4);
  assert.equal(all.byReason[0].key, 'price_too_high');
  assert.equal(all.byReason[0].count, 3);
  const october = refusalStats(rooms, { from: '2026-10-01T00:00:00Z', to: '2026-10-31T23:59:59Z' });
  assert.equal(october.total, 3);
  assert.equal(refusalStats(null).total, 0);
});

test('номер клиента: формат и стадии', () => {
  assert.equal(cleanClientPhone('').value, '');
  assert.ok(cleanClientPhone('+7 900 123-45-67').value);
  assert.ok(cleanClientPhone('8 (900) 123-45-67').value);
  assert.ok(cleanClientPhone('abc').error);
  assert.ok(cleanClientPhone('123').error);
  assert.ok(cleanClientPhone('+7 900 123-45-67'.repeat(5)).error);
  assert.equal(phoneStageAllowed('new'), false);
  assert.equal(phoneStageAllowed('measure'), true);
  assert.equal(phoneStageAllowed('proposal'), true);
  assert.equal(phoneStageAllowed('install'), true);
  assert.equal(phoneStageAllowed('done'), false);
  assert.equal(phoneRoomStatusAllowed('draft'), false);
  assert.equal(phoneRoomStatusAllowed('measured'), true);
  assert.equal(projectStageOf({ status: 'measure' }, []), 'measure');
});

test('номер клиента видят менеджер, владелец, замерщик и монтажник, но не администратор', () => {
  assert.deepEqual([...PHONE_ROLES].sort(), ['crew', 'measurer', 'owner', 'sales']);
  assert.equal(roleSeesClientPhone('admin'), false);
  assert.equal(roleSeesClientPhone('crew'), true);
});
