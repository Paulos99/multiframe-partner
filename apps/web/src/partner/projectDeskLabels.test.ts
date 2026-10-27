import assert from 'node:assert/strict';
import test from 'node:test';
import type { JobObject, Project } from '../../../../packages/shared/partner';
import { problemomerLine, projectAssigneeId } from './projectDesk.ts';

const room = (patch: Record<string, unknown>) => ({ id: 'r', room: {}, ...patch }) as unknown as JobObject;

test('класс комфорта показан словами Проблемомера, без латинских кодов', () => {
  assert.equal(problemomerLine(room({ room: { classBefore: 'below', classAfter: 'V' } })), 'Дискомфорт → Допустимый (В)');
  assert.doesNotMatch(problemomerLine(room({ room: { classBefore: 'below', classAfter: 'V' } })), /below|\bV\b/);
  assert.equal(problemomerLine(room({})), 'Проблемомер ещё не заполнен');
});

test('исполнитель проекта берётся из комнат, если поле проекта пустое', () => {
  const staff = [
    { id: 'm1', role: 'measurer' },
    { id: 'c1', role: 'crew' },
  ];
  const project = { id: 'p', measurerUserId: null, crewUserId: 'c9' } as unknown as Project;
  const rooms = [room({ assignedTo: 'c1' }), room({ assignedTo: 'm1' })];
  assert.equal(projectAssigneeId(project, rooms, staff, 'measurer'), 'm1');
  assert.equal(projectAssigneeId(project, rooms, staff, 'crew'), 'c9');
  assert.equal(projectAssigneeId(project, [], staff, 'measurer'), null);
});
