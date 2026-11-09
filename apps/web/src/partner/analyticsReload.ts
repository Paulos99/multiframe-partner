/**
 * Когда перезагрузка аналитики должна показать скелет и заново проиграть появление,
 * а когда остаётся тихим фоновым обновлением (опрос объектов/проектов раз в ~минуту)
 * или простой сменой раздела без пересчёта периода.
 */

export type AnalyticsReloadFilters = {
  mode: string;
  fromYmd: string;
  toYmd: string;
  focusOrg: string;
  orgId: string;
  login: string;
};

/** Ключ периода и фильтров данных: смена → жёсткая перезагрузка с анимацией. Раздел (Обзор/Журнал/…) сюда не входит. */
export function analyticsFiltersKey(parts: AnalyticsReloadFilters): string {
  return [parts.mode, parts.fromYmd, parts.toYmd, parts.focusOrg, parts.orgId, parts.login].join('|');
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

/** Заголовок шапки аналитики по активному разделу. */
export function analyticsSectionTitle(section: string, mode: 'admin' | 'partner'): string {
  switch (section) {
    case 'photos':
      return 'Фото отчёты';
    case 'objects':
      return 'Журнал';
    case 'team':
      return mode === 'admin' ? 'Сотрудники сети' : 'Сотрудники';
    case 'training':
      return 'Обучение';
    case 'companies':
      return 'Компании';
    case 'portrait':
      return 'Комнаты';
    default:
      return mode === 'admin' ? 'Аналитика' : 'Аналитика команды';
  }
}
