export type VisitKind = 'measure' | 'install';
export type Visit = {
  id: string;
  orgId: string;
  kind: VisitKind;
  projectId: string;
  objectId: string | null;
  startsAt: string;
  durationMin: number;
  userId: string;
  note: string;
  doneAt?: string | null;
  cancelledAt?: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  demo?: boolean;
  /** Подписи для экрана: сервер добавляет их в ответ. */
  userName?: string;
  projectName?: string;
  address?: string;
  roomName?: string | null;
  orgName?: string;
};
export type ReminderAck = { id: string; userId: string; key: string; doneAt?: string | null; snoozeUntil?: string | null; updatedAt: string };
export type Reminder = {
  key: string;
  type: 'visit_soon' | 'visit_tomorrow' | 'visit_today' | 'quote_stale' | 'stage_overdue' | 'measure_no_result';
  tone: 'urgent' | 'warn' | 'info';
  title: string;
  detail: string;
  projectId: string | null;
  objectId: string | null;
  visitId?: string;
  at: string;
};
export const VISIT_KINDS: readonly VisitKind[];
export const VISIT_KIND_LABELS: Record<VisitKind, string>;
export const VISIT_ROLES: Record<VisitKind, readonly string[]>;
export const VISIT_DEFAULT_MINUTES: Record<VisitKind, number>;
export const VISIT_MIN_MINUTES: number;
export const VISIT_MAX_MINUTES: number;
export const VISIT_NOTE_MAX: number;
export const QUOTE_STALE_DAYS: number;
export const SOON_MS: number;
export function visitStartMs(visit: Partial<Visit> | null | undefined): number | null;
export function visitEndMs(visit: Partial<Visit> | null | undefined): number | null;
export function cleanVisitInput(
  body: unknown,
  existing?: Partial<Visit> | null,
): { value?: { kind: VisitKind; projectId: string; objectId: string | null; startsAt: string; durationMin: number; userId: string; note: string; done: boolean }; error?: string };
export function visitRoleAllowed(kind: string, role: string | null | undefined): boolean;
export function visitsOverlap(a: Partial<Visit>, b: Partial<Visit>): boolean;
export function findConflicts<T extends Partial<Visit>>(visits: readonly T[], visit: Partial<Visit>): T[];
export function conflictIds(visits: readonly Partial<Visit>[]): Set<string>;
export function quoteSentAtOf(room: { quoteSentAt?: string | null; history?: ReadonlyArray<{ action?: string; detail?: string; at?: string }> } | null | undefined): string | null;
export function moscowDayStartMs(now?: number): number;
export function materializeVisit<T extends Partial<Visit> & { demoDay?: number; demoMinute?: number }>(visit: T, now?: number): T;
export function buildReminders(input: {
  visits: readonly Partial<Visit>[];
  rooms: readonly any[];
  projects: readonly any[];
  user: { id: string; role: string };
  acks?: readonly ReminderAck[];
  now?: number;
  tzOffsetMin?: number;
  quoteStaleDays?: number;
}): Reminder[];
export function dayWord(n: number): string;
export function visitVisibleTo(user: { role?: string; orgId?: string | null; id?: string } | null | undefined, visit: Partial<Visit>): boolean;
