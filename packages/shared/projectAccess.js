/**
 * Статус проекта и видимость сумм.
 * Одна цепочка, без отдельной сущности. Цены видят все роли, в том числе монтажник.
 */

export const PROJECT_STATUSES = ['new', 'measure', 'proposal', 'install', 'done'];

export const PROJECT_STATUS_LABELS = {
  new: 'Новый',
  measure: 'Замер',
  proposal: 'Предложение',
  install: 'Монтаж',
  done: 'Завершён',
};

const MONEY_KEYS = [
  'totalCost',
  'panelsCost',
  'installCost',
  'dowelsCost',
  'panelPriceRub',
  'pricePerM2',
  'installPlusFasteners',
];

/**
 * Цены и суммы видят все роли, в том числе монтажник (решение владельца, 9 ноября 2026).
 * Правило в одном месте: если понадобится снова скрыть цены у роли, меняется только roleSeesProjectMoney.
 */
export function roleSeesProjectMoney(role) {
  void role;
  return true;
}

/** Расчёт для роли: без цен и сумм только у роли, которой цены не положены. */
export function estimateForRole(estimate, role) {
  if (estimate == null || typeof estimate !== 'object') return estimate ?? null;
  if (roleSeesProjectMoney(role)) return estimate;
  const next = { ...estimate };
  for (const key of MONEY_KEYS) delete next[key];
  return next;
}

/** ГГГГ-ММ-ДД или пусто. Некалендарная дата — ошибка. */
export function cleanProjectDate(value) {
  if (value == null || String(value).trim() === '') return { value: null };
  const day = String(value).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return { error: 'Срок укажите датой' };
  const parsed = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== day) {
    return { error: 'Срок укажите датой' };
  }
  return { value: day };
}

export function cleanProjectStatus(value) {
  const status = String(value || '').trim();
  if (!status) return { value: undefined };
  if (!PROJECT_STATUSES.includes(status)) return { error: 'Неизвестный статус проекта' };
  return { value: status };
}
