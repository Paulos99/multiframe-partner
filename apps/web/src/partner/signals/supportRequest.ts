/**
 * Заявка «Нужна помощь StP»: без персональных данных клиента.
 * Удалённый API, если настроен; иначе localStorage (mf_support_cases_v1).
 */
import {
  SUPPORT_CATEGORY_LABELS,
  assertSupportPayloadSafe,
  createSupportCase,
  type SupportCase,
  type SupportCategory,
} from '../../../../../packages/shared/support';

export const SUPPORT_CASES_STORAGE_KEY = 'mf_support_cases_v1';

export const SUPPORT_CATEGORIES: ReadonlyArray<{ id: SupportCategory; label: string }> = (
  Object.keys(SUPPORT_CATEGORY_LABELS) as SupportCategory[]
).map((id) => ({ id, label: SUPPORT_CATEGORY_LABELS[id] }));

export type SupportRequestInput = {
  category: SupportCategory;
  module?: string | null;
  orgId?: string | null;
};

export type SupportRequestUser = {
  id: string | null;
  orgId: string | null;
  role: string | null;
};

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export class SupportPayloadError extends Error {
  fields: string[];
  constructor(fields: string[]) {
    super('Нельзя прикладывать персональные данные клиента');
    this.name = 'SupportPayloadError';
    this.fields = fields;
  }
}

export function isSupportCategory(v: unknown): v is SupportCategory {
  return typeof v === 'string' && SUPPORT_CATEGORIES.some((c) => c.id === v);
}

/** Выбрасывает SupportPayloadError, если во входе есть ПД клиента. */
export function assertSupportRequestSafe(payload: Record<string, unknown>): void {
  const hits = assertSupportPayloadSafe(payload);
  if (hits.length) throw new SupportPayloadError(hits);
  if (!isSupportCategory(payload.category)) throw new Error('Выберите категорию');
}

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadLocalSupportCases(storage: StorageLike | null = defaultStorage()): SupportCase[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(SUPPORT_CASES_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as SupportCase[]) : [];
  } catch {
    return [];
  }
}

export function saveLocalSupportCase(
  input: SupportRequestInput,
  user: SupportRequestUser,
  storage: StorageLike | null = defaultStorage(),
  now: () => string = () => new Date().toISOString(),
  newId: () => string = () => `sc_local_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
): SupportCase {
  assertSupportRequestSafe(input as unknown as Record<string, unknown>);
  const item = createSupportCase({
    id: newId(),
    orgId: user.orgId || input.orgId || 'local',
    openedByUserId: user.id,
    role: user.role,
    category: input.category,
    module: input.module ?? null,
    openedAt: now(),
  });
  if (storage) {
    const next = [item, ...loadLocalSupportCases(storage)].slice(0, 100);
    storage.setItem(SUPPORT_CASES_STORAGE_KEY, JSON.stringify(next));
  }
  return item;
}
