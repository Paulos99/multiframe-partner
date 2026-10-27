import assert from 'node:assert/strict';
import test from 'node:test';
import type { JobObject, Project } from '../../../../packages/shared/partner';
import { estimateForRole, roleSeesProjectMoney } from '../../../../packages/shared/partner';
import {
  areaSum,
  effectiveProjectStatus,
  nextSteps,
  projectMatches,
  readProjectView,
  writeProjectView,
} from './projectDesk.ts';

function room(patch: Partial<JobObject> & Pick<JobObject, 'id' | 'status'>): JobObject {
  return {
    orgId: 'org',
    createdAt: '',
    updatedAt: '',
    createdBy: 'u',
    assignedTo: null,
    clientName: 'Клиент',
    clientPhone: '',
    address: 'Адрес',
    city: 'Москва',
    room: { areaM2: 12 },
    estimate: null,
    clientSummary: '',
    history: [],
    projectId: 'prj',
    roomName: 'Комната',
    ...patch,
  };
}

const project = {
  id: 'prj',
  orgId: 'org',
  name: 'Квартира',
  clientName: 'Орлова',
  clientPhone: '',
  address: 'ул. Лесная, 3',
  city: 'Москва',
  createdAt: '',
  updatedAt: '',
  createdBy: 'u',
} satisfies Project;

test('вид списка запоминается и по умолчанию таблица', () => {
  const bag = new Map<string, string>();
  const storage = {
    getItem: (key: string) => bag.get(key) ?? null,
    setItem: (key: string, value: string) => {
      bag.set(key, value);
    },
  };
  assert.equal(readProjectView(storage), 'list');
  writeProjectView(storage, 'kanban');
  assert.equal(readProjectView(storage), 'kanban');
  writeProjectView(storage, 'list');
  assert.equal(readProjectView(storage), 'list');
  assert.equal(readProjectView(null), 'list');
});

test('статус проекта: сохранённый важнее комнат, иначе дальняя открытая стадия', () => {
  const rooms = [
    room({ id: 'a', status: 'draft', roomName: 'Кухня' }),
    room({ id: 'b', status: 'install', roomName: 'Спальня' }),
  ];
  assert.equal(effectiveProjectStatus(project, rooms), 'install');
  assert.equal(effectiveProjectStatus({ ...project, status: 'measure' }, rooms), 'measure');
  assert.equal(
    effectiveProjectStatus(project, [room({ id: 'c', status: 'closed' })]),
    'done',
  );
});

test('ближайшие шаги и площадь не выдумывают сумму', () => {
  const rooms = [
    room({ id: 'a', status: 'draft', roomName: 'Кухня', room: { areaM2: null } }),
    room({ id: 'b', status: 'measured', roomName: 'Зал', room: { areaM2: 16 }, estimate: null }),
    room({ id: 'c', status: 'closed', roomName: 'Кладовая', room: { areaM2: 4 } }),
  ];
  assert.deepEqual(
    nextSteps(rooms).map((step) => step.text),
    ['Кухня: указать площадь', 'Зал: сделать расчёт'],
  );
  assert.deepEqual(areaSum(rooms), { known: 2, total: 20, missing: 1 });
  assert.equal(projectMatches(project, rooms, 'лесная'), true);
  assert.equal(projectMatches(project, rooms, 'нет такого'), false);
});

test('бригада не получает суммы, замерщик получает', () => {
  const estimate = { panels: 16, dowels: 4, panelsCost: 100, installCost: 20, totalCost: 120 };
  const crew = estimateForRole(estimate, 'crew');
  assert.equal(crew.panels, 16);
  assert.equal(crew.dowels, 4);
  assert.equal(crew.totalCost, undefined);
  assert.equal(crew.panelsCost, undefined);
  assert.equal(estimate.totalCost, 120);
  assert.equal(estimateForRole(estimate, 'measurer').totalCost, 120);
  assert.equal(roleSeesProjectMoney('measurer'), true);
  assert.equal(roleSeesProjectMoney('crew'), false);
  assert.equal(roleSeesProjectMoney('owner'), true);
});
