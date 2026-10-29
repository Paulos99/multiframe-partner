/**
 * Закрытие проекта и комнаты: «Завершён» (монтаж сделан) или «Отказ» (клиент отказался).
 * Статус остаётся прежним (closed у комнаты, done у проекта), отказ — отдельная запись refusal с причиной.
 * Нет записи refusal — «Завершён». Есть — «Отказ». Отказ без причины не принимается.
 * Список причин совпадает с «Причинами отказа» тренажёра продаж (ключи из objections.json) плюс «Другое».
 */

export const REFUSAL_OTHER_KEY = 'other';

export const REFUSAL_REASONS = [
  { key: 'price_too_high', title: '«Дорого»' },
  { key: 'cheaper_alternative', title: '«Нашли дешевле / другой материал»' },
  { key: 'other_solution', title: '«Выбрали другое решение (каркас, многослойное)»' },
  { key: 'doubt_effect', title: '«Сомневается в эффекте / нужна гарантия»' },
  { key: 'unrealistic_expectation', title: '«Ждёт полной тишины»' },
  { key: 'doubt_safety', title: '«Опасения за здоровье и экологию»' },
  { key: 'install_too_long', title: '«Долго и неудобно монтировать»' },
  { key: 'postpone_decision', title: '«Подумает потом / отложил»' },
  { key: 'not_needed', title: '«Шум не мешает / не нужно»' },
  { key: 'lose_space', title: '«Жалко высоту и площадь»' },
  { key: 'decision_maker', title: '«Решает не он один»' },
  { key: 'need_details', title: '«Нужны уточнения по продукту или монтажу»' },
  { key: REFUSAL_OTHER_KEY, title: 'Другая причина' },
];

export const REFUSAL_COMMENT_MAX = 500;

export const CLOSE_LABELS = { completed: 'Завершён', refused: 'Отказ' };

export function refusalReasonTitle(key) {
  return REFUSAL_REASONS.find((reason) => reason.key === key)?.title || 'Причина не указана';
}

/** Название без кавычек-ёлочек, для строк «Отказ: дорого». */
export function refusalReasonPlain(key) {
  return refusalReasonTitle(key).replace(/^«|»$/g, '');
}

/**
 * Разбор записи об отказе из тела запроса.
 * null или пусто — «Завершён» (value: null). Объект без причины или с чужой причиной — ошибка.
 * Причина «Другая причина» требует текст.
 */
export function cleanRefusal(raw, { userId = null, now = new Date().toISOString(), existing = null } = {}) {
  if (raw === undefined) return { value: existing || null };
  if (raw === null || raw === false || raw === '') return { value: null };
  if (typeof raw !== 'object') return { error: 'Укажите причину отказа' };
  const reasonKey = String(raw.reasonKey ?? '').trim();
  if (!REFUSAL_REASONS.some((reason) => reason.key === reasonKey)) {
    return { error: 'Укажите причину отказа' };
  }
  const comment = String(raw.comment ?? '').trim().slice(0, REFUSAL_COMMENT_MAX);
  if (reasonKey === REFUSAL_OTHER_KEY && !comment) {
    return { error: 'Опишите причину отказа своими словами' };
  }
  const same =
    existing && existing.reasonKey === reasonKey && String(existing.comment || '') === comment;
  return {
    value: {
      reasonKey,
      comment,
      at: same ? existing.at : String(raw.at || now),
      by: same ? existing.by : userId,
    },
  };
}

/** Закрыто с отказом. Для комнаты это status closed, для проекта done. */
export function isRefused(item) {
  return Boolean(item && typeof item === 'object' && item.refusal && item.refusal.reasonKey);
}

/** «Завершён» или «Отказ» для закрытой записи. */
export function closeLabel(item) {
  return isRefused(item) ? CLOSE_LABELS.refused : CLOSE_LABELS.completed;
}

/**
 * Отказы по причинам. Считаются только закрытые комнаты с записью refusal.
 * from и to — границы по моменту отказа (ISO), необязательные.
 * @returns {{ total: number, byReason: Array<{ key: string, title: string, count: number }> }}
 */
export function refusalStats(rooms, { from = null, to = null } = {}) {
  const counts = new Map();
  let total = 0;
  for (const room of Array.isArray(rooms) ? rooms : []) {
    if (!room || room.status !== 'closed' || !isRefused(room)) continue;
    const at = String(room.refusal.at || room.updatedAt || '');
    if (from && at && at < from) continue;
    if (to && at && at > to) continue;
    total += 1;
    const key = room.refusal.reasonKey;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const byReason = [...counts.entries()]
    .map(([key, count]) => ({ key, title: refusalReasonPlain(key), count }))
    .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title, 'ru'));
  return { total, byReason };
}
