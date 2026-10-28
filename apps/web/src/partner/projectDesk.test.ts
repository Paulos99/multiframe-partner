import assert from 'node:assert/strict';
import test from 'node:test';
import type { JobObject, Project } from '../../../../packages/shared/partner';
import { estimateForRole, roleSeesProjectMoney } from '../../../../packages/shared/partner';
import {
  areaSum,
  crewProjectLists,
  effectiveProjectStatus,
  nextSteps,
  panelLabel,
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

test('монтажнику: сначала проекты с незакрытыми комнатами, готовые отдельно', () => {
  const open = {
    ...project,
    id: 'open',
    name: 'Тверская',
    address: 'ул. Тверская, 8',
  };
  const finished = {
    ...project,
    id: 'done',
    name: 'Арбат',
    address: 'ул. Арбат, 12',
  };
  const empty = { ...project, id: 'empty', name: 'Пустой', archivedAt: '2026-01-01' };
  const rooms = [
    room({ id: 'closed-room', projectId: 'open', status: 'closed', roomName: 'Кладовая', estimate: { panels: 2, dowels: 0 } }),
    room({ id: 'install-room', projectId: 'open', status: 'install', roomName: 'Детская', room: { areaM2: 16 }, estimate: { panels: 39, dowels: 0 } }),
    room({ id: 'done-room', projectId: 'done', status: 'closed', roomName: 'Гостиная', room: { areaM2: 18 }, estimate: { panels: 1, dowels: 0 } }),
    room({ id: 'other', projectId: 'elsewhere', status: 'install', roomName: 'Чужая' }),
  ];
  const lists = crewProjectLists([finished, open, empty], rooms, '');
  assert.deepEqual(lists.active.map((item) => item.project.id), ['open']);
  assert.deepEqual(
    lists.active[0]?.rooms.map((item) => item.id),
    ['install-room', 'closed-room'],
  );
  assert.deepEqual(lists.done.map((item) => item.project.id), ['done']);
  assert.equal(crewProjectLists([open], rooms, 'арбат').active.length, 0);
  assert.equal(crewProjectLists([finished], rooms, 'арбат').done.length, 1);
  assert.equal(panelLabel(1), '1 панель');
  assert.equal(panelLabel(39), '39 панелей');
  assert.equal(panelLabel(undefined), 'Панели не посчитаны');
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

test('deleteProjectWarning: считает комнаты и склоняет слово', async () => {
  const { deleteProjectWarning } = await import('./projectDesk.ts');
  assert.match(deleteProjectWarning(1), /1 комната\)/);
  assert.match(deleteProjectWarning(3), /3 комнаты\)/);
  assert.match(deleteProjectWarning(5), /5 комнат\)/);
  assert.match(deleteProjectWarning(11), /11 комнат\)/);
  assert.match(deleteProjectWarning(21), /21 комната\)/);
  assert.match(deleteProjectWarning(0), /нет комнат/);
});

test('roomProjectStatuses: комнаты берут стадию проекта, а не свою', async () => {
  const { roomProjectStatuses } = await import('./projectDesk.ts');
  const project = { id: 'prj_a', orgId: 'org', name: 'Чернов А.', status: 'measure' } as Project;
  const draft = room({ id: 'r1', status: 'draft', projectId: 'prj_a' });
  const install = room({ id: 'r2', status: 'install', projectId: 'prj_a' });
  const stages = roomProjectStatuses([project], [draft, install]);
  assert.equal(stages.r1, 'measure');
  assert.equal(stages.r2, 'measure');
  // Без сохранённой стадии — самая дальняя открытая стадия комнат, как на доске.
  const auto = roomProjectStatuses([{ ...project, status: undefined } as Project], [draft, install]);
  assert.equal(auto.r1, effectiveProjectStatus({ ...project, status: undefined } as Project, [draft, install]));
  assert.equal(auto.r1, 'install');
});
