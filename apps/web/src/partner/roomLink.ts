import type { JobObject, JobObjectRoom, OrgSettings } from '../../../../packages/shared/partner';
import { createInitialSession } from '../state/session';
import { ROOM_TYPE_LABELS, type RoomAnswers, type RoomType, type SessionState } from '../state/types';
import { objectPatchFromCalc, type CabinetCalcMessage } from './cabinetCalc';

const ROOM_TYPE_BY_LABEL = new Map<string, RoomType>(
  (Object.entries(ROOM_TYPE_LABELS) as [RoomType, string][]).map(([id, label]) => [
    label.toLocaleLowerCase('ru'),
    id,
  ]),
);

/** «Спальня» → bedroom. Чужое название не подменяет уже записанный тип. */
export function roomTypeFromName(name: string | null | undefined): RoomType | null {
  const key = name?.trim().toLocaleLowerCase('ru');
  if (!key) return null;
  return ROOM_TYPE_BY_LABEL.get(key) ?? null;
}

/** Комната, созданная по подписи: «Спальня» становится типом, а не пустым полем. */
export function roomStubFromLabel(label: string): JobObjectRoom {
  const name = label.trim();
  const type = roomTypeFromName(name);
  if (type && type !== 'other') return { roomType: type, roomTypeCustom: null };
  if (name) return { roomType: 'other', roomTypeCustom: name };
  return {};
}

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
export function answersFromStoredRoom(
  room: JobObjectRoom | null | undefined,
  roomName?: string | null,
): Partial<RoomAnswers> | null {
  if (!room && !roomName?.trim()) return null;
  const raw = room?.answers && typeof room.answers === 'object' ? { ...room.answers } : {};
  const answers = raw as Partial<RoomAnswers>;
  if (typeof room?.areaM2 === 'number') answers.ceilingAreaM2 = room.areaM2;
  if (room?.roomType) answers.roomType = room.roomType as RoomAnswers['roomType'];
  if (typeof room?.roomTypeCustom === 'string' && room.roomTypeCustom.trim()) {
    answers.roomTypeCustom = room.roomTypeCustom;
  }
  if (!answers.roomType) {
    const inferred =
      roomTypeFromName(typeof answers.roomTypeCustom === 'string' ? answers.roomTypeCustom : null) ||
      roomTypeFromName(roomName);
    const custom = (answers.roomTypeCustom || roomName || '').trim();
    if (inferred && inferred !== 'other') {
      answers.roomType = inferred;
      answers.roomTypeCustom = '';
    } else if (custom && custom !== 'Комната' && custom !== 'Помещение') {
      answers.roomType = 'other';
      answers.roomTypeCustom = custom;
    }
  }
  answers.plannedCeiling = 'stretch';
  return answers;
}

/** Сессия проблемомера сразу с типом и площадью открытой комнаты. */
export function sessionFromRoom(obj: {
  room?: JobObjectRoom | null;
  roomName?: string | null;
}): SessionState {
  const base = createInitialSession();
  const stored = answersFromStoredRoom(obj.room, obj.roomName);
  if (!stored) return base;
  const room = { ...base.answers.room, ...stored, plannedCeiling: 'stretch' as const };
  return {
    ...base,
    answers: { ...base.answers, room },
    cta: { roomType: room.roomType, ceilingAreaM2: room.ceilingAreaM2 },
  };
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
