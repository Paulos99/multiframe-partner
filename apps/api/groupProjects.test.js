import assert from 'node:assert/strict';
import test from 'node:test';
import { groupOrphanRooms } from '../../packages/shared/groupProjects.js';

test('пустой список и уже привязанные комнаты не создают ключ projects', () => {
  const empty = { objects: [] };
  assert.equal(groupOrphanRooms(empty), false);
  assert.equal(Object.prototype.hasOwnProperty.call(empty, 'projects'), false);

  const linked = {
    objects: [{ id: 'obj', orgId: 'org', projectId: 'prj_keep', clientName: 'Уже', address: 'ул. Ленина, 1' }],
  };
  assert.equal(groupOrphanRooms(linked), false);
  assert.equal(Object.prototype.hasOwnProperty.call(linked, 'projects'), false);
  assert.equal(linked.objects[0].projectId, 'prj_keep');
});

test('один клиент и адрес — один проект, чужая компания и пустой адрес отдельно', () => {
  const doc = {
    projects: [{ id: 'prj_old', orgId: 'org', name: 'Старый', clientName: 'Петров', address: 'пр. Мира, 1' }],
    objects: [
      { id: 'late', orgId: 'org', clientName: 'Иванова', address: 'ул. Ленина, 1', createdAt: '2024-02-01T00:00:00.000Z', clientPhone: '2' },
      { id: 'early', orgId: 'org', clientName: ' иванова ', address: 'ул.  Ленина, 1', createdAt: '2024-01-01T00:00:00.000Z', clientPhone: '1', city: 'Москва' },
      { id: 'other-address', orgId: 'org', clientName: 'Иванова', address: 'ул. Ленина, 2', createdAt: '2024-01-01T00:00:00.000Z' },
      { id: 'other-org', orgId: 'spb', clientName: 'Иванова', address: 'ул. Ленина, 1', createdAt: '2024-01-01T00:00:00.000Z' },
      { id: 'blank-a', orgId: 'org', clientName: ' ', address: '', createdAt: '2024-01-01T00:00:00.000Z' },
      { id: 'blank-b', orgId: 'org', clientName: '', address: ' ', createdAt: '2024-01-02T00:00:00.000Z' },
      { id: 'kept', orgId: 'org', projectId: 'prj_keep', clientName: 'Иванова', address: 'ул. Ленина, 1' },
    ],
  };
  assert.equal(groupOrphanRooms(doc), true);
  assert.equal(groupOrphanRooms(doc), false);
  const early = doc.objects.find((item) => item.id === 'early');
  const late = doc.objects.find((item) => item.id === 'late');
  assert.equal(early.projectId, late.projectId);
  assert.notEqual(early.projectId, doc.objects.find((item) => item.id === 'other-address').projectId);
  assert.notEqual(early.projectId, doc.objects.find((item) => item.id === 'other-org').projectId);
  assert.notEqual(doc.objects.find((item) => item.id === 'blank-a').projectId, doc.objects.find((item) => item.id === 'blank-b').projectId);
  assert.equal(doc.objects.find((item) => item.id === 'kept').projectId, 'prj_keep');
  const project = doc.projects.find((item) => item.id === early.projectId);
  assert.equal(project.name, 'иванова');
  assert.equal(project.clientName, 'иванова');
  assert.equal(project.clientPhone, '1');
  assert.equal(project.city, 'Москва');
  assert.equal(project.createdAt, '2024-01-01T00:00:00.000Z');
  assert.equal(project.totalCost, undefined);
  assert.equal(doc.projects.some((item) => item.id === 'prj_old'), true);
});
