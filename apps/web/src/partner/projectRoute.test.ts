import assert from 'node:assert/strict';
import test from 'node:test';
import { parseProjectHash, projectHash } from './projectRoute.ts';

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
});
