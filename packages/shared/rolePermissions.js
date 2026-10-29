/**
 * Менеджер StP — внутренний сотрудник MultiFrame. Ему доступны только обучение (материалы и тренажёр)
 * и ссылки на клиентские инструменты. Проектов, комнат, команды, цен партнёров и аналитики у него нет.
 *
 * Права этой роли заданы списком разрешённого: всё, чего в списке нет, сервер отклоняет с 403.
 * Новый маршрут API по умолчанию для этой роли закрыт.
 */

export const STP_MANAGER_ROLE = 'stp_manager';
export const STP_MANAGER_LABEL = 'Менеджер StP';

/** Внутренняя «компания» StP: в ней живут менеджеры StP, чтобы их обучение считалось, как у партнёров. */
export const STP_ORG_ID = 'org_stp';
export const STP_ORG_NAME = 'StP';

export function isStpManager(role) {
  return role === STP_MANAGER_ROLE;
}

function tail(path) {
  return String(path || '').split('?')[0].replace(/\/+$/, '') || '/';
}

/**
 * Может ли менеджер StP вызвать этот маршрут.
 * Вход, профиль, чтение материалов (только чтение) и обучение.
 */
export function stpManagerMayCall(method, path) {
  const verb = String(method || '').toUpperCase();
  const p = tail(path);
  if (/(^|\/)auth\/(me|logout)$/.test(p)) return true;
  if (/(^|\/)me(\/(password|avatar))?$/.test(p)) return true;
  if (verb === 'GET' && /(^|\/)materials(\/[^/]+(\/(content|preview|thumbnail))?)?$/.test(p)) return true;
  if (/(^|\/)training(\/|$)/.test(p)) return true;
  return false;
}
