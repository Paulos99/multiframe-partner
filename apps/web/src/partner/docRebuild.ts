import { documentDisplayKind, type JobObject, type JobObjectDocument } from '../../../../packages/shared/partner';
import type { RoomAnswers } from '../state/types';
import { answersFromStoredRoom } from './roomLink';

/** Ответы Проблемомера о перекрытии и доме: без них профиль не посчитать. */
const SURVEY_KEYS = ['slabType', 'houseType'] as const;

export type RebuildPlan =
  | { ok: true; kind: 'profile'; answers: Partial<RoomAnswers> }
  | { ok: true; kind: 'estimate'; areaM2: number }
  | { ok: true; kind: 'offer' }
  | { ok: false; kind: 'profile' | 'estimate' | 'offer'; message: string; next: 'survey' | 'calculator' };

/**
 * «Пересобрать»: документ собирается заново из сохранённых данных комнаты, без вопросов.
 * Если данных не хватает — понятная причина и что пройти.
 */
export function planRebuild(
  doc: Pick<JobObjectDocument, 'kind'>,
  room: Pick<JobObject, 'room' | 'roomName' | 'estimate'>,
  projectRooms: Array<Pick<JobObject, 'room' | 'estimate'>> = [],
): RebuildPlan {
  if (doc.kind === 'offer') {
    const ready = projectRooms.some((r) => Boolean(r.estimate) && (r.room?.areaM2 ?? 0) > 0);
    return ready
      ? { ok: true, kind: 'offer' }
      : {
          ok: false,
          kind: 'offer',
          message: 'Не получилось пересобрать коммерческое предложение: ни в одной комнате проекта нет сохранённого расчёта. Сначала посчитайте комнату в калькуляторе.',
          next: 'calculator',
        };
  }
  if (documentDisplayKind(doc.kind) === 'profile') {
    const raw = room.room?.answers && typeof room.room.answers === 'object' ? room.room.answers : {};
    const answers = answersFromStoredRoom(room.room, room.roomName);
    const surveyed = SURVEY_KEYS.every((key) => typeof (raw as Record<string, unknown>)[key] === 'string' && (raw as Record<string, unknown>)[key] !== '');
    if (answers?.roomType && answers.ceilingAreaM2 && answers.ceilingAreaM2 > 0 && surveyed) {
      return { ok: true, kind: 'profile', answers };
    }
    return {
      ok: false,
      kind: 'profile',
      message: 'Не получилось пересобрать акустический профиль: в комнате не сохранены ответы Проблемомера. Пройдите опрос для этой комнаты — профиль соберётся заново.',
      next: 'survey',
    };
  }
  const area = room.room?.areaM2 ?? 0;
  if (area > 0) return { ok: true, kind: 'estimate', areaM2: area };
  return {
    ok: false,
    kind: 'estimate',
    message: 'Не получилось пересобрать смету и схему монтажа: в комнате не сохранена площадь. Посчитайте комнату в калькуляторе.',
    next: 'calculator',
  };
}
