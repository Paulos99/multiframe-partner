import type { JobObject, JobObjectEstimate, OrgSettings } from '../../../../packages/shared/partner';

export type CabinetCalcMessage = {
  type: 'mf-cabinet-calc';
  objectId?: string | null;
  hasScheme?: boolean;
  panels?: number | null;
  dowels?: number | null;
  areaM2?: number | null;
  panelsCost?: number | null;
  filename?: string;
  specFilename?: string;
  pdfBase64?: string;
  specPdfBase64?: string;
};

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
