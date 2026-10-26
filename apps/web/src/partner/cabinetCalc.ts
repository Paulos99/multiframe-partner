import type { JobObject, JobObjectEstimate, OrgSettings } from '../../../../packages/shared/partner';
import { buildEstimateFromOrg } from './estimate';

export type CabinetCalcMessage = {
  type: 'mf-cabinet-calc';
  objectId?: string | null;
  inputMode?: string | null;
  areaEstimate?: boolean;
  hasScheme?: boolean;
  panels?: number | null;
  dowels?: number | null;
  areaM2?: number | null;
  panelsCost?: number | null;
  filename?: string;
  pdfBase64?: string;
  /** Чертёж раскладки без цен. Смета с ценами остаётся в pdfBase64. */
  schemeImage?: string | null;
  /** Старый калькулятор слал ещё PDF без цен. Больше не используется. */
  specFilename?: string;
  specPdfBase64?: string;
};

/** «Козлов Д. — смета — 2026-10-17.pdf», «Козлов Д. — профиль — 2026-10-17.pdf» */
export function readablePdfName(
  clientName: string | null | undefined,
  kind: 'estimate' | 'profile',
  at?: string | null,
): string {
  const who =
    String(clientName || 'Расчёт')
      .replace(/[\\/:*?"<>|]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80) || 'Расчёт';
  const label = kind === 'profile' ? 'профиль' : 'смета';
  const day = at && /^\d{4}-\d{2}-\d{2}/.test(at) ? at.slice(0, 10) : new Date().toISOString().slice(0, 10);
  return `${who} — ${label} — ${day}.pdf`;
}

/** PDF в объект — только расчёт со схемой: «по размерам» или «начертить схему». */
export function calcMessageHasScheme(message: CabinetCalcMessage): boolean {
  if (message.areaEstimate || message.inputMode === 'area') return false;
  return message.hasScheme !== false && Boolean(message.pdfBase64);
}

export function isCabinetCalcMessage(data: unknown): data is CabinetCalcMessage {
  return Boolean(data && typeof data === 'object' && (data as CabinetCalcMessage).type === 'mf-cabinet-calc');
}

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function estimateFromCalc(
  msg: CabinetCalcMessage,
  org: OrgSettings | null | undefined,
): JobObjectEstimate {
  const panels = Math.max(0, Math.round(num(msg.panels) || 0));
  const dowels = Math.max(0, Math.round(num(msg.dowels) || 0));
  const area = num(msg.areaM2);
  const panelsCost = num(msg.panelsCost) != null ? Math.round(num(msg.panelsCost) || 0) : null;
  const installCost =
    org?.installPricePerM2 != null && area != null && area > 0
      ? Math.round(area * org.installPricePerM2)
      : null;
  const dowelsCost =
    org?.dowelPriceRub != null && dowels > 0 ? Math.round(dowels * org.dowelPriceRub) : null;
  const parts = [panelsCost, installCost, dowelsCost].filter((v): v is number => v != null);
  return {
    panels,
    dowels,
    panelsCost,
    installCost,
    dowelsCost,
    totalCost: parts.length ? parts.reduce((s, n) => s + n, 0) : null,
  };
}

/**
 * Предварительный расчёт по площади — только в уже существующую комнату.
 * Без комнаты ничего не создаём: место выбирает человек.
 */
export function preliminaryRoomPatch(
  msg: CabinetCalcMessage,
  existing: JobObject | undefined,
  org: OrgSettings | null | undefined,
): (Partial<JobObject> & { id: string }) | null {
  if (!existing?.id) return null;
  const areaRaw = num(msg.areaM2);
  const area = areaRaw != null && areaRaw > 0 ? Math.round(areaRaw * 10) / 10 : null;
  if (area == null) return null;
  const patch = objectPatchFromCalc({ ...msg, areaM2: area }, existing, org, existing.id);
  if (!existing.clientSummary) {
    patch.clientSummary = `Предварительный расчёт · ${area} м² · без схемы`;
  }
  return { ...patch, id: existing.id };
}

/** Сумма заново считается по площади комнаты, если человек оставил её. */
export function withAreaChoice(
  msg: CabinetCalcMessage,
  areaM2: number,
  org: OrgSettings | null | undefined,
): CabinetCalcMessage {
  const estimate = buildEstimateFromOrg(areaM2, org);
  if (!estimate) return { ...msg, areaM2 };
  return {
    ...msg,
    areaM2,
    panels: estimate.panels,
    dowels: estimate.dowels,
    panelsCost: estimate.panelsCost,
  };
}

/** Поля объекта из расчёта. Статус и имя клиента не затираем у уже существующей карточки. */
export function objectPatchFromCalc(
  msg: CabinetCalcMessage,
  existing: JobObject | undefined,
  org: OrgSettings | null | undefined,
  targetId: string | null,
): Partial<JobObject> & { id?: string } {
  const areaRaw = num(msg.areaM2);
  const area = areaRaw != null && areaRaw > 0 ? Math.round(areaRaw * 10) / 10 : null;
  const estimate = estimateFromCalc(msg, org);
  const summary = `Калькулятор · ${area ?? '—'} м² · ${estimate.panels} пан. · ${estimate.dowels} дюб.`;
  const patch: Partial<JobObject> & { id?: string } = {
    room: { ...(existing?.room || {}), areaM2: area },
    estimate,
    clientSummary: existing?.clientSummary || summary,
  };
  if (existing && Object.prototype.hasOwnProperty.call(existing, 'projectId')) {
    patch.projectId = existing.projectId ?? null;
  }
  if (existing && Object.prototype.hasOwnProperty.call(existing, 'roomName')) {
    patch.roomName = existing.roomName ?? null;
  }
  const id = existing?.id || targetId;
  if (id) {
    patch.id = id;
    if (existing?.status === 'draft') patch.status = 'measured';
    return patch;
  }
  return {
    ...patch,
    clientName: area ? `Расчёт ${area} м²` : 'Расчёт калькулятора',
    clientPhone: '',
    address: '',
    city: org?.city || '',
    status: 'measured',
  };
}
