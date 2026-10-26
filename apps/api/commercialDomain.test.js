import assert from 'node:assert/strict';
import test from 'node:test';
import {
  acceptDeal,
  advanceAuto,
  applyQuoteDocument,
  checklistComplete,
  closeFulfilledDeal,
  declineDeal,
  inInstallPool,
  installPoolFromMigration,
  isTechReady,
  migrateLegacyCommercial,
  pauseDeal,
  planCalculation,
  resumeDeal,
  roomContribution,
  snapshotFromCalcs,
  sumOrdered,
} from '../../packages/shared/commercialRules.js';

const at = '2026-10-26T08:00:00.000Z';

function deal(extra = {}) {
  return {
    id: 'd1',
    orgId: 'org',
    projectId: 'p1',
    stage: 'contact',
    outcome: null,
    closedAt: null,
    roomAssent: {},
    assignments: { salesUserId: null, measurerUserId: null, crewUserId: null },
    updatedAt: at,
    ...extra,
  };
}

test('автостадии не ставят согласие и не двигают паузу', () => {
  const assessed = advanceAuto(deal(), 'assessed', at);
  assert.equal(assessed.stage, 'assessed');
  assert.equal(assessed.outcome, null);
  const paused = pauseDeal(assessed, { reason: 'expensive', at });
  assert.equal(paused.closedAt, null);
  assert.equal(paused.outcome, 'early_paused');
  assert.equal(advanceAuto(paused, 'calculated', at).stage, 'assessed');
  const resumed = resumeDeal(paused, at);
  assert.equal(resumed.id, 'd1');
  assert.equal(resumed.stage, 'assessed');
  assert.equal(resumed.outcome, null);
});

test('отказ терминален, принятие не закрывает сделку', () => {
  const refused = declineDeal(deal({ stage: 'calculated' }), { reason: 'no_need', early: true, at });
  assert.equal(refused.outcome, 'early_declined');
  assert.equal(refused.stage, 'closed');
  assert.ok(refused.closedAt);
  assert.throws(() => resumeDeal(refused, at), /возобновить/);

  const quote = {
    amount: 300,
    snapshot: {
      lines: [
        { roomId: 'a', amount: 100, calcType: 'detailed' },
        { roomId: 'b', amount: 200, calcType: 'preliminary' },
      ],
    },
  };
  const accepted = acceptDeal(deal({ stage: 'quote_sent_confirmed' }), quote, { a: 'ordered', b: 'deferred' }, at);
  assert.equal(accepted.outcome, 'accepted');
  assert.equal(accepted.closedAt, null);
  assert.equal(accepted.acceptedAmount, 100);
  assert.throws(() => acceptDeal(deal(), quote, { a: 'deferred', b: 'out_of_scope' }, at), /заказанн/);
});

test('итог комнаты не складывает оба типа расчёта', () => {
  const calcs = [
    { id: 'p', calcType: 'preliminary', revisionSeq: 1, divergent: false, amount: 100 },
    { id: 'd', calcType: 'detailed', revisionSeq: 1, divergent: false, amount: 250 },
  ];
  assert.deepEqual(roomContribution(calcs), { calcType: 'detailed', amount: 250, calculationId: 'd' });
  const snap = snapshotFromCalcs(['k', 'g'], {
    k: calcs,
    g: [{ id: 'p2', calcType: 'preliminary', revisionSeq: 1, divergent: false, amount: 40 }],
  });
  assert.equal(snap.amount, 290);
  assert.equal(snap.lines.length, 2);
});

test('конфликт расчёта сохраняет обе ветки и не делает расходящуюся текущей', () => {
  const existing = [{ id: 'c1', calcType: 'preliminary', revisionSeq: 1, divergent: false, amount: 10 }];
  const conflict = planCalculation(existing, {
    calcType: 'preliminary',
    amount: 12,
    expectedRevision: 0,
    savedAt: at,
    savedBy: 'u',
  });
  assert.equal(conflict.conflict, true);
  assert.equal(conflict.saved.divergent, true);
  assert.equal(roomContribution([...existing, conflict.saved]).amount, 10);
  const ok = planCalculation(existing, {
    calcType: 'preliminary',
    amount: 12,
    expectedRevision: 1,
    savedAt: at,
    savedBy: 'u',
  });
  assert.equal(ok.conflict, false);
  assert.equal(ok.saved.revisionSeq, 2);
  assert.equal(ok.saved.baseRevisionId, 'c1');
});

test('копирование и PDF не подтверждают отправку', () => {
  const quote = { lifecycle: 'quote_created', sentConfirmedAt: null, sharedAt: null };
  assert.equal(applyQuoteDocument(quote, 'copy_text', at).changed, false);
  assert.equal(applyQuoteDocument(quote, 'generate_pdf', at).quote.lifecycle, 'quote_created');
  const shared = applyQuoteDocument(quote, 'share', at).quote;
  assert.equal(shared.lifecycle, 'quote_shared');
  assert.equal(shared.sentConfirmedAt, null);
  const sent = applyQuoteDocument(shared, 'confirm_sent', at).quote;
  assert.equal(sent.lifecycle, 'quote_sent_confirmed');
  assert.equal(applyQuoteDocument(sent, 'share', at).changed, false);
  assert.equal(applyQuoteDocument(sent, 'confirm_sent', at).idempotent, true);
});

test('в монтаж только ordered + detailed + комплект + бригада, чек-лист без исключений', () => {
  const room = { id: 'r', materialsComplete: true, crewUserId: 'c', workStatus: 'tech_ready', checklist: [], blockers: [] };
  const prelim = [{ calcType: 'preliminary', revisionSeq: 1, divergent: false, amount: 1 }];
  const detailed = [{ calcType: 'detailed', revisionSeq: 1, divergent: false, amount: 2 }];
  const accepted = deal({ outcome: 'accepted', roomAssent: { r: 'ordered' } });
  assert.equal(isTechReady(room, prelim), false);
  assert.equal(inInstallPool(accepted, room, prelim), false);
  assert.equal(inInstallPool(accepted, { ...room, id: 'r' }, detailed), true);
  assert.equal(inInstallPool(deal({ outcome: 'accepted', roomAssent: { r: 'deferred' } }), room, detailed), false);
  assert.equal(inInstallPool(deal({ outcome: 'accepted', roomAssent: { r: 'needs_review' } }), room, detailed), false);
  assert.equal(checklistComplete([{ state: 'done' }, { state: 'na', reason: 'нет окна' }]), true);
  assert.equal(checklistComplete([{ state: 'na', reason: '' }]), false);
  assert.equal(checklistComplete([]), false);
  const closed = { ...room, workStatus: 'closed', blockers: [] };
  assert.throws(() => closeFulfilledDeal(accepted, [{ ...room, workStatus: 'draft' }], at));
  const done = closeFulfilledDeal(accepted, [closed], at);
  assert.equal(done.outcome, 'accepted');
  assert.ok(done.closedAt);
});

test('миграция: отправленное КП не становится заказом', () => {
  const base = {
    projects: [{ id: 'p', orgId: 'o' }],
    objects: [
      { id: 'r1', projectId: 'p', status: 'quote_sent' },
      { id: 'r2', projectId: 'p', status: 'measured' },
    ],
  };
  const sentOnly = migrateLegacyCommercial({
    ...base,
    deals: [{ id: 'd', projectId: 'p', stage: 'quote_sent_confirmed', outcome: null }],
    quotes: [{ id: 'q', projectId: 'p', dealId: 'd', lifecycle: 'quote_sent_confirmed', roomObjectIds: ['r1'], createdAt: at }],
  });
  assert.equal(sentOnly.deals[0].roomAssent.r1, 'unknown');
  assert.equal(sentOnly.deals[0].acceptedAmount, null);
  assert.deepEqual(installPoolFromMigration(sentOnly.deals[0], base.objects), []);

  const declined = migrateLegacyCommercial({
    ...base,
    deals: [{ id: 'd', projectId: 'p', stage: 'quote_declined', outcome: 'declined', updatedAt: at }],
    quotes: [],
  });
  assert.equal(declined.deals[0].roomAssent.r1, 'out_of_scope');
  assert.ok(declined.deals[0].closedAt);

  const all = migrateLegacyCommercial({
    ...base,
    deals: [{
      id: 'd',
      projectId: 'p',
      outcome: 'accepted',
      evidence: { orderedRoomIds: ['r1', 'r2'] },
    }],
    quotes: [{
      id: 'q',
      projectId: 'p',
      dealId: 'd',
      lifecycle: 'quote_sent_confirmed',
      roomObjectIds: ['r1', 'r2'],
      createdAt: at,
      snapshot: { lines: [{ roomId: 'r1', amount: 10 }, { roomId: 'r2', amount: 15 }] },
    }],
  });
  assert.equal(all.deals[0].roomAssent.r1, 'ordered');
  assert.equal(all.deals[0].roomAssent.r2, 'ordered');
  assert.equal(all.deals[0].acceptedAmount, 25);

  const partial = migrateLegacyCommercial({
    ...base,
    deals: [{
      id: 'd',
      projectId: 'p',
      outcome: 'accepted',
      evidence: { orderedRoomIds: ['r1'], deferredRoomIds: ['r2'] },
    }],
    quotes: [{
      id: 'q',
      dealId: 'd',
      projectId: 'p',
      lifecycle: 'quote_sent_confirmed',
      roomObjectIds: ['r1', 'r2'],
      createdAt: at,
      snapshot: { lines: [{ roomId: 'r1', amount: 10 }, { roomId: 'r2', amount: 15 }] },
    }],
  });
  assert.equal(partial.deals[0].roomAssent.r1, 'ordered');
  assert.equal(partial.deals[0].roomAssent.r2, 'deferred');
  assert.equal(partial.deals[0].acceptedAmount, 10);
  assert.deepEqual(installPoolFromMigration(partial.deals[0], base.objects), ['r1']);

  const vague = migrateLegacyCommercial({
    ...base,
    deals: [{ id: 'd', projectId: 'p', outcome: 'accepted', evidence: { note: 'ok' } }],
    quotes: [{
      id: 'q',
      dealId: 'd',
      projectId: 'p',
      lifecycle: 'quote_sent_confirmed',
      roomObjectIds: ['r1'],
      createdAt: at,
    }],
  });
  assert.equal(vague.deals[0].roomAssent.r1, 'needs_review');
  assert.equal(vague.deals[0].acceptedAmount, null);
  assert.deepEqual(installPoolFromMigration(vague.deals[0], base.objects), []);
});

test('частичная сумма берёт только ordered', () => {
  const quote = {
    amount: 999,
    snapshot: { lines: [{ roomId: 'a', amount: 5 }, { roomId: 'b', amount: 7 }] },
  };
  assert.equal(sumOrdered(quote, { a: 'ordered', b: 'deferred' }), 5);
});
