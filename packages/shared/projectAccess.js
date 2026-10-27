/**
 * Статус проекта и видимость сумм.
 * Одна цепочка, без отдельной сущности. Бригада не получает деньги.
 */

export const PROJECT_STATUSES = ['new', 'measure', 'proposal', 'install', 'done'];

export const PROJECT_STATUS_LABELS = {
  new: 'Новый',
  measure: 'Замер',
  proposal: 'Предложение',
  install: 'Монтаж',
  done: 'Готово',
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

/** Бригада видит количества, но не цены и суммы. Остальные роли — полный расчёт. */
export function estimateForRole(estimate, role) {
  if (estimate == null || typeof estimate !== 'object') return estimate ?? null;
  if (role !== 'crew') return estimate;
  const next = { ...estimate };
  for (const key of MONEY_KEYS) delete next[key];
  return next;
}

export function roleSeesProjectMoney(role) {
  return role !== 'crew';
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
