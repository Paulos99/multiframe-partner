/**
 * «По месяцам» показываем, только если период длиннее двух месяцев.
 * Открытые границы («Всё время») берём по первой и последней точке ряда.
 */
export function spansMoreThanTwoMonths(
  fromYmd: string | null,
  toYmd: string | null,
  series: ReadonlyArray<{ day: string }>,
): boolean {
  const days = series.map((p) => p.day).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  const from = fromYmd ?? days[0];
  const to = toYmd ?? days[days.length - 1];
  if (!from || !to) return false;
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  const limit = Date.UTC(fy, fm - 1 + 2, fd);
  return Date.UTC(ty, tm - 1, td) > limit;
}
