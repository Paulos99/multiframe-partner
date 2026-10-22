/**
 * «Что делать дальше» для домашнего экрана роли.
 * Не CRM: только полезный следующий шаг по объектам/сделкам.
 */

import type { JobObject, UserRole } from '../../../../../packages/shared/partner';
import type { Deal } from '../../../../../packages/shared/deal';

export type NextAction = {
  id: string;
  title: string;
  detail: string;
  objectId?: string;
  dealId?: string;
  priority: number;
};

function objectLabel(obj: JobObject): string {
  return obj.address || obj.clientName || obj.roomName || obj.id;
}

export function nextActionsForRole(
  role: UserRole,
  objects: JobObject[],
  deals: Deal[] = [],
): NextAction[] {
  const actions: NextAction[] = [];
  const byId = new Map(objects.map((o) => [o.id, o]));

  if (role === 'sales' || role === 'owner') {
    for (const d of deals) {
      if (d.outcome) continue;
      if (d.stage === 'quote_created' || d.stage === 'quote_shared') {
        actions.push({
          id: `deal-confirm-${d.id}`,
          title: 'Подтвердить отправку КП',
          detail: 'КП сформировано — отметьте факт отправки клиенту',
          dealId: d.id,
          priority: 10,
        });
      }
      if (d.stage === 'quote_sent_confirmed') {
        actions.push({
          id: `deal-outcome-${d.id}`,
          title: 'Зафиксировать ответ клиента',
          detail: 'Согласие, отказ или перенос',
          dealId: d.id,
          priority: 20,
        });
      }
    }
    for (const obj of objects) {
      if (obj.status === 'measured') {
        actions.push({
          id: `obj-quote-${obj.id}`,
          title: 'Сформировать КП',
          detail: objectLabel(obj),
          objectId: obj.id,
          priority: 30,
        });
      }
      if (obj.status === 'quote_sent') {
        actions.push({
          id: `obj-follow-${obj.id}`,
          title: 'Проверить ответ по КП',
          detail: objectLabel(obj),
          objectId: obj.id,
          priority: 25,
        });
      }
    }
  }

  if (role === 'measurer') {
    for (const obj of objects) {
      if (obj.status === 'draft' || obj.pendingSync) {
        actions.push({
          id: `obj-continue-${obj.id}`,
          title: 'Продолжить замер',
          detail: objectLabel(obj),
          objectId: obj.id,
          priority: obj.pendingSync ? 5 : 15,
        });
      }
    }
  }

  if (role === 'crew') {
    for (const obj of objects) {
      if (obj.status === 'install') {
        actions.push({
          id: `obj-install-${obj.id}`,
          title: 'Выполнить монтаж',
          detail: objectLabel(obj),
          objectId: obj.id,
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

  void byId;
  return actions.sort((a, b) => a.priority - b.priority).slice(0, 8);
}
