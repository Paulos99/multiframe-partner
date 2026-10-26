/**
 * Калькулятор остаётся прежним. Ответ со схемой уходит в комнату как расчёт по замеру.
 * Слушатель живёт вне экрана: «Назад» из калькулятора возвращает в ту же комнату.
 */

import type { OrgSettings } from '../../../../../packages/shared/partner';
import { calcMessageHasScheme, estimateFromCalc, isCabinetCalcMessage } from '../cabinetCalc';
import { fieldPost } from './fieldClient';
import { createIdempotencyKey, fieldErrorText, formatRub, isCalcConflict } from './fieldModel';

const ARM = 'mf-field-arm';
const OUTCOME = 'mf-field-calc-outcome';
const PLACE = 'mf-field-place';

export type FieldArm = {
  roomId: string;
  expectedRevision: number;
  idempotencyKey: string;
};

export type FieldOutcome =
  | { kind: 'saved'; roomId: string }
  | { kind: 'queued'; roomId: string; message: string }
  | { kind: 'needs-scheme'; roomId: string }
  | { kind: 'error'; roomId: string; message: string }
  | { kind: 'conflict'; roomId: string; body: Record<string, unknown> };

function memory(): Storage | null {
  try {
    if (typeof sessionStorage === 'undefined') return null;
    return sessionStorage;
  } catch {
    return null;
  }
}

export function rememberPlace(roomId: string | null) {
  if (!roomId) memory()?.removeItem(PLACE);
  else memory()?.setItem(PLACE, roomId);
}

export function readPlace(): string | null {
  return memory()?.getItem(PLACE) || null;
}

export function armFieldCalc(roomId: string, expectedRevision: number) {
  const arm: FieldArm = {
    roomId,
    expectedRevision,
    idempotencyKey: createIdempotencyKey(),
  };
  memory()?.setItem(ARM, JSON.stringify(arm));
}

export function disarmFieldCalc() {
  memory()?.removeItem(ARM);
}

export function readFieldOutcome(): FieldOutcome | null {
  const raw = memory()?.getItem(OUTCOME);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as FieldOutcome;
  } catch {
    return null;
  }
}

export function clearFieldOutcome() {
  memory()?.removeItem(OUTCOME);
}

function writeOutcome(outcome: FieldOutcome) {
  memory()?.setItem(OUTCOME, JSON.stringify(outcome));
}

export function offerFieldCalc(
  data: unknown,
  role: string | null | undefined,
  org: OrgSettings | null | undefined,
  report?: (message: string) => void,
): boolean {
  if (role !== 'measurer') return false;
  const raw = memory()?.getItem(ARM);
  if (!raw || !isCabinetCalcMessage(data)) return false;
  let arm: FieldArm;
  try {
    arm = JSON.parse(raw) as FieldArm;
  } catch {
    return false;
  }
  if (!arm.roomId) return false;
  void settle(arm, data, org).then((message) => {
    if (message) report?.(message);
  });
  return true;
}

/** Чертёж сжимается до jpeg, чтобы в комнату не ушёл тяжёлый холст и PDF со сметой. */
function compactScheme(dataUrl: string | null | undefined): Promise<string | null> {
  if (!dataUrl || !dataUrl.startsWith('data:image/')) return Promise.resolve(null);
  if (typeof Image === 'undefined' || typeof document === 'undefined') {
    return Promise.resolve(dataUrl.length > 700_000 ? null : dataUrl);
  }
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const maxW = 960;
      const scale = image.width > maxW ? maxW / image.width : 1;
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      const jpeg = canvas.toDataURL('image/jpeg', 0.72);
      resolve(jpeg.startsWith('data:image/jpeg') && jpeg.length <= 700_000 ? jpeg : null);
    };
    image.onerror = () => resolve(null);
    image.src = dataUrl;
  });
}

function conflictText(body: {
  saved: { amount: number };
  current: { amount: number };
  contribution: { amount?: number | null; calcType?: string | null } | null;
}): string {
  const counted = body.contribution?.amount;
  const countedText = counted == null ? 'итог ещё не выбран' : `в итоге ${formatRub(counted)}`;
  return `Конфликт версии. На сервере ${formatRub(body.current.amount)}, ваша версия ${formatRub(body.saved.amount)}, ${countedText}. Обе версии сохранены — выберите в комнате.`;
}

async function settle(
  arm: FieldArm,
  data: Parameters<typeof estimateFromCalc>[0],
  org: OrgSettings | null | undefined,
): Promise<string | null> {
  if (!calcMessageHasScheme(data)) {
    writeOutcome({ kind: 'needs-scheme', roomId: arm.roomId });
    return 'Без схемы это не расчёт по замеру. Предварительный ориентир не заменяет схему.';
  }
  const estimate = estimateFromCalc(data, org);
  if (estimate.totalCost == null) {
    const message = 'Калькулятор не вернул сумму. Черновик на экране калькулятора сохранён, в комнату он не ушёл.';
    writeOutcome({ kind: 'error', roomId: arm.roomId, message });
    return message;
  }
  const result = await fieldPost(
    `/rooms/${encodeURIComponent(arm.roomId)}/calculations`,
    {
      type: 'detailed',
      amount: estimate.totalCost,
      expectedRevision: arm.expectedRevision,
      areaM2: data.areaM2 && data.areaM2 > 0 ? data.areaM2 : null,
      panels: estimate.panels > 0 ? estimate.panels : null,
      dowels: estimate.dowels > 0 ? estimate.dowels : null,
      hasScheme: true,
      schemeImage: await compactScheme(data.schemeImage),
    },
    { idempotencyKey: arm.idempotencyKey, roomId: arm.roomId },
  );
  if (result.queued) {
    const message = 'Сохранено на устройстве. На сервере ещё нет.';
    writeOutcome({ kind: 'queued', roomId: arm.roomId, message });
    return message;
  }
  if (isCalcConflict(result.body)) {
    memory()?.removeItem(ARM);
    writeOutcome({ kind: 'conflict', roomId: arm.roomId, body: result.body });
    return conflictText(result.body);
  }
  if (!result.ok) {
    const message = fieldErrorText(result.status, String(result.body.message || ''));
    writeOutcome({ kind: 'error', roomId: arm.roomId, message });
    return message;
  }
  memory()?.removeItem(ARM);
  writeOutcome({ kind: 'saved', roomId: arm.roomId });
  return 'Расчёт по замеру сохранён в комнату.';
}
