import { visibleDocuments, documentDisplayKind, type JobObject, type JobObjectStatus, type ProjectStatus } from '../../../../packages/shared/partner';

/** Порядок этапов комнаты на шкале карточки. */
export const ROOM_STAGES: readonly JobObjectStatus[] = ['draft', 'measured', 'quote_sent', 'install', 'closed'];

/** Порядок этапов проекта на шкале страницы проекта. */
export const PROJECT_STAGES: readonly ProjectStatus[] = ['new', 'measure', 'proposal', 'install', 'done'];

export type StageState = 'done' | 'current' | 'todo';

/** Состояние каждого шага шкалы: пройден, текущий или впереди. */
export function stageStates<T extends string>(order: readonly T[], current: T): StageState[] {
  const at = order.indexOf(current);
  return order.map((_, index) => (at < 0 ? 'todo' : index < at ? 'done' : index === at ? 'current' : 'todo'));
}

export type RoomAction = 'area' | 'diagnosis' | 'calculator' | 'offer' | 'finish' | null;

export type RoomNextStep = {
  /** Что сделать дальше, обычными словами. */
  text: string;
  /** Подпись главной кнопки. Пусто — кнопки нет. */
  button: string;
  action: RoomAction;
};

function hasDoc(room: JobObject, kind: 'profile' | 'estimate'): boolean {
  return visibleDocuments(room.documents).some((doc) => doc.kind !== 'offer' && documentDisplayKind(doc.kind) === kind);
}

function hasEstimate(room: JobObject): boolean {
  return typeof room.estimate?.totalCost === 'number' || Boolean(room.estimate?.panels && room.estimate.panels > 0) || hasDoc(room, 'estimate');
}

/**
 * Следующий шаг по комнате и главная кнопка шапки карточки.
 * canMove — роль меняет этапы (владелец, менеджер); замерщику и монтажнику кнопки смены этапа не показываются.
 */
export function roomNextStep(room: JobObject, canMove: boolean): RoomNextStep {
  if (room.status === 'closed') {
    return { text: room.refusal ? 'Комната закрыта: клиент отказался.' : 'Монтаж выполнен, комната закрыта.', button: '', action: null };
  }
  if (room.room?.areaM2 == null) {
    return {
      text: 'Площадь не указана. Задайте её в Проблемомере — значение сохранится в комнату и попадёт в калькулятор.',
      button: 'Указать площадь в Проблемомере',
      action: 'area',
    };
  }
  if (room.status === 'install') {
    return canMove
      ? { text: 'Идёт монтаж. Когда бригада закончит, закройте комнату.', button: 'Завершить монтаж', action: 'finish' }
      : { text: 'Идёт монтаж. Добавьте фото в фотоотчёт.', button: '', action: null };
  }
  if (room.status === 'quote_sent') {
    return {
      text: 'Коммерческое предложение у клиента. Ждём решения.',
      button: canMove ? 'Открыть КП проекта' : '',
      action: canMove ? 'offer' : null,
    };
  }
  if (!hasDoc(room, 'profile') && !room.room?.classBefore) {
    return { text: 'Пройдите Проблемомер с клиентом: он покажет, что изменится в комнате.', button: 'Пройти Проблемомер', action: 'diagnosis' };
  }
  if (!hasEstimate(room)) {
    return { text: 'Начертите потолок в калькуляторе, чтобы получить смету и схему монтажа.', button: 'Рассчитать в калькуляторе', action: 'calculator' };
  }
  return canMove
    ? { text: 'Расчёт готов. Соберите коммерческое предложение по проекту и отправьте клиенту.', button: 'Открыть КП проекта', action: 'offer' }
    : { text: 'Расчёт готов. Коммерческое предложение собирает менеджер.', button: '', action: null };
}
