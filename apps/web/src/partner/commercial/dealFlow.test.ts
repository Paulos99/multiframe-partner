import assert from 'node:assert/strict';
import { buildCommercialHeaders } from './commercialHeaders.ts';
import { createDemoBook } from './demoBook.ts';
import { nextDealStep, orderedAmount } from './dealSteps.ts';
import { beginWrite, endWrite } from './writeGuard.ts';

const book = createDemoBook();
const before = book.open('prj_before');
const reply = book.open('prj_reply');
const again = book.open('prj_again');

assert.equal(before.deals[0]?.id, 'deal_before');
assert.equal(before.deals[0]?.stage, 'calculated');
assert.equal(before.deals[0]?.closedAt, null);
assert.equal(reply.quotes[0]?.sentConfirmedAt != null, true);
assert.equal(again.deals[0]?.acceptedAmount, 100_000);
assert.equal(again.deals[0]?.roomAssent?.room_a_liv, 'deferred');

const paused = book.pause('deal_before', 1, { reason: 'postponed_repair', nextActionAt: '2026-11-01' });
assert.equal(paused.id, 'deal_before');
assert.equal(paused.outcome, 'early_paused');
assert.equal(paused.closedAt, null);
assert.equal(paused.stageAtOutcome, 'calculated');
assert.equal(book.open('prj_before').deals.filter((deal) => !deal.closedAt).length, 1);

const resumed = book.resume('deal_before', paused.recordVersion ?? null);
assert.equal(resumed.id, 'deal_before');
assert.equal(resumed.outcome, null);
assert.equal(resumed.stage, 'calculated');

assert.throws(() => book.pause('deal_before', null, { reason: 'no_need' }), (err: unknown) => {
  assert.equal((err as { status: number }).status, 428);
  return true;
});

const declined = book.decline('deal_before', resumed.recordVersion ?? null, { reason: 'expensive' });
assert.equal(declined.outcome, 'early_declined');
assert.equal(declined.stageAtOutcome, 'calculated');
assert.ok(declined.closedAt);
assert.throws(() => book.resume('deal_before', declined.recordVersion ?? null));

const fresh = createDemoBook();
const quote = fresh.createQuote(
  { projectId: 'prj_before', dealId: 'deal_before', roomObjectIds: ['room_b_kit', 'room_b_liv', 'room_b_bed'] },
  'idem-quote',
);
assert.equal(quote.version, 1);
assert.equal(quote.amount, 350_000);
assert.equal(quote.lifecycle, 'quote_created');
assert.equal(quote.snapshot?.lines.find((line) => line.roomId === 'room_b_liv')?.calcType, 'detailed');
const replay = fresh.createQuote(
  { projectId: 'prj_before', dealId: 'deal_before', roomObjectIds: ['room_b_kit'] },
  'idem-quote',
);
assert.equal(replay.id, quote.id);
assert.equal(fresh.open('prj_before').quotes.length, 1);

const copied = fresh.quoteAction(quote.id, 'copy_text', quote.recordVersion ?? null);
assert.equal(copied.lifecycle, 'quote_created');
assert.equal(copied.sentConfirmedAt, null);
const shared = fresh.quoteAction(quote.id, 'share', copied.recordVersion ?? null);
assert.equal(shared.lifecycle, 'quote_shared');
assert.equal(shared.sentConfirmedAt, null);
const sent = fresh.quoteAction(quote.id, 'confirm_sent', shared.recordVersion ?? null, 'лично');
assert.equal(sent.lifecycle, 'quote_sent_confirmed');
assert.ok(sent.sentConfirmedAt);
assert.throws(() => fresh.replaceQuote(quote.id, sent.recordVersion ?? null), (err: unknown) => {
  assert.equal((err as { status: number }).status, 409);
  return true;
});
const next = fresh.createQuote(
  { projectId: 'prj_before', dealId: 'deal_before', roomObjectIds: ['room_b_liv'] },
  'idem-next',
);
assert.equal(next.version, 2);
assert.equal(next.dealId, 'deal_before');
assert.notEqual(next.id, quote.id);
assert.equal(fresh.open('prj_before').quotes.find((item) => item.id === quote.id)?.amount, 350_000);

const replyBook = createDemoBook();
const partial = replyBook.accept('deal_reply', 1, {
  room_r_kit: 'deferred',
  room_r_liv: 'ordered',
  room_r_bed: 'out_of_scope',
});
assert.equal(partial.outcome, 'accepted');
assert.equal(partial.acceptedAmount, 200_000);
assert.equal(partial.closedAt, null);
assert.equal(orderedAmount(replyBook.open('prj_reply').quotes[0]!, partial.roomAssent || {}), 200_000);
assert.throws(() =>
  replyBook.accept('deal_reply', partial.recordVersion ?? null, {
    room_r_kit: 'deferred',
    room_r_liv: 'deferred',
    room_r_bed: 'out_of_scope',
  }),
);

const followed = createDemoBook().followUp('deal_reply', 1, { outcome: 'postponed', nextActionAt: '2026-11-02' });
assert.equal(followed.id, 'deal_reply');
assert.equal(followed.outcome, 'postponed');
assert.equal(followed.closedAt, null);

const reorderBook = createDemoBook();
const old = reorderBook.open('prj_again').deals[0]!;
const created = reorderBook.createDeal('prj_again', 'idem-reorder');
assert.notEqual(created.id, old.id);
assert.equal(created.closedAt, null);
const still = reorderBook.open('prj_again').deals.find((deal) => deal.id === old.id);
assert.equal(still?.outcome, 'accepted');
assert.equal(still?.acceptedAmount, 100_000);
assert.equal(reorderBook.open('prj_again').quotes.find((item) => item.id === 'quote_closed')?.dealId, 'deal_closed');
assert.throws(() => reorderBook.createDeal('prj_again', 'other-key'));

assert.equal(nextDealStep(before.deals[0]!, [], false).kind, 'wizard');
assert.equal(nextDealStep(reply.deals[0]!, reply.quotes, false).label, 'Зафиксировать решение');
assert.equal(nextDealStep(null, [], true).kind, 'reorder');
assert.equal(nextDealStep(paused, [], false).kind, 'resume');

const lock = { current: false };
const keys = new Map<string, string>();
const first = beginWrite(lock, keys, 'pause');
assert.equal(beginWrite(lock, keys, 'decline'), null);
endWrite(lock, keys, 'pause', false);
const second = beginWrite(lock, keys, 'pause');
assert.equal(second, first);
endWrite(lock, keys, 'pause', true);
const third = beginWrite(lock, keys, 'pause');
assert.notEqual(third, first);
endWrite(lock, keys, 'pause', true);

assert.throws(() => buildCommercialHeaders({ context: 'work', mutation: true, ifMatch: null, idempotencyKey: 'k' }), (err: unknown) => {
  assert.equal((err as { status: number }).status, 428);
  return true;
});
const headers = buildCommercialHeaders({ context: 'work', mutation: true, ifMatch: 3, idempotencyKey: 'abc' });
assert.equal(headers['If-Match'], '3');
assert.equal(headers['Idempotency-Key'], 'abc');
assert.equal(headers['X-Data-Context'], 'work');
const demoHeaders = buildCommercialHeaders({ context: 'demo', mutation: false });
assert.equal(demoHeaders['X-Data-Context'], 'demo');
assert.equal('If-Match' in demoHeaders, false);
