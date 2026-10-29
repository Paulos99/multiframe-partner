export type RefusalRecord = { reasonKey: string; comment: string; at: string; by: string | null };
export const REFUSAL_OTHER_KEY: 'other';
export const REFUSAL_REASONS: ReadonlyArray<{ key: string; title: string }>;
export const REFUSAL_COMMENT_MAX: number;
export const CLOSE_LABELS: { completed: 'Завершён'; refused: 'Отказ' };
export function refusalReasonTitle(key: string | null | undefined): string;
export function refusalReasonPlain(key: string | null | undefined): string;
export function cleanRefusal(
  raw: unknown,
  options?: { userId?: string | null; now?: string; existing?: RefusalRecord | null },
): { value?: RefusalRecord | null; error?: string };
export function isRefused(item: { refusal?: RefusalRecord | null } | null | undefined): boolean;
export function closeLabel(item: { refusal?: RefusalRecord | null } | null | undefined): 'Завершён' | 'Отказ';
export function refusalStats(
  rooms: ReadonlyArray<{ status?: string; refusal?: RefusalRecord | null; updatedAt?: string }> | null | undefined,
  range?: { from?: string | null; to?: string | null },
): { total: number; byReason: Array<{ key: string; title: string; count: number }> };
