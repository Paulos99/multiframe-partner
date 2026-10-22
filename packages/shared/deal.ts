/**
 * Коммерческий процесс (сделка) — единица воронки продаж.
 * Не заменяет JobObject/Project: Deal привязан к projectId.
 */

export type DealStage =
  | 'contact'
  | 'offered'
  | 'assessed'
  | 'calculated'
  | 'quote_created'
  | 'quote_shared'
  | 'quote_sent_confirmed'
  | 'quote_accepted'
  | 'quote_declined'
  | 'quote_postponed'
  | 'install'
  | 'closed';

export type DealOutcome =
  | 'accepted'
  | 'declined'
  | 'postponed'
  | 'no_response'
  | 'unknown'
  | null;

export type LossReason =
  | 'expensive'
  | 'no_need'
  | 'doubts_efficacy'
  | 'chose_other'
  | 'postponed_repair'
  | 'technical'
  | 'other'
  | 'unknown'
  | null;

/** Независимые ответственные по этапам. */
export type ObjectAssignments = {
  salesUserId: string | null;
  measurerUserId: string | null;
  crewUserId: string | null;
};

export type Deal = {
  id: string;
  orgId: string;
  projectId: string;
  stage: DealStage;
  ownerUserId: string | null;
  assignments: ObjectAssignments;
  nextActionAt: string | null;
  outcome: DealOutcome;
  lossReason: LossReason;
  lossComment?: string | null;
  createdAt: string;
  updatedAt: string;
};

export const EMPTY_ASSIGNMENTS: ObjectAssignments = {
  salesUserId: null,
  measurerUserId: null,
  crewUserId: null,
};

export const LOSS_REASON_LABELS: Record<Exclude<LossReason, null>, string> = {
  expensive: 'Дорого',
  no_need: 'Не видит потребности',
  doubts_efficacy: 'Сомневается в эффективности',
  chose_other: 'Выбрал другой вариант',
  postponed_repair: 'Отложил покупку/ремонт',
  technical: 'Нет технической возможности',
  other: 'Другая причина',
  unknown: 'Неизвестно',
};

export const DEAL_OUTCOME_LABELS: Record<Exclude<DealOutcome, null>, string> = {
  accepted: 'Согласился',
  declined: 'Отказался',
  postponed: 'Отложил',
  no_response: 'Ответа пока нет',
  unknown: 'Результат неизвестен',
};

/**
 * Производное assignedTo для совместимости со старым JobObject.
 * Приоритет: measurer → sales → crew (текущий «в работе»).
 */
export function derivedAssignedTo(assignments: ObjectAssignments | null | undefined): string | null {
  if (!assignments) return null;
  return assignments.measurerUserId || assignments.salesUserId || assignments.crewUserId || null;
}

/** Закрытие объекта (JobObject.status === closed) само по себе не означает выигранную сделку. */
export function jobClosedImpliesDealAccepted(_jobStatus: string | null | undefined): boolean {
  return false;
}

/** Исход сделки задаётся только явным outcome, не статусом объекта. */
export function resolveDealOutcome(deal: Pick<Deal, 'outcome' | 'stage'>): DealOutcome {
  if (deal.outcome) return deal.outcome;
  if (deal.stage === 'quote_accepted') return 'accepted';
  if (deal.stage === 'quote_declined') return 'declined';
  if (deal.stage === 'quote_postponed') return 'postponed';
  return null;
}

export function applyDealOutcome(
  deal: Deal,
  outcome: Exclude<DealOutcome, null>,
  lossReason: LossReason = null,
  lossComment: string | null = null,
): Deal {
  const next: Deal = {
    ...deal,
    outcome,
    updatedAt: new Date().toISOString(),
    lossReason: outcome === 'declined' ? lossReason || 'unknown' : null,
    lossComment: outcome === 'declined' ? lossComment : null,
  };
  if (outcome === 'accepted') next.stage = 'quote_accepted';
  else if (outcome === 'declined') next.stage = 'quote_declined';
  else if (outcome === 'postponed') next.stage = 'quote_postponed';
  return next;
}
