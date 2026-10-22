/**
 * Волна 0: правила коммерческого контракта PRD.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyDealOutcome,
  derivedAssignedTo,
  jobClosedImpliesDealAccepted,
  resolveDealOutcome,
} from '../../packages/shared/deal.js';
import {
  applyQuoteAction,
  copyOrPdfImpliesSent,
  isSentConfirmed,
  nextQuoteLifecycle,
} from '../../packages/shared/quote.js';
import {
  assertEventPayloadSafe,
  computeDealFunnel,
  countsTowardSalesKpi,
  dedupeEventsById,
  diagnosisConfidence,
  INSUFFICIENT_OBSERVATIONS_LABEL,
} from '../../packages/shared/events.js';
import {
  learningAttemptAffectsSalesFunnel,
  openingCountsAsMastery,
  scoreWithFalsePromisePenalty,
} from '../../packages/shared/learning.js';
import {
  assertSupportPayloadSafe,
  createSupportCase,
  interventionResultFromSamples,
  isSupportPayloadSafe,
} from '../../packages/shared/support.js';

test('копирование текста КП не означает отправку', () => {
  assert.equal(copyOrPdfImpliesSent('copy_text'), false);
  assert.equal(copyOrPdfImpliesSent('generate_pdf'), false);
  assert.equal(nextQuoteLifecycle('quote_created', 'copy_text'), 'quote_created');
  assert.equal(nextQuoteLifecycle('quote_created', 'generate_pdf'), 'quote_created');
});

test('только confirm_sent ставит quote_sent_confirmed', () => {
  const base = {
    id: 'qr1',
    projectId: 'p1',
    dealId: 'd1',
    version: 1,
    pdfStorageKey: null,
    amount: 1000,
    roomObjectIds: ['o1'],
    createdAt: '2026-10-22T10:00:00.000Z',
    createdBy: 'u1',
    sharedAt: null,
    sentConfirmedAt: null,
    sentComment: null,
    lifecycle: 'quote_created',
  };
  const shared = applyQuoteAction(base, 'share', '2026-10-22T11:00:00.000Z');
  assert.equal(shared.lifecycle, 'quote_shared');
  assert.equal(isSentConfirmed(shared), false);
  const confirmed = applyQuoteAction(shared, 'confirm_sent', '2026-10-22T12:00:00.000Z');
  assert.equal(confirmed.lifecycle, 'quote_sent_confirmed');
  assert.equal(isSentConfirmed(confirmed), true);
});

test('closed объекта не означает выигранную сделку', () => {
  assert.equal(jobClosedImpliesDealAccepted('closed'), false);
  assert.equal(resolveDealOutcome({ outcome: null, stage: 'closed' }), null);
  const deal = {
    id: 'd1',
    orgId: 'org1',
    projectId: 'p1',
    stage: 'quote_sent_confirmed',
    ownerUserId: 'u1',
    assignments: { salesUserId: 's1', measurerUserId: null, crewUserId: null },
    nextActionAt: null,
    outcome: null,
    lossReason: null,
    createdAt: '2026-10-22T10:00:00.000Z',
    updatedAt: '2026-10-22T10:00:00.000Z',
  };
  const won = applyDealOutcome(deal, 'accepted');
  assert.equal(won.outcome, 'accepted');
  assert.equal(won.stage, 'quote_accepted');
});

test('assignedTo производный от ObjectAssignments', () => {
  assert.equal(
    derivedAssignedTo({ salesUserId: 's', measurerUserId: 'm', crewUserId: 'c' }),
    'm',
  );
  assert.equal(
    derivedAssignedTo({ salesUserId: 's', measurerUserId: null, crewUserId: 'c' }),
    's',
  );
  assert.equal(
    derivedAssignedTo({ salesUserId: null, measurerUserId: null, crewUserId: 'c' }),
    'c',
  );
});

test('события без ПД клиентов', () => {
  assert.deepEqual(assertEventPayloadSafe({ tool: 'calculator', action: 'open' }), []);
  assert.ok(assertEventPayloadSafe({ clientPhone: '+7999' }).includes('clientPhone'));
  assert.ok(assertEventPayloadSafe({ clientName: 'Иван' }).includes('clientName'));
  assert.ok(assertEventPayloadSafe({ pdfBase64: 'AAA' }).includes('pdfBase64'));
});

test('учебный контекст не входит в боевые KPI и воронку', () => {
  assert.equal(countsTowardSalesKpi({ context: 'training', name: 'quote_created' }), false);
  assert.equal(countsTowardSalesKpi({ context: 'demo', name: 'deal_accepted' }), false);
  assert.equal(countsTowardSalesKpi({ context: 'work', name: 'quote_created' }), true);
  assert.equal(
    learningAttemptAffectsSalesFunnel({
      id: 'a1',
      userId: 'u',
      orgId: 'o',
      scenarioId: 'sell_multiframe',
      status: 'completed',
      startedAt: 't',
      completedAt: 't',
      score: 80,
      errorTypes: [],
      context: 'training',
    }),
    false,
  );
  assert.equal(openingCountsAsMastery({ status: 'started' }), false);
});

test('воронка считается по dealId, не по комнатам', () => {
  const events = [
    {
      eventId: 'e1',
      name: 'multiframe_offered',
      occurredAt: '2026-10-22T10:00:00.000Z',
      orgId: 'org',
      userId: 'u',
      dealId: 'deal-A',
      context: 'work',
    },
    {
      eventId: 'e2',
      name: 'calculator_completed',
      occurredAt: '2026-10-22T10:05:00.000Z',
      orgId: 'org',
      userId: 'u',
      dealId: 'deal-A',
      context: 'work',
    },
    {
      eventId: 'e3',
      name: 'calculator_completed',
      occurredAt: '2026-10-22T10:06:00.000Z',
      orgId: 'org',
      userId: 'u',
      dealId: 'deal-A',
      context: 'work',
    },
    {
      eventId: 'e4',
      name: 'quote_created',
      occurredAt: '2026-10-22T10:10:00.000Z',
      orgId: 'org',
      userId: 'u',
      dealId: 'deal-A',
      context: 'work',
    },
    {
      eventId: 'e5',
      name: 'quote_created',
      occurredAt: '2026-10-22T10:11:00.000Z',
      orgId: 'org',
      userId: 'u',
      projectId: 'p1',
      dealId: null,
      context: 'work',
    },
    {
      eventId: 'e6',
      name: 'quote_created',
      occurredAt: '2026-10-22T10:12:00.000Z',
      orgId: 'org',
      userId: 'u',
      dealId: 'deal-B',
      context: 'training',
    },
  ];
  const funnel = computeDealFunnel(events);
  assert.equal(funnel.offered, 1);
  assert.equal(funnel.calculated, 1);
  assert.equal(funnel.quoteCreated, 1);
});

test('дедуп офлайн-очереди по eventId', () => {
  const out = dedupeEventsById([
    { eventId: 'x1', name: 'a' },
    { eventId: 'x1', name: 'a-dup' },
    { eventId: 'x2', name: 'b' },
  ]);
  assert.equal(out.length, 2);
  assert.equal(out[0].name, 'a');
});

test('малая выборка → недостаточно наблюдений', () => {
  const low = diagnosisConfidence(2);
  assert.equal(low.reliable, false);
  assert.equal(low.label, INSUFFICIENT_OBSERVATIONS_LABEL);
  assert.equal(diagnosisConfidence(10).reliable, true);
  assert.equal(interventionResultFromSamples(2, 8), 'insufficient_data');
  assert.equal(interventionResultFromSamples(6, 9), 'improved');
});

test('запрос помощи без ПД клиента', () => {
  const c = createSupportCase({
    id: 'sc1',
    orgId: 'org',
    openedByUserId: 'u1',
    role: 'sales',
    category: 'sales',
    module: 'calculator',
  });
  assert.equal(c.status, 'open');
  assert.ok(!('clientPhone' in c));
  assert.equal(isSupportPayloadSafe({ category: 'sales', module: 'cabinet' }), true);
  assert.ok(assertSupportPayloadSafe({ clientPhone: '1' }).includes('clientPhone'));
});

test('штраф за недостоверные обещания в тренажёре', () => {
  assert.equal(scoreWithFalsePromisePenalty(80, true), 55);
  assert.equal(scoreWithFalsePromisePenalty(80, false), 80);
});
