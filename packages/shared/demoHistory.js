/**
 * Недостающий хвост демо-года считается при чтении.
 * Сохранённый месяц не переписывается: запись в хранилище может не влезть,
 * а неделя уже принята.
 */

const MARKER_ID = 'ev_demo_history_schema';
const YEAR_SPAN_MS = 300 * 24 * 60 * 60 * 1000;
const DEMO_ORG_IDS = new Set(['org_demo', 'org_demo_spb']);

function demoStamps(events) {
  return (events || [])
    .filter((event) => event && DEMO_ORG_IDS.has(event.orgId) && event.id !== MARKER_ID)
    .map((event) => Date.parse(event.at || ''))
    .filter((stamp) => !Number.isNaN(stamp));
}

export function demoHistoryReady(events) {
  const list = Array.isArray(events) ? events : [];
  const marker = list.find((event) => event && event.id === MARKER_ID);
  if (!(Number(marker?.schema) >= 3)) return false;
  const stamps = demoStamps(list);
  if (stamps.length < 2) return false;
  return Math.max(...stamps) - Math.min(...stamps) >= YEAR_SPAN_MS;
}

/**
 * К сохранённым событиям демо добавляет только более старую часть генератора.
 * Чужая компания, уже готовый год и повторный вызов не меняют массив.
 */
export function supplementDemoHistory(stored, generated) {
  const list = Array.isArray(stored) ? stored : [];
  if (!list.some((event) => event && DEMO_ORG_IDS.has(event.orgId))) return list;
  if (demoHistoryReady(list)) return list;
  const stamps = demoStamps(list);
  const oldest = stamps.length ? Math.min(...stamps) : Number.POSITIVE_INFINITY;
  const have = new Set(list.map((event) => event && event.id).filter(Boolean));
  const extra = [];
  for (const event of generated || []) {
    if (!event || !DEMO_ORG_IDS.has(event.orgId)) continue;
    if (event.id && have.has(event.id)) continue;
    const stamp = Date.parse(event.at || '');
    if (Number.isNaN(stamp) || !(stamp < oldest)) continue;
    extra.push(event);
    if (event.id) have.add(event.id);
  }
  if (!extra.length) return list;
  return list.concat(extra);
}
