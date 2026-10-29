/**
 * Телефон клиента. Необязательное поле, появляется только с этапа «Замер»
 * (замер, предложение, монтаж). На консультации и при создании проекта его нет.
 * Видят владелец, менеджер, замерщик и монтажник по своему проекту. Не уходит на страницу клиента,
 * админу сети, в аналитику и в PDF: эти места собирают ответ из явных списков полей.
 */

export const PHONE_PROJECT_STAGES = ['measure', 'proposal', 'install'];
export const PHONE_ROOM_STATUSES = ['measured', 'quote_sent', 'install'];
export const PHONE_ROLES = ['owner', 'sales', 'measurer', 'crew'];
export const PHONE_EXAMPLE = '+7 900 123-45-67';

const ROOM_STAGE = { draft: 'new', measured: 'measure', quote_sent: 'proposal', install: 'install', closed: 'done' };
const PROJECT_ORDER = ['new', 'measure', 'proposal', 'install', 'done'];

export function phoneStageAllowed(projectStage) {
  return PHONE_PROJECT_STAGES.includes(projectStage);
}

export function phoneRoomStatusAllowed(roomStatus) {
  return PHONE_ROOM_STATUSES.includes(roomStatus);
}

export function roleSeesClientPhone(role) {
  return PHONE_ROLES.includes(role);
}

/** Стадия проекта: сохранённый статус важнее, иначе самая дальняя открытая стадия комнат (как на доске). */
export function projectStageOf(project, rooms) {
  if (project?.status && PROJECT_ORDER.includes(project.status)) return project.status;
  const list = Array.isArray(rooms) ? rooms : [];
  const open = list.filter((room) => room.status !== 'closed');
  const source = open.length ? open : list;
  let best = 'new';
  for (const room of source) {
    const stage = ROOM_STAGE[room.status] || 'new';
    if (PROJECT_ORDER.indexOf(stage) > PROJECT_ORDER.indexOf(best)) best = stage;
  }
  return best;
}

/**
 * Проверка и приведение номера. Пусто — допустимо (поле необязательное).
 * Принимаются российские номера (8 900…, +7 900…, 900…) и международные +код…, от 10 до 15 цифр.
 * Приводится к виду «+7 900 123-45-67».
 */
export function cleanClientPhone(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return { value: '' };
  if (!/^[+\d\s().-]+$/.test(text) || (text.includes('+') && !text.startsWith('+'))) {
    return { error: `Телефон указан неверно. Пример: ${PHONE_EXAMPLE}` };
  }
  const digits = text.replace(/\D/g, '');
  const plus = text.startsWith('+');
  if (!plus && digits.length === 11 && (digits.startsWith('8') || digits.startsWith('7'))) {
    return { value: formatRu(digits.slice(1)) };
  }
  if (!plus && digits.length === 10) return { value: formatRu(digits) };
  if (plus && digits.length === 11 && digits.startsWith('7')) return { value: formatRu(digits.slice(1)) };
  if (plus && digits.length >= 10 && digits.length <= 15 && !digits.startsWith('0')) {
    return { value: `+${digits}` };
  }
  return { error: `Телефон указан неверно. Пример: ${PHONE_EXAMPLE}` };
}

function formatRu(ten) {
  return `+7 ${ten.slice(0, 3)} ${ten.slice(3, 6)}-${ten.slice(6, 8)}-${ten.slice(8, 10)}`;
}
