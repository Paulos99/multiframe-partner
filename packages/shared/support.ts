/**
 * Обращения партнёров и меры поддержки StP.
 * Заявка не прикладывает персональные данные конечного клиента.
 */

export type SupportCategory =
  | 'sales'
  | 'calculation'
  | 'install'
  | 'materials'
  | 'tech_error'
  | 'other';

export type SupportCaseStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

export type SupportCase = {
  id: string;
  orgId: string;
  openedByUserId: string | null;
  role: string | null;
  category: SupportCategory;
  status: SupportCaseStatus;
  /** Модуль/экран без клиентской карточки. */
  module: string | null;
  openedAt: string;
  closedAt: string | null;
  assigneeStpUserId: string | null;
  outcome: string | null;
};

export type Intervention = {
  id: string;
  orgId: string;
  supportCaseId: string | null;
  problemType: string;
  actionType: string;
  startedAt: string;
  reviewAt: string | null;
  result: 'improved' | 'unchanged' | 'worse' | 'insufficient_data' | null;
  signalId: string | null;
};

export const SUPPORT_CATEGORY_LABELS: Record<SupportCategory, string> = {
  sales: 'Продажи',
  calculation: 'Расчёт',
  install: 'Монтаж',
  materials: 'Материалы',
  tech_error: 'Техническая ошибка',
  other: 'Другое',
};

const CLIENT_PII_KEYS = ['clientName', 'clientPhone', 'phone', 'address', 'fio', 'fullName'] as const;

/** Запрос помощи не должен автоматически прикладывать карточку клиента. */
export function assertSupportPayloadSafe(
  payload: Record<string, unknown> | null | undefined,
): string[] {
  if (!payload || typeof payload !== 'object') return [];
  return CLIENT_PII_KEYS.filter((key) => payload[key] != null && payload[key] !== '');
}

export function isSupportPayloadSafe(payload: Record<string, unknown> | null | undefined): boolean {
  return assertSupportPayloadSafe(payload).length === 0;
}

export function createSupportCase(input: {
  id: string;
  orgId: string;
  openedByUserId: string | null;
  role: string | null;
  category: SupportCategory;
  module?: string | null;
  openedAt?: string;
}): SupportCase {
  return {
    id: input.id,
    orgId: input.orgId,
    openedByUserId: input.openedByUserId,
    role: input.role,
    category: input.category,
    status: 'open',
    module: input.module ?? null,
    openedAt: input.openedAt || new Date().toISOString(),
    closedAt: null,
    assigneeStpUserId: null,
    outcome: null,
  };
}

export function linkInterventionToSignal(
  intervention: Intervention,
  signalId: string,
  reviewAt: string,
): Intervention {
  return {
    ...intervention,
    signalId,
    reviewAt,
  };
}

/** Мало наблюдений — результат insufficient_data, не «улучшение». */
export function interventionResultFromSamples(
  before: number,
  after: number,
  minSamples = 5,
): Intervention['result'] {
  if (before < minSamples || after < minSamples) return 'insufficient_data';
  if (after > before) return 'improved';
  if (after < before) return 'worse';
  return 'unchanged';
}
