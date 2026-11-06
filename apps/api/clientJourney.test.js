import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CLIENT_JOURNEY_STEPS,
  UNTRACKED_JOURNEY_IDS,
  computeClientJourney,
  JOURNEY_GROUPS,
  groupJourneySteps,
} from '../../packages/shared/clientJourney.js';

describe('clientJourney', () => {
  it('ровно 20 шагов и неотслеживаемые без чисел', () => {
    assert.equal(CLIENT_JOURNEY_STEPS.length, 20);
    const empty = computeClientJourney({ rooms: [], events: [] });
    assert.equal(empty.steps.length, 20);
    for (const step of empty.steps) {
      if (UNTRACKED_JOURNEY_IDS.has(step.id)) {
        assert.equal(step.count, null);
        assert.equal(step.fromPrevPct, 'нет данных');
      }
    }
  });

  it('отказ считается от всех закрытых, а не от шага «Завершено»', () => {
    const rooms = [
      { id: '1', status: 'closed', createdAt: '2026-11-01T10:00:00Z', updatedAt: '2026-11-02T10:00:00Z', refusal: null },
      {
        id: '2',
        status: 'closed',
        createdAt: '2026-11-01T10:00:00Z',
        updatedAt: '2026-11-03T10:00:00Z',
        refusal: { reasonKey: 'price_too_high', at: '2026-11-03T10:00:00Z' },
      },
      { id: '3', status: 'draft', createdAt: '2026-11-01T10:00:00Z', updatedAt: '2026-11-01T10:00:00Z' },
    ];
    const { steps } = computeClientJourney({
      rooms,
      events: [],
      from: '2026-11-01T00:00:00Z',
      to: '2026-11-30T23:59:59Z',
    });
    const done = steps.find((s) => s.id === 'completed');
    const refusal = steps.find((s) => s.id === 'refusal');
    assert.equal(done.count, 1);
    assert.equal(refusal.count, 1);
    assert.equal(refusal.fromPrevPct, '50%');
  });

  it('не выдумывает прохождение опроса', () => {
    const { steps } = computeClientJourney({
      rooms: [{ id: '1', status: 'draft', createdAt: '2026-11-01T10:00:00Z', updatedAt: '2026-11-01T10:00:00Z' }],
      events: [{ tool: 'problemomer', action: 'open', at: '2026-11-01T11:00:00Z', sessionId: 's1' }],
      from: '2026-11-01T00:00:00Z',
      to: '2026-11-30T23:59:59Z',
    });
    assert.equal(steps.find((s) => s.id === 'survey_done').count, 0);
    assert.equal(steps.find((s) => s.id === 'pm_open').count, 1);
  });

  it('события режутся по from/to — месяц и год расходятся', () => {
    const events = [
      { id: 'e1', at: '2026-01-15T12:00:00.000Z', tool: 'problemomer', action: 'open', sessionId: 'a' },
      { id: 'e2', at: '2026-10-15T12:00:00.000Z', tool: 'problemomer', action: 'open', sessionId: 'b' },
      { id: 'e3', at: '2026-10-16T12:00:00.000Z', tool: 'calculator', action: 'calc_done', sessionId: 'c' },
      { id: 'e4', at: '2026-01-20T12:00:00.000Z', tool: 'calculator', action: 'calc_done', sessionId: 'd' },
    ];
    const rooms = [{ id: '1', status: 'draft', createdAt: '2026-10-01T10:00:00Z', updatedAt: '2026-10-01T10:00:00Z' }];
    const month = computeClientJourney({
      rooms,
      events,
      from: '2026-10-01T00:00:00.000Z',
      to: '2026-10-31T23:59:59.999Z',
    });
    const year = computeClientJourney({
      rooms,
      events,
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-12-31T23:59:59.999Z',
    });
    assert.equal(month.steps.find((s) => s.id === 'pm_open').count, 1);
    assert.equal(year.steps.find((s) => s.id === 'pm_open').count, 2);
    assert.equal(month.steps.find((s) => s.id === 'calc_done').count, 1);
    assert.equal(year.steps.find((s) => s.id === 'calc_done').count, 2);
  });


  it('семь бывших «нет данных» шагов считаются по событиям', () => {
    const events = [
      { tool: 'problemomer', action: 'survey_done', at: '2026-11-02T12:00:00Z', sessionId: 's1' },
      { tool: 'problemomer', action: 'panel_view', at: '2026-11-02T12:01:00Z', sessionId: 's1' },
      { tool: 'calculator', action: 'calc_input', at: '2026-11-02T12:02:00Z', sessionId: 's1' },
      { tool: 'cabinet', action: 'offer', at: '2026-11-02T12:03:00Z', sessionId: 's1' },
      { tool: 'cabinet', action: 'client_agreed', at: '2026-11-02T12:04:00Z', sessionId: 's1' },
      { tool: 'cabinet', action: 'quote_accepted', at: '2026-11-02T12:05:00Z', sessionId: 's1' },
      { tool: 'cabinet', action: 'install_done', at: '2026-11-02T12:06:00Z', sessionId: 's1' },
    ];
    const { steps } = computeClientJourney({
      rooms: [{ id: '1', status: 'draft', createdAt: '2026-11-01T10:00:00Z', updatedAt: '2026-11-01T10:00:00Z' }],
      events,
      from: '2026-11-01T00:00:00Z',
      to: '2026-11-30T23:59:59Z',
    });
    for (const id of ['survey_done', 'panel_view', 'calc_input', 'offer', 'client_agreed', 'quote_accepted', 'install_done']) {
      assert.equal(steps.find((s) => s.id === id).count, 1, id);
    }
  });

  it('groupJourneySteps: 6 групп + отказ, % от предыдущей группы', () => {
    assert.equal(JOURNEY_GROUPS.length, 6);
    const { steps } = computeClientJourney({
      rooms: [
        { id: '1', status: 'closed', createdAt: '2026-11-01T10:00:00Z', updatedAt: '2026-11-05T10:00:00Z', refusal: null },
        {
          id: '2',
          status: 'closed',
          createdAt: '2026-11-01T10:00:00Z',
          updatedAt: '2026-11-05T10:00:00Z',
          refusal: { reasonKey: 'price_too_high', at: '2026-11-05T10:00:00Z' },
        },
      ],
      events: [
        { tool: 'problemomer', action: 'open', at: '2026-11-02T12:00:00Z', sessionId: 'a' },
        { tool: 'problemomer', action: 'survey_done', at: '2026-11-02T12:01:00Z', sessionId: 'a' },
        { tool: 'problemomer', action: 'result', at: '2026-11-02T12:02:00Z', sessionId: 'a' },
        { tool: 'problemomer', action: 'panel_view', at: '2026-11-02T12:03:00Z', sessionId: 'a' },
      ],
      from: '2026-11-01T00:00:00Z',
      to: '2026-11-30T23:59:59Z',
    });
    const { groups, refusal } = groupJourneySteps(steps);
    assert.equal(groups.length, 6);
    assert.equal(groups[0].label, 'Комната');
    assert.equal(groups[1].label, 'Проблемомер');
    assert.equal(groups[2].label, 'Калькулятор');
    assert.equal(groups[3].label, 'Предложение');
    assert.equal(groups[4].label, 'Замер и КП');
    assert.equal(groups[5].label, 'Монтаж');
    assert.ok(refusal);
    assert.equal(refusal.id, 'refusal');
    assert.equal(groups[0].count, 2);
    assert.equal(groups[1].count, 1); // panel_view final
    assert.equal(groups[1].fromPrevPct, '50%');
  });

});
