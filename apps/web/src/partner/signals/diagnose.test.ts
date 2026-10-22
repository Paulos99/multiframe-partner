import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INSUFFICIENT_OBSERVATIONS_LABEL, type PlatformEvent } from '../../../../../packages/shared/events';
import { dealsToFunnel, diagnose, toolCountsFromAnalytics, toolCountsFromEvents } from './diagnose';

const funnel = (over: Record<string, number> = {}) => ({
  offered: 0,
  calculated: 0,
  quoteCreated: 0,
  quoteSentConfirmed: 0,
  accepted: 0,
  declined: 0,
  postponed: 0,
  ...over,
});

test('small samples produce insufficient observations signal', () => {
  const signals = diagnose({ funnel: funnel({ offered: 3, calculated: 0 }) });
  assert.ok(signals.length > 0);
  for (const s of signals) {
    assert.ok(s.sampleSize < 5);
    assert.ok(s.label.includes(INSUFFICIENT_OBSERVATIONS_LABEL));
    assert.equal(s.confidence, 'low');
  }
});

test('reliable low conversion yields a real signal with hypothesis', () => {
  const signals = diagnose({ funnel: funnel({ offered: 20, calculated: 4, quoteCreated: 4, quoteSentConfirmed: 4 }) });
  const s = signals.find((x) => x.kind === 'offer_to_calc');
  assert.ok(s);
  assert.equal(s!.sampleSize, 20);
  assert.equal(s!.confidence, 'medium');
  assert.ok(!s!.label.includes(INSUFFICIENT_OBSERVATIONS_LABEL));
  assert.ok(s!.hypothesis.length > 0);
});

test('healthy funnel with enough data emits no conversion signal', () => {
  const signals = diagnose({
    funnel: funnel({
      offered: 40,
      calculated: 35,
      quoteCreated: 30,
      quoteSentConfirmed: 28,
      accepted: 15,
      declined: 5,
      postponed: 3,
    }),
  });
  assert.deepEqual(signals, []);
});

test('high decline share detected and sampleSize is decided count', () => {
  const signals = diagnose({
    funnel: funnel({
      offered: 40,
      calculated: 35,
      quoteCreated: 30,
      quoteSentConfirmed: 28,
      accepted: 2,
      declined: 12,
      postponed: 2,
    }),
  });
  const s = signals.find((x) => x.kind === 'high_decline');
  assert.ok(s);
  assert.equal(s!.sampleSize, 16);
  assert.equal(s!.confidence, 'medium');
});

test('no funnel and no tools yields no signals', () => {
  assert.deepEqual(diagnose({}), []);
  assert.deepEqual(diagnose({ funnel: null, tools: null }), []);
});

test('calculator errors and dropoff from tool counts', () => {
  const signals = diagnose({
    tools: { calculatorStarted: 30, calculatorCompleted: 10, calculatorFailed: 9 },
  });
  const kinds = signals.map((s) => s.kind);
  assert.ok(kinds.includes('calculator_dropoff'));
  assert.ok(kinds.includes('calculator_errors'));
  assert.ok(signals.every((s) => s.confidence === 'high'));
});

test('training and demo events are excluded from tool counts', () => {
  const ev = (name: PlatformEvent['name'], context: PlatformEvent['context']): PlatformEvent => ({
    eventId: `${name}-${context}-${Math.random()}`,
    name,
    occurredAt: '2026-01-01T00:00:00Z',
    orgId: 'o1',
    userId: 'u1',
    context,
  });
  const counts = toolCountsFromEvents([
    ev('calculator_started', 'work'),
    ev('calculator_started', 'training'),
    ev('calculator_started', 'demo'),
    ev('calculator_failed', 'work'),
    ev('training_completed', 'work'),
  ]);
  assert.equal(counts.calculatorStarted, 1);
  assert.equal(counts.calculatorFailed, 1);
});

test('analytics mapping uses funnel and skips training events fallback', () => {
  const fromFunnel = toolCountsFromAnalytics({
    problemomer: { open: 10, result: 4 },
    calculator: { open: 8, calcDone: 3 },
  });
  assert.equal(fromFunnel.problemomerStarted, 10);
  assert.equal(fromFunnel.calculatorCompleted, 3);
  assert.equal(fromFunnel.calculatorFailed, undefined);

  const fromEvents = toolCountsFromAnalytics(
    { problemomer: { open: 0, result: 0 }, calculator: { open: 0, calcDone: 0 } },
    [
      { id: '1', tool: 'calculator', action: 'open' },
      { id: '2', tool: 'calculator', action: 'open', context: 'training' },
      { id: '3', tool: 'calculator', action: 'calc_done' },
    ],
  );
  assert.equal(fromEvents.calculatorStarted, 1);
  assert.equal(fromEvents.calculatorCompleted, 1);
});

test('signals never carry client PII fields', () => {
  const signals = diagnose({ funnel: funnel({ offered: 20, calculated: 2 }) });
  const json = JSON.stringify(signals);
  assert.ok(!/clientName|clientPhone|phone|address/i.test(json));
});

test('dealsToFunnel is cumulative by stage and outcome', () => {
  const f = dealsToFunnel([
    { stage: 'contact' },
    { stage: 'offered' },
    { stage: 'calculated' },
    { stage: 'quote_created' },
    { stage: 'quote_sent_confirmed' },
    { stage: 'quote_accepted' },
    { stage: 'quote_declined' },
    { stage: 'closed', outcome: 'postponed' },
  ]);
  assert.deepEqual(f, {
    offered: 7,
    calculated: 6,
    quoteCreated: 5,
    quoteSentConfirmed: 4,
    accepted: 1,
    declined: 1,
    postponed: 1,
  });
});
