import type { AnalyticsPartnerRow, JobObjectStatus } from '../../../../../packages/shared/partner';
import { JOB_OBJECT_STATUS_LABELS } from '../../../../../packages/shared/partner';
import { OBJECT_STAGE_OPTIONS } from '../../state/types';

const STATUS_ORDER: JobObjectStatus[] = ['draft', 'measured', 'quote_sent', 'install', 'closed'];

const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

export const ACTIVITY_METRICS = [
  { key: 'logins', label: 'Входы' },
  { key: 'problemomer', label: 'Проблемомер' },
  { key: 'calculator', label: 'Калькулятор' },
  { key: 'pdf', label: 'PDF' },
] as const;

export type ActivityMetricKey = (typeof ACTIVITY_METRICS)[number]['key'];

export type NetworkPartner = {
  user: { id: string; orgId: string | null; displayName: string };
  org?: { settings?: { companyName?: string; city?: string } } | null;
  executorCount: number;
};

export type NetworkObject = {
  orgId: string;
  status: string;
  objectStage?: string | null;
};

export type StageCount = { key: string; label: string; count: number };

export type CompanyObjectsState =
  | { state: 'unknown' }
  | { state: 'unlinked' }
  | { state: 'empty' }
  | { state: 'ready'; total: number; stages: StageCount[]; siteStages: StageCount[] };

export type CompanyActivityState =
  | { state: 'unknown' }
  | { state: 'empty' }
  | {
      state: 'ready';
      logins: number;
      problemomer: number;
      calculator: number;
      pdf: number;
      lastActiveAt: string | null;
    };

export type CompanyCardModel = {
  key: string;
  userId: string;
  orgId: string | null;
  companyName: string;
  city: string | null;
  staffCount: number | null;
  objects: CompanyObjectsState;
  activity: CompanyActivityState;
};

function plural(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(Math.trunc(n));
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  const word = mod10 === 1 && mod100 !== 11
    ? one
    : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
      ? few
      : many;
  return `${n} ${word}`;
}

export function staffLabel(count: number): string {
  return plural(count, 'сотрудник', 'сотрудника', 'сотрудников');
}

export function companyCountLabel(count: number): string {
  return plural(count, 'компания', 'компании', 'компаний');
}

export function objectCountLabel(count: number): string {
  return plural(count, 'объект', 'объекта', 'объектов');
}

export function formatActivityWhen(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const month = MONTHS_SHORT[date.getMonth()];
  if (!month) return null;
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${date.getDate()} ${month}, ${hours}:${minutes}`;
}

function countStatuses(own: NetworkObject[]): StageCount[] {
  const counts = new Map<JobObjectStatus, number>();
  for (const status of STATUS_ORDER) counts.set(status, 0);
  for (const obj of own) {
    if (!counts.has(obj.status as JobObjectStatus)) continue;
    const status = obj.status as JobObjectStatus;
    counts.set(status, (counts.get(status) || 0) + 1);
  }
  return STATUS_ORDER.flatMap((status) => {
    const count = counts.get(status) || 0;
    if (!count) return [];
    return [{ key: status, label: JOB_OBJECT_STATUS_LABELS[status], count }];
  });
}

function countSiteStages(own: NetworkObject[]): StageCount[] {
  const counts = new Map<string, number>();
  let missing = 0;
  let tagged = 0;
  for (const obj of own) {
    const stage = obj.objectStage?.trim() || '';
    if (!stage) {
      missing += 1;
      continue;
    }
    tagged += 1;
    counts.set(stage, (counts.get(stage) || 0) + 1);
  }
  if (!tagged) return [];
  const rows: StageCount[] = [];
  for (const option of OBJECT_STAGE_OPTIONS) {
    const count = counts.get(option.id) || 0;
    if (count) rows.push({ key: option.id, label: option.label, count });
    counts.delete(option.id);
  }
  for (const [key, count] of counts) {
    if (!count) continue;
    rows.push({ key, label: key, count });
  }
  if (missing) rows.push({ key: 'missing', label: 'Не указана', count: missing });
  return rows;
}

function objectsFor(objects: NetworkObject[] | null, orgId: string | null): CompanyObjectsState {
  if (!objects) return { state: 'unknown' };
  if (!orgId) return { state: 'unlinked' };
  const own = objects.filter((obj) => obj.orgId === orgId);
  if (!own.length) return { state: 'empty' };
  return {
    state: 'ready',
    total: own.length,
    stages: countStatuses(own),
    siteStages: countSiteStages(own),
  };
}

function matchActivity(
  rows: AnalyticsPartnerRow[],
  orgId: string | null,
  companyName: string,
): AnalyticsPartnerRow | null {
  if (orgId) {
    const byId = rows.find((row) => row.orgId === orgId);
    if (byId) return byId;
  }
  return rows.find((row) => {
    if (row.companyName !== companyName) return false;
    if (orgId && row.orgId && row.orgId !== orgId) return false;
    return true;
  }) ?? null;
}

function toActivity(row: AnalyticsPartnerRow | null): CompanyActivityState {
  if (!row || row.logins + row.problemomer + row.calculator + row.pdf === 0) {
    return { state: 'empty' };
  }
  return {
    state: 'ready',
    logins: row.logins,
    problemomer: row.problemomer,
    calculator: row.calculator,
    pdf: row.pdf,
    lastActiveAt: row.lastActiveAt,
  };
}

export function buildCompanyCards(input: {
  partners: NetworkPartner[];
  objects: NetworkObject[] | null;
  activity: AnalyticsPartnerRow[] | null;
}): CompanyCardModel[] {
  return input.partners.map((partner) => {
    const orgId = partner.user.orgId || null;
    const companyName = partner.org?.settings?.companyName?.trim()
      || partner.user.displayName.trim()
      || 'Без названия';
    const city = partner.org?.settings?.city?.trim() || null;
    const staffCount = Number.isFinite(partner.executorCount) ? partner.executorCount : null;
    return {
      key: partner.user.id,
      userId: partner.user.id,
      orgId,
      companyName,
      city,
      staffCount,
      objects: objectsFor(input.objects, orgId),
      activity: input.activity
        ? toActivity(matchActivity(input.activity, orgId, companyName))
        : { state: 'unknown' },
    };
  });
}
