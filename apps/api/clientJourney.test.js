import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CLIENT_JOURNEY_STEPS,
  UNTRACKED_JOURNEY_IDS,
  computeClientJourney,
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
    assert.equal(steps.find((s) => s.id === 'survey_done').count, null);
    assert.equal(steps.find((s) => s.id === 'pm_open').count, 1);
  });
});
