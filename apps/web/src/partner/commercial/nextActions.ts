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
  projectId?: string;
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
      if (d.outcome === 'early_paused' && !d.closedAt) {
        actions.push({
          id: `deal-resume-${d.id}`,
          title: 'Возобновить сделку',
          detail: 'Пауза не закрывает сделку',
          dealId: d.id,
          projectId: d.projectId,
          priority: 5,
        });
        continue;
      }
      if (d.closedAt && Object.values(d.roomAssent || {}).includes('deferred')) {
        actions.push({
          id: `deal-reorder-${d.id}`,
          title: 'Дозаказ отложенных комнат',
          detail: 'Новая сделка в том же проекте',
          dealId: d.id,
          projectId: d.projectId,
          priority: 16,
        });
      }
      if (d.outcome || d.closedAt) continue;
      if (d.stage === 'quote_created' || d.stage === 'quote_shared') {
        actions.push({
          id: `deal-confirm-${d.id}`,
          title: 'Подтвердить отправку',
          detail: 'Предложение собрано — отметьте факт передачи клиенту',
          dealId: d.id,
          projectId: d.projectId,
          priority: 10,
        });
      }
      if (d.stage === 'quote_sent_confirmed') {
        actions.push({
          id: `deal-outcome-${d.id}`,
          title: 'Зафиксировать ответ клиента',
          detail: 'Согласие, отказ или следующий контакт',
          dealId: d.id,
          projectId: d.projectId,
          priority: 12,
        });
      }
      if (d.stage === 'contact' || d.stage === 'offered' || d.stage === 'assessed' || d.stage === 'calculated') {
        actions.push({
          id: `deal-build-${d.id}`,
          title: 'Собрать предложение',
          detail: 'Сделка без подтверждённой отправки',
          dealId: d.id,
          projectId: d.projectId,
          priority: 14,
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
