import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildStaffMonthlySeries, buildStaffTopProjects } from '../../packages/shared/staffAnalytics.js';

describe('staffAnalytics', () => {
  it('top-7: только комнаты сотрудника, ранг по сумме КП, иначе по числу комнат', () => {
    const rooms = [
      {
        id: 'r1',
        projectId: 'p1',
        createdBy: 'u1',
        status: 'quote_sent',
        createdAt: '2026-11-02T10:00:00Z',
        updatedAt: '2026-11-03T10:00:00Z',
        quoteSentAt: '2026-11-03T10:00:00Z',
        estimate: { totalCost: 100000 },
        room: { areaM2: 20 },
      },
      {
        id: 'r2',
        projectId: 'p1',
        createdBy: 'u1',
        status: 'quote_sent',
        createdAt: '2026-11-02T11:00:00Z',
        updatedAt: '2026-11-03T11:00:00Z',
        quoteSentAt: '2026-11-03T11:00:00Z',
        estimate: { totalCost: 50000 },
        room: { areaM2: 10 },
      },
      {
        id: 'r3',
        projectId: 'p2',
        createdBy: 'u1',
        status: 'measured',
        createdAt: '2026-11-02T12:00:00Z',
        updatedAt: '2026-11-04T12:00:00Z',
        estimate: { totalCost: 0 },
        room: { areaM2: 40 },
      },
      {
        id: 'r4',
        projectId: 'p3',
        createdBy: 'other',
        status: 'quote_sent',
        createdAt: '2026-11-02T12:00:00Z',
        updatedAt: '2026-11-03T12:00:00Z',
        quoteSentAt: '2026-11-03T12:00:00Z',
        estimate: { totalCost: 999999 },
        room: { areaM2: 99 },
      },
    ];
    const projects = [
      { id: 'p1', name: 'Большой', clientName: 'Иванов', status: 'proposal' },
      { id: 'p2', name: 'Малый', clientName: 'Петров', status: 'measure' },
      { id: 'p3', name: 'Чужой', clientName: 'Сидоров', status: 'proposal' },
    ];
    const top = buildStaffTopProjects({
      rooms,
      projects,
      userId: 'u1',
      from: '2026-11-01T00:00:00Z',
      to: '2026-11-30T23:59:59Z',
      limit: 7,
    });
    assert.equal(top.length, 2);
    assert.equal(top[0].id, 'p1');
    assert.equal(top[0].quoteSum, 150000);
    assert.equal(top[0].clientName, 'Иванов');
    assert.equal(top[0].stage, 'Предложение');
    assert.equal(top[0].rankBy, 'quote');
    assert.equal(top[1].id, 'p2');
    assert.ok(!top.some((r) => r.id === 'p3'));
  });

  it('top-7: без сумм ранжирует по числу комнат', () => {
    const rooms = [
      { id: 'a', projectId: 'p1', createdBy: 'u1', status: 'draft', createdAt: '2026-11-02T10:00:00Z', updatedAt: '2026-11-02T10:00:00Z', room: { areaM2: 5 } },
      { id: 'b', projectId: 'p1', createdBy: 'u1', status: 'draft', createdAt: '2026-11-02T11:00:00Z', updatedAt: '2026-11-02T11:00:00Z', room: { areaM2: 5 } },
      { id: 'c', projectId: 'p2', createdBy: 'u1', status: 'draft', createdAt: '2026-11-02T12:00:00Z', updatedAt: '2026-11-02T12:00:00Z', room: { areaM2: 50 } },
    ];
    const projects = [
      { id: 'p1', name: 'Две комнаты', status: 'new' },
      { id: 'p2', name: 'Одна комната', status: 'new' },
    ];
    const top = buildStaffTopProjects({
      rooms,
      projects,
      userId: 'u1',
      from: '2026-11-01T00:00:00Z',
      to: '2026-11-30T23:59:59Z',
    });
    assert.equal(top[0].id, 'p1');
    assert.equal(top[0].rankBy, 'rooms');
    assert.equal(top[0].rooms, 2);
  });

  it('monthly: считает КП, замеры, монтажи и сумму по месяцам', () => {
    const rooms = [
      {
        id: 'r1',
        createdBy: 'u1',
        status: 'install',
        createdAt: '2026-10-05T10:00:00Z',
        updatedAt: '2026-11-10T10:00:00Z',
        quoteSentAt: '2026-11-01T10:00:00Z',
        estimate: { totalCost: 20000 },
        room: { areaM2: 12 },
      },
      {
        id: 'r2',
        createdBy: 'u1',
        status: 'measured',
        createdAt: '2026-11-08T10:00:00Z',
        updatedAt: '2026-11-09T10:00:00Z',
        estimate: { totalCost: 0 },
        room: { areaM2: 8 },
      },
    ];
    const series = buildStaffMonthlySeries({
      rooms,
      userId: 'u1',
      from: '2026-10-01T00:00:00Z',
      to: '2026-11-30T23:59:59Z',
    });
    assert.ok(series.length >= 2);
    const nov = series.find((p) => p.key === '2026-11');
    assert.ok(nov);
    assert.equal(nov.quotes, 1);
    assert.equal(nov.sum, 20000);
    assert.ok(nov.measures >= 1);
    assert.ok(nov.installs >= 1);
  });
});
