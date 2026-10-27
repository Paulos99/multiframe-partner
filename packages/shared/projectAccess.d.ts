export const PROJECT_STATUSES: readonly ('new' | 'measure' | 'proposal' | 'install' | 'done')[];
export const PROJECT_STATUS_LABELS: Record<'new' | 'measure' | 'proposal' | 'install' | 'done', string>;

export function estimateForRole<T>(estimate: T, role: string | null | undefined): T;
export function roleSeesProjectMoney(role: string | null | undefined): boolean;
export function cleanProjectDate(value: unknown): { value: string | null; error?: string };
export function cleanProjectStatus(
  value: unknown,
): { value?: 'new' | 'measure' | 'proposal' | 'install' | 'done'; error?: string };
