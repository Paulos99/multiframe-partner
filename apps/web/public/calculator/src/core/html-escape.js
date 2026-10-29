/** Экранирование текста для вставки в HTML-шаблоны (innerHTML). Данные из ссылок и профиля нельзя считать безопасными. */
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Идентификатор для атрибутов и ключей: только буквы, цифры, «_» и «-». */
export function safeId(value, fallback = '') {
  const clean = String(value ?? '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
  return clean || fallback;
}

/** Подпись вершины или стены: буквы, цифры, пробел и простые знаки, до 12 символов. */
export function safeLabel(value, fallback = '') {
  const clean = String(value ?? '')
    .replace(/[^\p{L}\p{N} .'_-]/gu, '')
    .trim()
    .slice(0, 12);
  return clean || fallback;
}
