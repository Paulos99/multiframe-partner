/**
 * Калькулятор остаётся прежним. Ответ со схемой уходит в комнату как расчёт по замеру.
 * Слушатель живёт вне экрана: «Назад» из калькулятора возвращает в ту же комнату.
 */

import type { OrgSettings } from '../../../../../packages/shared/partner';
import { calcMessageHasScheme, estimateFromCalc, isCabinetCalcMessage } from '../cabinetCalc';
import { fieldPost } from './fieldClient';
import { createIdempotencyKey, fieldErrorText, isCalcConflict } from './fieldModel';

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
  void settle(arm, data, org);
  return true;
}

async function settle(arm: FieldArm, data: Parameters<typeof estimateFromCalc>[0], org: OrgSettings | null | undefined) {
  if (!calcMessageHasScheme(data)) {
    writeOutcome({ kind: 'needs-scheme', roomId: arm.roomId });
    return;
  }
  const estimate = estimateFromCalc(data, org);
  if (estimate.totalCost == null) {
    writeOutcome({
      kind: 'error',
      roomId: arm.roomId,
      message: 'Калькулятор не вернул сумму. Черновик на экране калькулятора сохранён, в комнату он не ушёл.',
    });
    return;
  }
  const result = await fieldPost(
    `/rooms/${encodeURIComponent(arm.roomId)}/calculations`,
    { type: 'detailed', amount: estimate.totalCost, expectedRevision: arm.expectedRevision },
    { idempotencyKey: arm.idempotencyKey, roomId: arm.roomId },
  );
  if (result.queued) {
    writeOutcome({
      kind: 'queued',
      roomId: arm.roomId,
      message: 'Сохранено на устройстве. На сервере ещё нет.',
    });
    return;
  }
  if (isCalcConflict(result.body)) {
    memory()?.removeItem(ARM);
    writeOutcome({ kind: 'conflict', roomId: arm.roomId, body: result.body });
    return;
  }
  if (!result.ok) {
    writeOutcome({
      kind: 'error',
      roomId: arm.roomId,
      message: fieldErrorText(result.status, String(result.body.message || '')),
    });
    return;
  }
  memory()?.removeItem(ARM);
  writeOutcome({ kind: 'saved', roomId: arm.roomId });
}
