import type { JobObject, JobObjectRoom, OrgSettings } from '../../../../packages/shared/partner';
import type { RoomAnswers } from '../state/types';
import { objectPatchFromCalc, type CabinetCalcMessage } from './cabinetCalc';

/** Поля комнаты проекта из ответов проблемомера. Тип потолка всегда натяжной. */
export function roomRecordFromAnswers(
  room: RoomAnswers,
  sim?: { before: { Rw: number; Lnw: number }; after: { Rw: number; Lnw: number } } | null,
): JobObjectRoom {
  return {
    roomType: room.roomType,
    roomTypeCustom: room.roomTypeCustom || null,
    areaM2: room.ceilingAreaM2,
    houseType: room.houseType,
    objectStage: room.objectStage,
    classBefore: sim ? `Rw ${sim.before.Rw} / Lnw ${sim.before.Lnw}` : null,
    classAfter: sim ? `Rw ${sim.after.Rw} / Lnw ${sim.after.Lnw}` : null,
    answers: {
      ...(room as unknown as Record<string, unknown>),
      plannedCeiling: 'stretch',
    },
  };
}

/** Обратно в проблемомер: площадь комнаты важнее снимка ответов. */
export function answersFromStoredRoom(room: JobObjectRoom | null | undefined): Partial<RoomAnswers> | null {
  if (!room) return null;
  const raw = room.answers && typeof room.answers === 'object' ? { ...room.answers } : {};
  const answers = raw as Partial<RoomAnswers>;
  if (typeof room.areaM2 === 'number') answers.ceilingAreaM2 = room.areaM2;
  if (room.roomType) answers.roomType = room.roomType as RoomAnswers['roomType'];
  if (typeof room.roomTypeCustom === 'string') answers.roomTypeCustom = room.roomTypeCustom;
  answers.plannedCeiling = 'stretch';
  return answers;
}

/**
 * Расчёт калькулятора пишет площадь и смету в уже существующую комнату.
 * Без комнаты ничего не создаём.
 */
export function linkCalcToRoom(
  msg: CabinetCalcMessage,
  existing: JobObject | undefined,
  org: OrgSettings | null | undefined,
): (Partial<JobObject> & { id: string }) | null {
  if (!existing?.id) return null;
  const patch = objectPatchFromCalc(msg, existing, org, existing.id);
  const area = patch.room?.areaM2 ?? existing.room?.areaM2 ?? null;
  const prev =
    existing.room?.answers && typeof existing.room.answers === 'object' ? existing.room.answers : {};
  return {
    ...patch,
    id: existing.id,
    room: {
      ...(existing.room || {}),
      ...(patch.room || {}),
      areaM2: area,
      answers: { ...prev, ceilingAreaM2: area, plannedCeiling: 'stretch' },
    },
  };
}
