/**
 * Событийная модель без персональных данных клиентов.
 * Воронка продаж считается по dealId, не по комнате/расчёту.
 */

export type PlatformEventName =
  | 'partner_activated'
  | 'consultation_started'
  | 'multiframe_offered'
  | 'problemomer_started'
  | 'problemomer_completed'
  | 'problemomer_abandoned'
  | 'calculator_started'
  | 'calculator_completed'
  | 'calculator_failed'
  | 'quote_created'
  | 'quote_shared'
  | 'quote_sent_confirmed'
  | 'deal_accepted'
  | 'deal_declined'
  | 'deal_postponed'
  | 'installation_started'
  | 'installation_completed'
  | 'training_assigned'
  | 'training_started'
  | 'training_completed'
  | 'support_requested'
  | 'support_resolved';

export type EventContext = 'work' | 'training' | 'demo';

export type PlatformEvent = {
  eventId: string;
  name: PlatformEventName;
  occurredAt: string;
  orgId: string | null;
  userId: string | null;
  projectId?: string | null;
  dealId?: string | null;
  context: EventContext;
  source?: string | null;
  version?: string | null;
};

const FORBIDDEN_PAYLOAD_KEYS = [
  'clientName',
  'clientPhone',
  'phone',
  'fio',
  'fullName',
  'address',
  'message',
  'comment',
  'pdf',
  'pdfBase64',
  'dataBase64',
  'transcript',
] as const;

/** Техническое событие не должно содержать ПД клиента или содержимое документов. */
export function assertEventPayloadSafe(payload: Record<string, unknown> | null | undefined): string[] {
  if (!payload || typeof payload !== 'object') return [];
  const hits: string[] = [];
  for (const key of FORBIDDEN_PAYLOAD_KEYS) {
    if (key in payload && payload[key] != null && payload[key] !== '') hits.push(key);
  }
  return hits;
}

export function isEventPayloadSafe(payload: Record<string, unknown> | null | undefined): boolean {
  return assertEventPayloadSafe(payload).length === 0;
}

/** Учебные и демо-действия исключаются из боевых KPI. */
export function countsTowardSalesKpi(event: Pick<PlatformEvent, 'context' | 'name'>): boolean {
  if (event.context === 'training' || event.context === 'demo') return false;
  if (event.name.startsWith('training_')) return false;
  return true;
}

export type DealFunnelCounts = {
  offered: number;
  calculated: number;
  quoteCreated: number;
  quoteSentConfirmed: number;
  accepted: number;
  declined: number;
  postponed: number;
};

const DEAL_FUNNEL_ORDER: PlatformEventName[] = [
  'multiframe_offered',
  'calculator_completed',
  'quote_created',
  'quote_sent_confirmed',
  'deal_accepted',
];

/**
 * Воронка по уникальным dealId (не по комнатам).
 * События без dealId в воронку сделок не входят.
 */
export function computeDealFunnel(events: readonly PlatformEvent[] | null | undefined): DealFunnelCounts {
  const list = Array.isArray(events) ? events : [];
  const byDeal = new Map<string, Set<PlatformEventName>>();
  for (const e of list) {
    if (!countsTowardSalesKpi(e)) continue;
    const dealId = typeof e.dealId === 'string' ? e.dealId.trim() : '';
    if (!dealId) continue;
    let set = byDeal.get(dealId);
    if (!set) {
      set = new Set();
      byDeal.set(dealId, set);
    }
    set.add(e.name);
  }

  const counts: DealFunnelCounts = {
    offered: 0,
    calculated: 0,
    quoteCreated: 0,
    quoteSentConfirmed: 0,
    accepted: 0,
    declined: 0,
    postponed: 0,
  };

  for (const names of byDeal.values()) {
    if (names.has('multiframe_offered') || names.has('consultation_started')) counts.offered += 1;
    if (names.has('calculator_completed')) counts.calculated += 1;
    if (names.has('quote_created')) counts.quoteCreated += 1;
    if (names.has('quote_sent_confirmed')) counts.quoteSentConfirmed += 1;
    if (names.has('deal_accepted')) counts.accepted += 1;
    if (names.has('deal_declined')) counts.declined += 1;
    if (names.has('deal_postponed')) counts.postponed += 1;
  }
  return counts;
}

/** Дедупликация повторной отправки после офлайна по eventId. */
export function dedupeEventsById<T extends { eventId?: string; id?: string }>(
  events: readonly T[],
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const e of events) {
    const id = (e.eventId || e.id || '').trim();
    if (!id) {
      out.push(e);
      continue;
    }
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(e);
  }
  return out;
}

export const INSUFFICIENT_OBSERVATIONS_LABEL = 'недостаточно наблюдений';

/** На малых выборках не выдаём уверенный диагноз. */
export function diagnosisConfidence(sampleSize: number, minReliable = 5): {
  reliable: boolean;
  label: string | null;
} {
  if (!Number.isFinite(sampleSize) || sampleSize < minReliable) {
    return { reliable: false, label: INSUFFICIENT_OBSERVATIONS_LABEL };
  }
  return { reliable: true, label: null };
}

export { DEAL_FUNNEL_ORDER };
