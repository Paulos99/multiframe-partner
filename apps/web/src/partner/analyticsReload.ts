/**
 * Когда перезагрузка аналитики должна показать скелет и заново проиграть появление,
 * а когда остаётся тихим фоновым обновлением (опрос объектов/проектов раз в ~минуту).
 */

export type AnalyticsReloadFilters = {
  mode: string;
  fromYmd: string;
  toYmd: string;
  focusOrg: string;
  orgId: string;
  login: string;
  section: string;
};

/** Ключ пользовательских фильтров: смена → жёсткая перезагрузка с анимацией. */
export function analyticsFiltersKey(parts: AnalyticsReloadFilters): string {
  return [
    parts.mode,
    parts.fromYmd,
    parts.toYmd,
    parts.focusOrg,
    parts.orgId,
    parts.login,
    parts.section,
  ].join('|');
}

/**
 * true — показать «Загрузка…», размонтировать KPI/графики (анимация при появлении).
 * false — обновить цифры на месте: без скелета, без ремоунта, без повторного enter/grow.
 */
export function shouldFlashAnalyticsReload(opts: {
  loadedOnce: boolean;
  prevFiltersKey: string;
  nextFiltersKey: string;
}): boolean {
  if (!opts.loadedOnce) return true;
  return opts.prevFiltersKey !== opts.nextFiltersKey;
}
