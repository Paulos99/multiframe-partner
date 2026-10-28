import assert from 'node:assert/strict';
import test from 'node:test';
import { parseProjectHash, parseStaffHash, projectHash, staffHash } from './projectRoute.ts';

test('адрес проекта: вкладка по умолчанию «Обзор», комната отдельно', () => {
  assert.deepEqual(parseProjectHash(''), { kind: 'desk' });
  assert.deepEqual(parseProjectHash('#project/ui_project'), {
    kind: 'project',
    projectId: 'ui_project',
    tab: 'overview',
  });
  assert.deepEqual(parseProjectHash('#project/ui_project/work'), {
    kind: 'project',
    projectId: 'ui_project',
    tab: 'work',
  });
  assert.deepEqual(parseProjectHash('#project/ui_project/нет'), {
    kind: 'project',
    projectId: 'ui_project',
    tab: 'overview',
  });
  assert.deepEqual(parseProjectHash('#project/prj%201/room/room%2F1'), {
    kind: 'room',
    projectId: 'prj 1',
    roomId: 'room/1',
  });
  assert.equal(projectHash({ kind: 'desk' }), '');
  assert.equal(projectHash({ kind: 'project', projectId: 'ui_project', tab: 'overview' }), '#project/ui_project/overview');
  assert.equal(
    projectHash({ kind: 'room', projectId: 'ui_project', roomId: 'ui_room' }),
    '#project/ui_project/room/ui_room',
  );
  assert.deepEqual(parseStaffHash('#project/ui_project/overview'), { kind: 'list' });
  assert.deepEqual(parseStaffHash('#staff/ui%20sales'), { kind: 'person', staffId: 'ui sales' });
  assert.equal(staffHash({ kind: 'person', staffId: 'ui sales' }), '#staff/ui%20sales');
  assert.equal(staffHash({ kind: 'list' }), '');
});

test('адрес сохранённого расчёта комнаты: результаты проблемомера и калькулятора', () => {
  const profile = parseProjectHash('#project/p1/room/r1/result/profile');
  assert.deepEqual(profile, { kind: 'room', projectId: 'p1', roomId: 'r1', view: 'profile' });
  assert.equal(projectHash(profile), '#project/p1/room/r1/result/profile');
  assert.deepEqual(parseProjectHash('#project/p1/room/r1/result/estimate'), {
    kind: 'room',
    projectId: 'p1',
    roomId: 'r1',
    view: 'estimate',
  });
  // Лишнее в адресе не ломает комнату: открывается обычная карточка.
  assert.deepEqual(parseProjectHash('#project/p1/room/r1/result/нет'), { kind: 'room', projectId: 'p1', roomId: 'r1' });
});
