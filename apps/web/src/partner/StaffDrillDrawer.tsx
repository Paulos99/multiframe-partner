import { useEffect, type ReactNode } from 'react';
import { ROLE_LABELS, type UserRole } from '../../../../packages/shared/partner';
import type {
  DrillPeriod,
  DrillProject,
  DrillRankingRow,
  DrillRoleId,
  StaffDrillResult,
} from '../../../../packages/shared/staffDrill.js';
import { goAnalytics, useAnalyticsRoute } from './analyticsRoute';
import { analyticsSourceLabel, composeCabinetAnalytics, presetRange, rangeFromYmd, resolveCompanyRooms, type AnalyticsTileModel } from './analytics';
import { isDebugMode } from './demoMode';
import styles from './partner.module.css';

const METRIC_LABELS: Record<string, string> = {
  staff: 'Сотрудники',
  problemomer: 'Проблемомер',
  calculator: 'Калькулятор',
  pdf: 'PDF',
  area: 'Площадь, м²',
  panels: 'Панели',
  avg: 'Средняя м²',
  done: 'Готовых расчётов',
};

const NO_DATA_TEXT = 'За период нет данных по этому показателю';

const METRIC_UNITS: Record<string, string> = {
  area: ' м²',
  avg: ' м²',
  panels: ' пан.',
};

function valueWithUnit(value: number, metric: string): string {
  return `${formatNum(value)}${METRIC_UNITS[metric] || ''}`;
}

const PERIODS: Array<{ id: DrillPeriod; label: string }> = [
  { id: 'month', label: 'Месяц' },
  { id: 'quarter', label: 'Квартал' },
  { id: 'year', label: 'Год' },
];

const RANK_TAB_LABELS: Record<DrillRoleId, string> = {
  sales: 'Менеджеры',
  measurer: 'Замерщики',
  crew: 'Монтажники',
  unassigned: 'Без исполнителя',
};

function visibleRoles(data: StaffDrillResult | null) {
  const provided = (data?.roles || []).filter((role) => role.ranking.length);
  const source = provided.length
    ? provided
    : (['sales', 'measurer', 'crew'] as DrillRoleId[])
        .map((id) => ({
          id,
          label: RANK_TAB_LABELS[id],
          ranking: (data?.ranking || []).filter((row) => row.role === id),
        }))
        .filter((role) => role.ranking.length);
  return source.map((role) => ({
    ...role,
    label: RANK_TAB_LABELS[role.id] || role.label,
  }));
}

function formatNum(n: number): string {
  if (!Number.isFinite(n)) return '0';
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10);
}

function roleLabel(role: string): string {
  if (role === 'unassigned') return 'Без исполнителя';
  return ROLE_LABELS[role as UserRole] || role;
}

function assignmentLine(counts: Record<string, number> | undefined): string {
  const entries = Object.entries(counts || {});
  if (!entries.length) return 'нет';
  return entries.map(([userId, count]) => `${userId} × ${count}`).join(', ');
}

function monthLine(row: Pick<DrillRankingRow, 'problemomer' | 'calculator' | 'pdf' | 'areaM2' | 'panels'>): string {
  return `Проблемомер ${row.problemomer} · расчёты ${row.calculator} · PDF ${row.pdf} · ${formatNum(row.areaM2)} м² · панели ${formatNum(row.panels)}`;
}

function activityLine(row: DrillRankingRow): string {
  if (row.role === 'crew') {
    return `Смонтировано ${formatNum(row.mountedRooms)} · ${formatNum(row.mountedAreaM2)} м² · панели ${formatNum(row.mountedPanels)}`;
  }
  if (row.role === 'measurer') {
    return `Замеры ${formatNum(row.measuredRooms)} · ${formatNum(row.areaM2)} м² · расчёты ${formatNum(row.problemomer + row.calculator)}`;
  }
  return `Проблемомер ${row.problemomer} · расчёты ${row.calculator} · PDF ${row.pdf} · проекты ${formatNum(row.projectCount)} · ${formatNum(row.areaM2)} м²`;
}

export function StaffDrillDrawer({
  metric,
  mode,
  orgId,
  from,
  to,
  onOpenRoom,
  model,
  tilePanels,
  tileArea,
  children,
}: {
  metric: string;
  mode: 'admin' | 'partner';
  orgId?: string | null;
  from?: string | null;
  to?: string | null;
  onOpenRoom?: (roomId: string) => void;
  /** Тот же объект, из которого нарисованы плитки. Второй запрос сюда не ходит. */
  model: AnalyticsTileModel;
  /** Те же числа, что стоят на плитках в этом кадре. */
  tilePanels: number;
  tileArea: number;
  children?: ReactNode;
}) {
  const route = useAnalyticsRoute();
  const period = route.period;
  const explainZeros = isDebugMode();
  const title = METRIC_LABELS[metric] || 'Рейтинг';

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') window.history.back();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const preset = period ? presetRange(period) : null;
  const activeRange = preset
    ? rangeFromYmd(preset.fromYmd, preset.toYmd)
    : { from: model.from ?? from ?? null, to: model.to ?? to ?? null };

  let data: StaffDrillResult | null = null;
  let error: string | null = null;
  try {
    data = composeCabinetAnalytics({
      events: model.events,
      objects: resolveCompanyRooms(model.objects, orgId),
      projects: model.projects,
      users: model.users,
      from: activeRange.from ?? (activeRange.to ? null : 'all'),
      to: activeRange.to,
      orgId,
      metric,
      period: period ?? 'month',
      userId: route.userId,
      mode,
      kpi: period ? undefined : { panels: tilePanels, areaM2: tileArea },
    }).drill;
  } catch (reason: unknown) {
    error = reason instanceof Error ? reason.message : 'Не удалось открыть рейтинг';
  }

  const roles = visibleRoles(data);
  const activeRole = roles.find((role) => role.id === route.role) || roles[0] || null;
  const activeRoleId = activeRole?.id ?? null;
  const ranking = activeRole?.ranking || [];
  const person = route.userId
    ? ranking.find((row) => row.userId === route.userId) || data?.ranking.find((row) => row.userId === route.userId) || null
    : null;
  const detail = data?.detail && data.detail.userId === route.userId ? data.detail : null;

  useEffect(() => {
    if (!activeRoleId) return;
    if (route.role === activeRoleId) return;
    goAnalytics(
      {
        page: route.page === 'staff' ? 'staff' : 'rating',
        metric,
        role: activeRoleId,
        userId: route.page === 'staff' ? route.userId : null,
        period: route.period,
      },
      'replace',
    );
  }, [activeRoleId, metric, route.page, route.period, route.role, route.userId]);

  function openProject(project: DrillProject) {
    if (!project.roomId || !onOpenRoom) return;
    onOpenRoom(project.roomId);
  }

  function selectPeriod(next: DrillPeriod) {
    goAnalytics(
      {
        page: 'rating',
        metric,
        role: activeRole?.id ?? route.role,
        userId: null,
        period: next,
      },
      'replace',
    );
  }

  return (
    <section className={styles.sheet} role="region" aria-label={title}>
      <div className={styles.drawerHead}>
        <div>
          <nav className={styles.crumbs} aria-label="Путь">
            <button type="button" className={styles.crumbBtn} onClick={() => window.history.back()}>
              Аналитика
            </button>
            <span className={styles.crumb}>
              <span aria-hidden>/</span>
              {person ? (
                <button type="button" className={styles.crumbBtn} onClick={() => window.history.back()}>
                  {title}
                </button>
              ) : (
                <span>{title}</span>
              )}
            </span>
            {person ? (
              <span className={styles.crumb}>
                <span aria-hidden>/</span>
                <span>{person.displayName}</span>
              </span>
            ) : null}
          </nav>
          <h3>{person ? person.displayName : title}</h3>
          <p className={styles.lead}>
            {data?.scope === 'team' ? 'Моя команда' : 'Вся компания'}
            {person ? ` · ${roleLabel(person.role)}` : ''}
          </p>
        </div>
        {person ? (
          <button type="button" className={styles.ghost} onClick={() => window.history.back()}>
            Назад
          </button>
        ) : null}
      </div>

      {explainZeros && data ? (
        <p className={styles.whyZeroReport} data-testid="why-zero">
          Почему 0. Источник: {analyticsSourceLabel(model.source)}. Хранилище mf_partner_db_v5. Комнат{' '}
          {data.drops?.rooms ?? 0}. Событий {data.drops?.events ?? 0}.
          Отсечено: компания {data.drops?.company ?? 0}, период {data.drops?.period ?? 0}, исполнитель{' '}
          {data.drops?.assignee ?? 0}. Монтаж: {assignmentLine(data.drops?.installByUser)}. Закрыто:{' '}
          {assignmentLine(data.drops?.closedByUser)}. Плитка панелей {tilePanels}, площадь {tileArea}.
        </p>
      ) : null}

      <div className={styles.drillPeriods} role="group" aria-label="Период рейтинга">
        {PERIODS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={styles.ghost}
            aria-pressed={period === item.id}
            onClick={() => selectPeriod(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {roles.length ? (
        <div className={styles.drillPeriods} role="tablist" aria-label="Роли">
          {roles.map((role) => (
            <button
              key={role.id}
              type="button"
              role="tab"
              className={styles.ghost}
              aria-selected={activeRole?.id === role.id}
              aria-pressed={activeRole?.id === role.id}
              onClick={() => {
                goAnalytics(
                  {
                    page: 'rating',
                    metric,
                    role: role.id,
                    userId: null,
                    period: route.period,
                  },
                  'replace',
                );
              }}
            >
              {role.label}
            </button>
          ))}
        </div>
      ) : null}

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      {!explainZeros && data && !error && metric !== 'staff' && ranking.every((row) => row.value === 0) ? (
        <p className={styles.hint} data-testid="no-data">
          {NO_DATA_TEXT}
        </p>
      ) : null}
      {data?.demoFilled ? (
        <p className={styles.hint}>Пока нет своей активности — показаны примерные цифры.</p>
      ) : null}

      {!person ? (
        <div className={styles.drillRank}>
          {ranking.map((row, index) => (
            <button
              key={row.userId}
              type="button"
              className={styles.drillPerson}
              onClick={() => {
                goAnalytics(
                  {
                    page: 'staff',
                    metric,
                    role: activeRole?.id ?? route.role,
                    userId: row.userId,
                    period: route.period,
                  },
                  'push',
                );
              }}
            >
              <span className={styles.drillPersonHead}>
                <strong>
                  {index + 1}. {row.displayName}
                </strong>
                <span className={styles.drillValue}>{valueWithUnit(row.value, metric)}</span>
              </span>
              <span className={styles.hint}>
                {roleLabel(row.role)}
                {metric === 'staff' ? '' : ` · ${title}`}
              </span>
              <span className={styles.drillStats}>{activityLine(row)}</span>
              {row.value === 0 ? <span className={styles.hint}>{NO_DATA_TEXT}</span> : null}
            </button>
          ))}
          {data && !ranking.length ? <p className={styles.lead}>Пока нет активности</p> : null}
        </div>
      ) : null}

      {person ? null : children}

      {person && detail ? (
        <div className={styles.drillDetail}>
          <h4 className={styles.dashSub}>
            {person.role === 'crew' ? 'За период' : 'Среднемесячные показатели'}
          </h4>
          <div className={styles.drillAvg}>
            {(person.role === 'crew'
              ? ([
                  ['Смонтировано комнат', person.mountedRooms],
                  ['Площадь, м²', person.mountedAreaM2],
                  ['Панели', person.mountedPanels],
                ] as Array<[string, number]>)
              : person.role === 'measurer'
                ? ([
                    ['Замеры', person.measuredRooms],
                    ['Площадь, м²', detail.averages.areaM2],
                    ['Расчёты', detail.averages.problemomer + detail.averages.calculator],
                  ] as Array<[string, number]>)
                : ([
                    ['Проблемомер', detail.averages.problemomer],
                    ['Расчёты', detail.averages.calculator],
                    ['PDF', detail.averages.pdf],
                    ['Проекты', person.projectCount],
                    ['Площадь, м²', detail.averages.areaM2],
                  ] as Array<[string, number]>)).map(([label, value]) => (
              <div key={label} className={styles.drillAvgItem}>
                <span>{label}</span>
                <strong>{formatNum(value)}</strong>
              </div>
            ))}
          </div>

          <h4 className={styles.dashSub}>По месяцам</h4>
          <ul className={styles.drillMonths}>
            {detail.months.map((month) => (
              <li key={month.key}>
                <span>{month.label}</span>
                <span>{monthLine(month)}</span>
              </li>
            ))}
          </ul>

          <h4 className={styles.dashSub}>Топ проектов</h4>
          {detail.projects.length ? (
            <div className={styles.drillRank}>
              {detail.projects.map((project) => {
                const openable = Boolean(project.roomId && onOpenRoom);
                const body = (
                  <>
                    <span className={styles.drillPersonHead}>
                      <strong>{project.name}</strong>
                      <span className={styles.drillValue}>{formatNum(project.areaM2)} м²</span>
                    </span>
                    <span className={styles.hint}>
                      панели {formatNum(project.panels)} · комнат {project.rooms}
                    </span>
                  </>
                );
                return openable ? (
                  <button
                    key={project.id}
                    type="button"
                    className={styles.drillPerson}
                    onClick={() => openProject(project)}
                  >
                    {body}
                  </button>
                ) : (
                  <div key={project.id} className={styles.drillPerson}>
                    {body}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className={styles.lead}>За период проектов нет</p>
          )}
        </div>
      ) : null}
    </section>
  );
}
