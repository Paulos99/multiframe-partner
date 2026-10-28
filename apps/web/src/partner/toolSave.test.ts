import assert from 'node:assert/strict';
import test from 'node:test';
import type { JobObject, Project } from '../../../../packages/shared/partner.ts';
import { calcUrlFromOrg } from './calcUrl.ts';
import { linkCalcToRoom } from './roomLink.ts';
import {
  canSaveToProject,
  cleanName,
  pickableProjects,
  resolveTargetProject,
  roomDataParts,
  roomHasData,
  roomLabel,
  roomsOfProject,
} from './toolSave.ts';

function project(id: string, name: string, extra: Partial<Project> = {}): Project {
  return {
    id,
    orgId: 'org',
    name,
    clientName: '',
    clientPhone: '',
    address: '',
    city: '',
    createdAt: '',
    updatedAt: '2026-10-01',
    createdBy: 'u',
    ...extra,
  };
}

function room(id: string, projectId: string, extra: Partial<JobObject> = {}): JobObject {
  return {
    id,
    orgId: 'org',
    createdAt: '',
    updatedAt: '',
    createdBy: 'u',
    assignedTo: null,
    status: 'draft',
    clientName: '',
    clientPhone: '',
    address: '',
    city: '',
    room: {},
    estimate: null,
    clientSummary: '',
    history: [],
    projectId,
    ...extra,
  };
}

test('кто может сохранять результат без проекта', () => {
  assert.equal(canSaveToProject('owner'), true);
  assert.equal(canSaveToProject('sales'), true);
  assert.equal(canSaveToProject('measurer'), true);
  assert.equal(canSaveToProject('crew'), false);
  assert.equal(canSaveToProject('admin'), false);
  assert.equal(canSaveToProject(undefined), false);
});

test('пустая комната не считается занятой, комната с площадью или ответами — занятая', () => {
  assert.equal(roomHasData(room('a', 'p')), false);
  const withArea = room('b', 'p', { room: { areaM2: 18 } });
  assert.equal(roomHasData(withArea), true);
  assert.deepEqual(roomDataParts(withArea), ['площадь 18 м²']);
  const profile = room('c', 'p', { room: { answers: { roomType: 'bedroom' } } });
  assert.deepEqual(roomDataParts(profile), ['профиль Проблемомера']);
  const calc = room('d', 'p', {
    estimate: { panels: 4, dowels: 8, panelsCost: null, installCost: null, dowelsCost: null, totalCost: null },
  });
  assert.deepEqual(roomDataParts(calc), ['расчёт']);
});

test('название комнаты: своё, иначе тип', () => {
  assert.equal(roomLabel(room('a', 'p', { roomName: 'Детская Маши' })), 'Детская Маши');
  assert.equal(roomLabel(room('b', 'p', { room: { roomType: 'kitchen' } })), 'Кухня');
  assert.equal(roomLabel(room('c', 'p', { room: { roomType: 'other', roomTypeCustom: 'Кладовая' } })), 'Кладовая');
  assert.equal(roomLabel(room('d', 'p')), 'Комната');
});

test('список проектов: поиск, архив, права по ролям', () => {
  const projects = [
    project('p1', 'Квартира на Ленина', { address: 'Ленина 5', updatedAt: '2026-10-02' }),
    project('p2', 'Дом Морозовых', { clientName: 'Морозова' }),
    project('p3', 'Старый', { archivedAt: '2026-09-01' }),
    project('p4', 'Чужой замерщику'),
  ];
  const rooms = [room('r1', 'p1'), room('r2', 'p2')];
  assert.deepEqual(
    pickableProjects('owner', projects, rooms, '').map((p) => p.id),
    ['p1', 'p2', 'p4'],
    'владелец видит все, кроме архивных, свежие первыми',
  );
  assert.deepEqual(pickableProjects('sales', projects, rooms, 'ЛЕНИНА').map((p) => p.id), ['p1']);
  assert.deepEqual(pickableProjects('sales', projects, rooms, 'морозова').map((p) => p.id), ['p2']);
  // Замерщик: только проекты, где есть его комнаты.
  assert.deepEqual(pickableProjects('measurer', projects, rooms, '').map((p) => p.id), ['p1', 'p2']);
  assert.deepEqual(roomsOfProject(rooms, 'p2').map((r) => r.id), ['r2']);
});

test('новый проект создаётся только с названием; существующий берётся из списка', async () => {
  const made: unknown[] = [];
  const create = async (input: { name?: string }) => {
    made.push(input);
    return project('new', input.name || '');
  };
  const found = await resolveTargetProject({ project: { id: 'p1' }, room: { id: 'r1' } }, [project('p1', 'A')], create, 'Москва');
  assert.equal(found.id, 'p1');
  assert.equal(made.length, 0);
  const fresh = await resolveTargetProject(
    { project: { create: { name: '  Новый   дом ' } }, room: { create: { name: 'Спальня' } } },
    [],
    create,
    'Москва',
  );
  assert.equal(fresh.name, 'Новый дом');
  assert.equal((made[0] as { city: string }).city, 'Москва');
  await assert.rejects(() =>
    resolveTargetProject({ project: { create: { name: '  ' } }, room: { create: { name: 'x' } } }, [], create, ''),
  );
  await assert.rejects(() => resolveTargetProject({ project: { id: 'zzz' }, room: { id: 'r' } }, [], create, ''));
  assert.equal(cleanName('  а   б '), 'а б');
});

test('расчёт без комнаты: площадь уходит в комнату и возвращается обратно', () => {
  const stub = room('r1', 'p1', { roomName: 'Спальня', room: { roomType: 'bedroom', roomTypeCustom: null } });
  const patch = linkCalcToRoom(
    { type: 'mf-cabinet-calc', saveRequest: true, areaM2: 18.4, panels: 12, dowels: 24, hasScheme: true },
    stub,
    null,
  );
  assert.equal(patch?.id, 'r1');
  assert.equal(patch?.room?.areaM2, 18.4);
  assert.equal(patch?.room?.roomType, 'bedroom');
  assert.equal(patch?.roomName, 'Спальня');
  assert.equal((patch?.room?.answers as { ceilingAreaM2: number }).ceilingAreaM2, 18.4);
});

test('кнопка «Сохранить в проект» в калькуляторе включается только флагом и только без комнаты', () => {
  assert.match(calcUrlFromOrg(null, 'Акустика', { saveToProject: true }), /saveToProject=1/);
  assert.doesNotMatch(calcUrlFromOrg(null, 'Акустика', {}), /saveToProject/);
  assert.doesNotMatch(calcUrlFromOrg(null, 'Акустика', { saveToProject: true, objectId: 'r1' }), /saveToProject/);
});
