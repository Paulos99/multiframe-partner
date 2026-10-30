/**
 * Справочник городов РФ.
 * Данные: packages/shared/data/ru-cities.tsv
 * Источник: Википедия, «Список городов России» (CC BY-SA 4.0).
 */

/** @typedef {{ name: string, subject: string, population: number, label: string }} CityRow */

const DASH_SPLIT = /\s*[—–-]\s*/;

/** @type {CityRow[] | null} */
let rows = null;
/** @type {Map<string, CityRow>} */
let byLabel = new Map();
/** @type {Map<string, CityRow | null>} */
let byName = new Map();

export function foldCity(value) {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase('ru-RU')
    .replaceAll('ё', 'е')
    .replace(/\s+/g, ' ');
}

export function cityLabel(name, subject) {
  return `${name} — ${subject}`;
}

/** @param {string} text */
export function parseCityTsv(text) {
  /** @type {CityRow[]} */
  const list = [];
  for (const line of String(text).split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const [name, subject, population] = trimmed.split('\t');
    if (!name || !subject) continue;
    list.push({
      name,
      subject,
      population: Number(population) || 0,
      label: cityLabel(name, subject),
    });
  }
  return list;
}

/** @param {string} text */
export function ensureIndexFromTsv(text) {
  rows = parseCityTsv(text);
  byLabel = new Map();
  byName = new Map();
  for (const row of rows) {
    byLabel.set(foldCity(row.label), row);
    const key = foldCity(row.name);
    if (!byName.has(key)) byName.set(key, row);
    else byName.set(key, null);
  }
}

export function citiesReady() {
  return Array.isArray(rows) && rows.length > 0;
}

/**
 * @param {string} query
 * @param {number} [limit]
 * @returns {CityRow[]}
 */
export function searchCities(query, limit = 8) {
  if (!rows) return [];
  const q = foldCity(query);
  if (!q) return [];
  /** @type {Array<{ rank: number, row: CityRow }>} */
  const hits = [];
  for (const row of rows) {
    const name = foldCity(row.name);
    const subject = foldCity(row.subject);
    let rank = 99;
    if (name.startsWith(q)) rank = 0;
    else if (name.includes(q)) rank = 1;
    else if (subject.includes(q)) rank = 2;
    else continue;
    hits.push({ rank, row });
  }
  hits.sort(
    (a, b) =>
      a.rank - b.rank ||
      b.row.population - a.row.population ||
      a.row.name.localeCompare(b.row.name, 'ru'),
  );
  return hits.slice(0, limit).map((hit) => hit.row);
}

/**
 * Пустая строка допустима.
 * Если текст совпадает с уже сохранённым значением — оставляем его,
 * даже когда города нет в справочнике (старые карточки не переписываем).
 * @param {unknown} input
 * @param {unknown} [previous]
 * @returns {{ ok: true, city: string } | { ok: false, message: string }}
 */
export function resolveCity(input, previous) {
  const raw = String(input ?? '').trim().replace(/\s+/g, ' ');
  const prev = previous == null ? null : String(previous).trim();
  if (!raw) return { ok: true, city: '' };
  if (prev != null && raw === prev) return { ok: true, city: prev };
  if (!rows) {
    return { ok: false, message: 'Справочник городов ещё загружается' };
  }
  const folded = foldCity(raw);
  const direct = byLabel.get(folded);
  if (direct) return { ok: true, city: direct.label };

  const parts = raw.split(DASH_SPLIT).filter(Boolean);
  if (parts.length === 2) {
    const nameF = foldCity(parts[0]);
    const subjectF = foldCity(parts[1]);
    const found = rows.find(
      (row) => foldCity(row.name) === nameF && foldCity(row.subject) === subjectF,
    );
    if (found) return { ok: true, city: found.label };
  }

  if (byName.has(folded)) {
    const named = byName.get(folded);
    if (named) return { ok: true, city: named.label };
    return {
      ok: false,
      message: 'Несколько городов с таким названием — выберите с регионом',
    };
  }
  return { ok: false, message: 'Выберите город из справочника РФ' };
}

/** @param {unknown} input */
export function isKnownCity(input) {
  const raw = String(input ?? '').trim();
  if (!raw) return true;
  const resolved = resolveCity(raw, null);
  return resolved.ok;
}
