/**
 * Кто и как меняет этап комнаты, и что делать, если этап поменяли, пока человек был без связи.
 * Общие правила для сервера (apps/api) и приложения (apps/web).
 */

/** Подписи этапов комнаты для сообщений сервера (как JOB_OBJECT_STATUS_LABELS в partner.ts). */
export const ROOM_STAGE_LABELS = Object.freeze({
  draft: 'Черновик',
  measured: 'Замер',
  quote_sent: 'КП отправлено',
  install: 'Монтаж',
  closed: 'Завершён',
});

/** Этапы, между которыми замерщик переключает комнату сам (решение владельца от 9 ноября 2026). */
export const MEASURER_ROOM_STAGES = Object.freeze(['draft', 'measured']);

/**
 * Может ли роль перевести комнату с этапа from на этап to.
 * Владелец и менеджер — любой переход. Замерщик — «Черновик» ↔ «Замер». Монтажник — нет.
 * @param {string | null | undefined} role
 * @param {string | null | undefined} from
 * @param {string | null | undefined} to
 */
export function canChangeRoomStage(role, from, to) {
  if (!to || from === to) return true;
  if (role === 'owner' || role === 'sales') return true;
  if (role === 'measurer') {
    return MEASURER_ROOM_STAGES.includes(String(from || 'draft')) && MEASURER_ROOM_STAGES.includes(String(to));
  }
  return false;
}

/** Роль меняет этапы хотя бы частично (показывать ли ей кнопку смены этапа). */
export function roleChangesRoomStage(role) {
  return role === 'owner' || role === 'sales' || role === 'measurer';
}

/**
 * Конфликт этапа: человек без связи менял этап, начиная с baseStatus, а на сервере за это время этап
 * стал другим. Тогда сервер не выбирает сам, а отвечает 409 и ждёт решения человека.
 * @param {{ status?: string | null }} existing запись на сервере
 * @param {{ status?: unknown, baseStatus?: unknown }} body запрос с устройства
 */
export function isStageConflict(existing, body) {
  if (!body || typeof body.baseStatus !== 'string' || !body.baseStatus) return false;
  if (typeof body.status !== 'string' || !body.status) return false;
  const current = String(existing?.status || 'draft');
  if (body.status === current) return false;
  return current !== body.baseStatus;
}
