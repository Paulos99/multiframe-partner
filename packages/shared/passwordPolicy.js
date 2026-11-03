/**
 * Правила пароля: одни и те же для сервера и для экрана.
 * Минимальную длину меняйте только здесь.
 */
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX_BYTES = 72;

function byteLength(value) {
  if (typeof Buffer !== 'undefined') return Buffer.byteLength(value, 'utf8');
  return new TextEncoder().encode(value).length;
}

/** Пустая строка, если пароль подходит, иначе текст ошибки для пользователя. */
export function passwordProblem(password) {
  const value = String(password ?? '');
  if (value.length < PASSWORD_MIN) return `Пароль: не короче ${PASSWORD_MIN} символов`;
  if (byteLength(value) > PASSWORD_MAX_BYTES) return `Пароль: не более ${PASSWORD_MAX_BYTES} байт`;
  if (/^\s|\s$/.test(value)) return 'Пароль не должен начинаться или заканчиваться пробелом';
  return '';
}
