/**
 * Правила кабинетов замерщика и бригады.
 * Сумма комнаты считается так же, как на сервере: один вклад, без сложения двух расчётов.
 * Исключения из списка проверки нет — A-05 не утверждено.
 */

import { checklistComplete, roomContribution } from '../../../../../packages/shared/commercialRules.js';
import { resolveSyncUi, type SyncUiKind } from '../commercial/syncLabels';

export type CalcSlot = { revisionSeq: number; amount: number } | null;

export type Contribution = {
  calcType: 'preliminary' | 'detailed';
  amount: number;
  calculationId?: string;
} | null;

export type CheckState = 'done' | 'na' | 'pending';

export type CheckItem = {
  id: string;
  title: string;
  state: CheckState;
  reason: string | null;
};

export type Blocker = {
  id: string;
  status: 'open' | 'resolved';
  text: string;
};

export type MeasureRoom = {
  id: string;
  roomName: string;
  projectId: string;
  projectName: string;
  place: string;
  recordVersion: number;
  workStatus: string;
  profileUsable: boolean;
  materialsComplete: boolean;
  crewUserId: string | null;
  preliminary: CalcSlot;
  detailed: CalcSlot;
  contribution: Contribution;
  techReady: boolean;
  quoteSent: boolean;
  blockers: Blocker[];
};

export type RoomComposition = {
  areaM2: number | null;
  panels: number | null;
  dowels: number | null;
  hasScheme: boolean;
  schemeImage?: string | null;
};

/** Пустое или нулевое значение состава — прочерк, не «0». */
export function compositionFigure(value: number | null | undefined, unit?: string): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return '—';
  return unit ? `${value} ${unit}` : String(value);
}

export type CrewRoom = {
  id: string;
  projectId: string;
  dealId: string;
  roomName: string;
  projectName: string;
  place: string;
  workStatus: string;
  recordVersion: number;
  materialsComplete: boolean;
  checklist: CheckItem[];
  blockers: Blocker[];
  composition?: RoomComposition | null;
};

export const INSTALL_CHECKS: Array<Pick<CheckItem, 'id' | 'title'>> = [
  { id: 'frame', title: 'Каркас закреплён по схеме' },
  { id: 'panels', title: 'Панели уложены по схеме' },
  { id: 'edges', title: 'Примыкания и вырезы закрыты' },
  { id: 'handoff', title: 'Комната сдана, место убрано' },
];

export const BLOCKER_PRESETS = [
  'Нет схемы',
  'Нет материалов',
  'Вопрос по монтажу',
  'Связаться с ответственным',
] as const;

const MONEY_KEYS = new Set([
  'amount',
  'acceptedAmount',
  'price',
  'panelsCost',
  'totalCost',
  'installCost',
  'dowelsCost',
]);

export function createIdempotencyKey(): string {
  return `fld_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function fieldHeaders(input: {
  idempotencyKey?: string | null;
  ifMatch?: string | null;
}): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Data-Context': 'work',
  };
  if (input.idempotencyKey) headers['Idempotency-Key'] = input.idempotencyKey;
  if (input.ifMatch) headers['If-Match'] = String(input.ifMatch);
  return headers;
}

export function containsMoney(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsMoney);
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value as Record<string, unknown>).some(
    ([key, item]) => MONEY_KEYS.has(key) || containsMoney(item),
  );
}

export function formatRub(amount: number): string {
  return `${new Intl.NumberFormat('ru-RU').format(Math.round(amount))} ₽`;
}

export function calcKindLabel(kind: string | null | undefined): string {
  if (kind === 'detailed') return 'Расчёт по замеру';
  if (kind === 'preliminary') return 'Предварительный расчёт';
  return 'Нет расчёта';
}

export function workStatusLabel(status: string | null | undefined): string {
  if (status === 'tech_ready') return 'Технически готово';
  if (status === 'blocked') return 'Есть препятствие';
  if (status === 'closed') return 'Монтаж завершён';
  if (status === 'measured') return 'Замер сохранён';
  return 'Нужен замер';
}

/** Комната с расчётом по замеру больше не числится как «Нужен замер». */
export function measurementStatusLabel(room: {
  workStatus?: string | null;
  detailed?: CalcSlot;
  techReady?: boolean;
  blockers?: Array<{ status: string }>;
}): string {
  if (room.workStatus === 'closed') return 'Монтаж завершён';
  if (room.workStatus === 'blocked' || room.blockers?.some((item) => item.status === 'open')) {
    return 'Есть препятствие';
  }
  if (room.techReady || room.workStatus === 'tech_ready') return 'Технически готово';
  if (room.detailed || room.workStatus === 'measured') return 'Замер сохранён';
  return 'Нужен замер';
}

export function countedContribution(
  preliminary: CalcSlot,
  detailed: CalcSlot,
): Contribution {
  const rows = [];
  if (preliminary) {
    rows.push({
      id: 'p',
      calcType: 'preliminary',
      amount: preliminary.amount,
      revisionSeq: preliminary.revisionSeq,
      divergent: false,
    });
  }
  if (detailed) {
    rows.push({
      id: 'd',
      calcType: 'detailed',
      amount: detailed.amount,
      revisionSeq: detailed.revisionSeq,
      divergent: false,
    });
  }
  return roomContribution(rows);
}

export function isCalcConflict(body: unknown): body is {
  saved: { amount: number; revisionSeq?: number; calcType?: string };
  current: { amount: number; revisionSeq?: number; calcType?: string };
  contribution: Contribution;
  message?: string;
} {
  if (!body || typeof body !== 'object') return false;
  const row = body as Record<string, unknown>;
  return Boolean(row.saved && row.current && Object.prototype.hasOwnProperty.call(row, 'contribution'));
}

export function conflictSummary(body: {
  saved: { amount: number };
  current: { amount: number; revisionSeq?: number };
  contribution: Contribution;
}): {
  serverAmount: number;
  mineAmount: number;
  countedAmount: number | null;
  countedLabel: string;
  doubled: boolean;
} {
  const counted = body.contribution?.amount ?? null;
  return {
    serverAmount: Number(body.current.amount),
    mineAmount: Number(body.saved.amount),
    countedAmount: counted,
    countedLabel: calcKindLabel(body.contribution?.calcType),
    doubled: counted != null && counted === Number(body.current.amount) + Number(body.saved.amount),
  };
}

export function readinessGaps(room: {
  detailed: CalcSlot;
  materialsComplete: boolean;
  crewUserId: string | null;
}): string[] {
  const gaps: string[] = [];
  if (!room.detailed) gaps.push('нет расчёта по замеру');
  if (!room.materialsComplete) gaps.push('материалы не подтверждены');
  if (!room.crewUserId) gaps.push('бригада не назначена');
  return gaps;
}

export function sortMeasurements<T extends { detailed: CalcSlot; techReady: boolean; blockers: Blocker[] }>(
  rooms: T[],
): T[] {
  const rank = (room: T) => {
    if (room.blockers.some((item) => item.status === 'open')) return 0;
    if (!room.detailed) return 1;
    if (!room.techReady) return 2;
    return 3;
  };
  return [...rooms].sort((a, b) => rank(a) - rank(b));
}

export function checklistOrTemplate(items: CheckItem[]): { items: CheckItem[]; saved: boolean } {
  if (items.length) return { items: items.map((item) => ({ ...item })), saved: true };
  return {
    saved: false,
    items: INSTALL_CHECKS.map((item) => ({ id: item.id, title: item.title, state: 'pending', reason: null })),
  };
}

export function closeBlockedReason(items: CheckItem[], blockers: Blocker[]): string | null {
  if (!items.length || items.every((item) => item.state === 'pending')) {
    return 'Сначала отметьте пункты списка проверки.';
  }
  const bare = items.find((item) => item.state === 'na' && !String(item.reason || '').trim());
  if (bare) return `Для пункта «${bare.title}» укажите, почему он не применим.`;
  if (!checklistComplete(items)) return 'Отметьте каждый пункт: выполнено или не применимо с причиной.';
  if (blockers.some((item) => item.status === 'open')) return 'Есть открытое препятствие. Закрыть комнату нельзя.';
  return null;
}

export function sortTasks<T extends { workStatus: string; checklist: CheckItem[]; blockers: Blocker[] }>(
  rooms: T[],
): T[] {
  const rank = (room: T) => {
    const open = room.workStatus === 'blocked' || room.blockers.some((item) => item.status === 'open');
    const started = room.checklist.some((item) => item.state !== 'pending');
    if (started && !open) return 0;
    if (open) return 1;
    return 2;
  };
  return [...rooms].sort((a, b) => rank(a) - rank(b));
}

export function nextCrewAction(room: {
  workStatus: string;
  checklist: CheckItem[];
  blockers: Blocker[];
}): string {
  if (room.workStatus === 'blocked' || room.blockers.some((item) => item.status === 'open')) {
    return 'Есть препятствие';
  }
  if (closeBlockedReason(room.checklist, room.blockers)) return 'Заполнить список проверки';
  return 'Закрыть комнату';
}

export function fieldErrorText(status: number, message: string): string {
  if (status === 428) return 'Нет актуальной версии комнаты. Обновите список и повторите.';
  if (status === 403) return 'Недостаточно прав. Это действие делает менеджер или замерщик.';
  if (status === 0) return 'Нет сети. Изменение осталось на устройстве и не считается сохранённым на сервере.';
  return message || 'Не удалось сохранить.';
}

export function fieldSync(input: { online: boolean; pending: number; failed?: boolean }): {
  kind: SyncUiKind;
  label: string;
  hint: string;
} {
  return resolveSyncUi({ online: input.online, pending: input.pending, authHold: false, failed: input.failed });
}
