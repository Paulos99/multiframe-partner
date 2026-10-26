import type { Deal, DealStage, RoomAssent } from '../../../../../packages/shared/deal';
import { DEAL_OUTCOME_LABELS, LOSS_REASON_LABELS } from '../../../../../packages/shared/deal';
import type { QuoteRevision } from '../../../../../packages/shared/quote';

const STAGES: Record<DealStage, string> = {
  contact: 'Контакт',
  offered: 'Предложение озвучено',
  assessed: 'Оценка звука',
  calculated: 'Есть расчёт',
  quote_created: 'Предложение подготовлено',
  quote_shared: 'Предложение показано',
  quote_sent_confirmed: 'Отправка подтверждена',
  quote_accepted: 'Клиент согласился',
  quote_declined: 'Отказ',
  quote_postponed: 'Решение отложено',
  install: 'Монтаж',
  closed: 'Сделка завершена',
};

const LIFECYCLE: Record<string, string> = {
  quote_created: 'Подготовлено',
  quote_shared: 'Показано клиенту',
  quote_sent_confirmed: 'Отправка подтверждена',
};

export const ASSENT_LABELS: Record<'ordered' | 'deferred' | 'out_of_scope', string> = {
  ordered: 'Заказано',
  deferred: 'Отложено',
  out_of_scope: 'Вне сделки',
};

export const REASONS = LOSS_REASON_LABELS;

export function stageLabel(stage: string | null | undefined): string {
  if (!stage) return 'Стадия не указана';
  return STAGES[stage as DealStage] || 'Стадия не указана';
}

export function outcomeLabel(outcome: Deal['outcome']): string {
  if (!outcome) return 'Решение ещё не зафиксировано';
  return DEAL_OUTCOME_LABELS[outcome] || 'Решение ещё не зафиксировано';
}

export function quoteStatusLabel(quote: Pick<QuoteRevision, 'lifecycle' | 'sentConfirmedAt'>): string {
  if (quote.sentConfirmedAt || quote.lifecycle === 'quote_sent_confirmed') return 'Отправка подтверждена';
  return LIFECYCLE[quote.lifecycle] || 'Подготовлено';
}

export function calcLabel(calcType: string | null | undefined): string {
  if (calcType === 'detailed') return 'Расчёт по замеру';
  if (calcType === 'preliminary') return 'Ориентир без схемы';
  return 'Тип расчёта станет ясен в снимке';
}

export function assentLabel(value: RoomAssent | string | undefined): string {
  if (value === 'ordered' || value === 'deferred' || value === 'out_of_scope') return ASSENT_LABELS[value];
  if (value === 'needs_review' || value === 'unknown') return 'Требует сверки';
  return 'Не отмечено';
}

export function isSent(quote: QuoteRevision | null | undefined): boolean {
  return Boolean(quote?.sentConfirmedAt) || quote?.lifecycle === 'quote_sent_confirmed';
}
