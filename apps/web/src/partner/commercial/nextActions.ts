/**
 * «Что делать дальше» для домашнего экрана роли.
 * Не CRM: только полезный следующий шаг по объектам и сделкам.
 * Новые поля сделки (отложенные комнаты) читаются тонким адаптером,
 * без изменения общего контракта.
 */

import type { JobObject, UserRole } from '../../../../../packages/shared/partner';
import type { Deal } from '../../../../../packages/shared/deal';

export type NextAction = {
  id: string;
  title: string;
  detail: string;
  objectId?: string;
  projectId?: string;
  dealId?: string;
  priority: number;
};

function objectLabel(obj: JobObject): string {
  return obj.address || obj.clientName || obj.roomName || 'Комната';
}

function projectLabel(projectId: string, objects: JobObject[]): string {
  const room = objects.find((obj) => obj.projectId === projectId);
  if (!room) return 'Проект';
  return room.address || room.clientName || room.roomName || 'Проект';
}

function overdue(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const time = Date.parse(iso);
  return Number.isFinite(time) && time < Date.now();
}

function deferredRoomIds(deal: Deal): string[] {
  const extra = deal as Deal & { deferredRoomIds?: unknown };
  if (!Array.isArray(extra.deferredRoomIds)) return [];
  return extra.deferredRoomIds.filter((id): id is string => typeof id === 'string' && id.length > 0);
}

function closedDeal(deal: Deal): boolean {
  return deal.stage === 'closed' || deal.outcome === 'declined';
}

function salesActions(objects: JobObject[], deals: Deal[]): NextAction[] {
  const actions: NextAction[] = [];
  const seen = new Set<string>();

  const push = (action: NextAction) => {
    if (seen.has(action.id)) return;
    seen.add(action.id);
    actions.push(action);
  };

  for (const deal of deals) {
    const where = projectLabel(deal.projectId, objects);
    const paused = deal.stage === 'quote_postponed' || deal.outcome === 'postponed';
    if (paused && !deal.outcome && overdue(deal.nextActionAt)) {
      push({
        id: `resume-${deal.id}`,
        title: 'Возобновить',
        detail: `${where}. Срок контакта прошёл, этап тот же`,
        projectId: deal.projectId,
        dealId: deal.id,
        priority: 1,
      });
    }
    if (deal.stage === 'quote_sent_confirmed' && !deal.outcome) {
      push({
        id: `answer-${deal.id}`,
        title: 'Получить ответ',
        detail: `${where}. Предложение у клиента, решения ещё нет`,
        projectId: deal.projectId,
        dealId: deal.id,
        priority: 2,
      });
    }
    if (
      (deal.stage === 'contact' ||
        deal.stage === 'offered' ||
        deal.stage === 'assessed' ||
        deal.stage === 'calculated') &&
      !deal.outcome
    ) {
      push({
        id: `build-${deal.id}`,
        title: 'Собрать предложение',
        detail: `${where}. Сделка без подтверждённой отправки`,
        projectId: deal.projectId,
        dealId: deal.id,
        priority: 14,
      });
    }
    if ((deal.stage === 'quote_created' || deal.stage === 'quote_shared') && !deal.outcome) {
      push({
        id: `confirm-${deal.id}`,
        title: 'Подтвердить отправку',
        detail: `${where}. Предложение подготовлено, отправка не подтверждена`,
        projectId: deal.projectId,
        dealId: deal.id,
        priority: 3,
      });
    }
    if ((deal.stage === 'quote_accepted' || deal.outcome === 'accepted') && deal.outcome !== 'declined') {
      const rooms = objects.filter(
        (obj) => obj.projectId === deal.projectId && obj.status !== 'install' && obj.status !== 'closed',
      );
      for (const room of rooms) {
        push({
          id: `ready-${room.id}`,
          title: 'Подготовить к монтажу',
          detail: `${objectLabel(room)}. Комната ещё не передана в монтаж`,
          objectId: room.id,
          projectId: deal.projectId,
          dealId: deal.id,
          priority: 4,
        });
      }
    }
    if (closedDeal(deal)) {
      const deferred = deferredRoomIds(deal)
        .map((id) => objects.find((obj) => obj.id === id))
        .filter((obj): obj is JobObject => Boolean(obj));
      if (deferred.length) {
        push({
          id: `next-deal-${deal.id}`,
          title: 'Создать следующую сделку',
          detail: `${where}. Прошлый заказ закрыт, отложенные комнаты ждут нового`,
          projectId: deal.projectId,
          objectId: deferred[0].id,
          dealId: deal.id,
          priority: 5,
        });
      }
    }
  }

  for (const obj of objects) {
    if (actions.some((action) => action.objectId === obj.id)) continue;
    if (obj.status === 'measured') {
      push({
        id: `quote-${obj.id}`,
        title: 'Сформировать КП',
        detail: objectLabel(obj),
        objectId: obj.id,
        projectId: obj.projectId || undefined,
        priority: 6,
      });
    }
    if (obj.status === 'quote_sent') {
      push({
        id: `follow-${obj.id}`,
        title: 'Уточнить ответ клиента',
        detail: objectLabel(obj),
        objectId: obj.id,
        projectId: obj.projectId || undefined,
        priority: 6,
      });
    }
  }

  return actions.sort((a, b) => a.priority - b.priority || a.title.localeCompare(b.title, 'ru')).slice(0, 8);
}

export function nextActionsForRole(
  role: UserRole,
  objects: JobObject[],
  deals: Deal[] = [],
): NextAction[] {
  if (role === 'sales' || role === 'owner') return salesActions(objects, deals);

  const actions: NextAction[] = [];
  if (role === 'measurer') {
    for (const obj of objects) {
      if (obj.status === 'draft' || obj.pendingSync) {
        actions.push({
          id: `continue-${obj.id}`,
          title: 'Продолжить замер',
          detail: objectLabel(obj),
          objectId: obj.id,
          projectId: obj.projectId || undefined,
          priority: obj.pendingSync ? 5 : 15,
        });
      }
    }
  }

  if (role === 'crew') {
    for (const obj of objects) {
      if (obj.status === 'install') {
        actions.push({
          id: `install-${obj.id}`,
          title: 'Выполнить монтаж',
          detail: objectLabel(obj),
          objectId: obj.id,
          projectId: obj.projectId || undefined,
          priority: 10,
        });
      }
    }
  }

  if (role === 'admin') {
    actions.push({
      id: 'admin-network',
      title: 'Смотреть точки затруднений сети',
      detail: 'Аналитика и карточки партнёров',
      priority: 1,
    });
  }

  return actions.sort((a, b) => a.priority - b.priority).slice(0, 8);
}
