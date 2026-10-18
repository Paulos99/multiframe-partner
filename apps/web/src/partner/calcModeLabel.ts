/**
 * Подписи режимов калькулятора для интерфейса и выгрузок.
 * Внутренние ключи (draw, dims, area…) в данных не меняем — только показываем по-русски.
 * Сырой ключ в интерфейс не попадает никогда.
 */
const CALC_MODE_LABELS: Record<string, string> = {
  area: 'Только площадь',
  dims: 'Размеры',
  draw: 'Схема',
  scheme: 'Схема',
  polygon: 'Полигон',
};

export function calcModeLabel(mode: unknown): string {
  const key = typeof mode === 'string' ? mode.trim().toLowerCase() : '';
  if (!key || key === 'unknown') return 'Не указано';
  return CALC_MODE_LABELS[key] ?? 'Другой режим';
}
