/**
 * Заметки к комнате: только добавление, видны всем, кому видна комната.
 * Клиентский идентификатор (clientId) делает повторную отправку после обрыва безопасной: второй раз
 * та же заметка не появится.
 */

export const NOTE_TEXT_MAX = 1000;
export const NOTES_PER_ROOM_MAX = 200;

/** Клиентский идентификатор фото и заметки: латиница, цифры, «_» и «-», от 8 до 64 знаков. */
export const CLIENT_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

/** @param {unknown} value */
export function isClientId(value) {
  return typeof value === 'string' && CLIENT_ID_PATTERN.test(value);
}

/** Текст заметки: без управляющих символов, обрезан по краям и до предела. @param {unknown} value */
export function cleanNoteText(value) {
  return String(value ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, NOTE_TEXT_MAX);
}

/** @param {unknown} obj */
export function noteRows(obj) {
  const list = /** @type {{ notes?: unknown }} */ (obj || {}).notes;
  return Array.isArray(list) ? list : [];
}
