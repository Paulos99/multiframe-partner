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
