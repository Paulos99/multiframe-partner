/**
 * Разница уровней звукового давления: дБ → «в разах» и % (справочная таблица StP).
 */
export type SoundPressureRow = {
  db: number;
  decreaseTimes: number;
  decreasePct: number;
  increasePct: number;
  increaseTimes: number;
};

/** Строки 1…20 дБ — как в справочной таблице. */
export const SOUND_PRESSURE_TABLE: readonly SoundPressureRow[] = [
  { db: 1, decreaseTimes: 1.12, decreasePct: 11, increasePct: 12, increaseTimes: 1.26 },
  { db: 2, decreaseTimes: 1.26, decreasePct: 21, increasePct: 26, increaseTimes: 1.58 },
  { db: 3, decreaseTimes: 1.41, decreasePct: 29, increasePct: 41, increaseTimes: 2.0 },
  { db: 4, decreaseTimes: 1.58, decreasePct: 37, increasePct: 58, increaseTimes: 2.51 },
  { db: 5, decreaseTimes: 1.78, decreasePct: 44, increasePct: 78, increaseTimes: 3.16 },
  { db: 6, decreaseTimes: 2.0, decreasePct: 50, increasePct: 100, increaseTimes: 3.98 },
  { db: 7, decreaseTimes: 2.24, decreasePct: 55, increasePct: 124, increaseTimes: 5.01 },
  { db: 8, decreaseTimes: 2.51, decreasePct: 60, increasePct: 151, increaseTimes: 6.31 },
  { db: 9, decreaseTimes: 2.82, decreasePct: 65, increasePct: 182, increaseTimes: 7.94 },
  { db: 10, decreaseTimes: 3.16, decreasePct: 68, increasePct: 216, increaseTimes: 10.0 },
  { db: 11, decreaseTimes: 3.55, decreasePct: 72, increasePct: 255, increaseTimes: 12.59 },
  { db: 12, decreaseTimes: 3.98, decreasePct: 75, increasePct: 298, increaseTimes: 15.85 },
  { db: 13, decreaseTimes: 4.47, decreasePct: 78, increasePct: 347, increaseTimes: 19.95 },
  { db: 14, decreaseTimes: 5.01, decreasePct: 80, increasePct: 401, increaseTimes: 25.12 },
  { db: 15, decreaseTimes: 5.62, decreasePct: 82, increasePct: 462, increaseTimes: 31.62 },
  { db: 16, decreaseTimes: 6.31, decreasePct: 84, increasePct: 531, increaseTimes: 39.81 },
  { db: 17, decreaseTimes: 7.08, decreasePct: 86, increasePct: 608, increaseTimes: 50.12 },
  { db: 18, decreaseTimes: 7.94, decreasePct: 87, increasePct: 694, increaseTimes: 63.1 },
  { db: 19, decreaseTimes: 8.91, decreasePct: 89, increasePct: 791, increaseTimes: 79.43 },
  { db: 20, decreaseTimes: 10.0, decreasePct: 90, increasePct: 900, increaseTimes: 100.0 },
];

function rowForDb(dbInt: number): SoundPressureRow {
  const clamped = Math.min(20, Math.max(1, dbInt));
  return SOUND_PRESSURE_TABLE[clamped - 1]!;
}

/** % снижения звукового давления по |Δ| дБ (интерполяция между строками таблицы). */
export function perceivedReductionPct(absDeltaDb: number): number {
  const d = Math.abs(absDeltaDb);
  if (d < 0.05) return 0;
  if (d >= 20) return SOUND_PRESSURE_TABLE[19]!.decreasePct;
  if (d < 1) return Math.round(d * rowForDb(1).decreasePct);

  const lo = Math.floor(d);
  const hi = Math.ceil(d);
  const pctLo = rowForDb(lo).decreasePct;
  const pctHi = rowForDb(hi).decreasePct;
  if (lo === hi) return pctLo;
  const t = d - lo;
  return Math.round(pctLo + t * (pctHi - pctLo));
}

export function formatTimesRu(n: number): string {
  return n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
