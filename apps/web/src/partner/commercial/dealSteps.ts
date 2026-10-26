import type { Deal } from '../../../../../packages/shared/deal';
import type { QuoteRevision } from '../../../../../packages/shared/quote';
import { sumOrdered } from '../../../../../packages/shared/commercialRules.js';
import { isSent } from './labels';

export type DealStep =
  | { kind: 'resume'; label: 'Возобновить' }
  | { kind: 'reorder'; label: 'Дозаказ' }
  | { kind: 'open'; label: 'Открыть сделку' }
  | { kind: 'wizard'; step: number; label: string }
  | { kind: 'decision'; label: 'Зафиксировать решение' }
  | { kind: 'done'; label: string };

export function latestQuote(quotes: QuoteRevision[], dealId: string): QuoteRevision | null {
  return (
    quotes
      .filter((quote) => quote.dealId === dealId)
      .sort((a, b) => a.version - b.version)
      .at(-1) || null
  );
}

export function sentQuote(quotes: QuoteRevision[], dealId: string): QuoteRevision | null {
  return (
    quotes
      .filter((quote) => quote.dealId === dealId && isSent(quote))
      .sort((a, b) => a.version - b.version)
      .at(-1) || null
  );
}

export function hasDeferredRooms(deals: Deal[]): boolean {
  return deals.some(
    (deal) => deal.closedAt && Object.values(deal.roomAssent || {}).includes('deferred'),
  );
}

export function nextDealStep(deal: Deal | null, quotes: QuoteRevision[], deferred: boolean): DealStep {
  if (deal?.outcome === 'early_paused' && !deal.closedAt) return { kind: 'resume', label: 'Возобновить' };
  if (!deal || deal.closedAt) {
    if (deferred) return { kind: 'reorder', label: 'Дозаказ' };
    if (!deal) return { kind: 'open', label: 'Открыть сделку' };
    return { kind: 'done', label: 'Сделка завершена' };
  }
  const latest = latestQuote(quotes, deal.id);
  if (deal.outcome === 'accepted') return { kind: 'done', label: 'Клиент согласился' };
  if (deal.outcome === 'declined' || deal.outcome === 'early_declined') {
    return { kind: 'done', label: 'Сделка закрыта отказом' };
  }
  if (!latest) return { kind: 'wizard', step: 1, label: 'Собрать предложение' };
  if (!isSent(latest)) return { kind: 'wizard', step: 4, label: 'Подтвердить отправку' };
  return { kind: 'decision', label: 'Зафиксировать решение' };
}

export function orderedAmount(quote: QuoteRevision, assent: Record<string, string>): number | null {
  try {
    return sumOrdered(quote, assent);
  } catch {
    return null;
  }
}

export function assentComplete(quote: QuoteRevision, assent: Record<string, string>): boolean {
  const lines = quote.snapshot?.lines || [];
  if (!lines.length) return false;
  return lines.every((line) => {
    const value = assent[line.roomId];
    return value === 'ordered' || value === 'deferred' || value === 'out_of_scope';
  });
}

export function wizardSnapshotReady(quote: QuoteRevision | null, picked: string[]): boolean {
  if (!quote || isSent(quote) || !picked.length) return false;
  const ids = quote.roomObjectIds || [];
  if (ids.length !== picked.length) return false;
  return [...ids].sort().join() === [...picked].sort().join();
}

export function canAdvanceWizard(step: number, pickedCount: number, snapshotReady: boolean): boolean {
  if (step === 1) return pickedCount > 0;
  if (step === 2) return snapshotReady;
  return step > 2 && step < 6;
}

export function showNewVersionAction(confirmedSent: boolean): boolean {
  return confirmedSent;
}

export function showPauseAction(outcome: string | null | undefined): boolean {
  return outcome !== 'accepted' && outcome !== 'early_paused';
}

export function showDeclineAction(outcome: string | null | undefined): boolean {
  return outcome !== 'accepted';
}

export function showFollowUpAction(outcome: string | null | undefined, confirmedSent: boolean): boolean {
  return confirmedSent && outcome !== 'accepted';
}

export const AFTER_ACCEPT_NEXT =
  'Дальше — техническая готовность заказанных комнат: схема по замеру, материалы и ответственный, затем назначение бригады.';
