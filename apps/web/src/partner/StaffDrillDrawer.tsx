import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ROLE_LABELS, type UserRole } from '../../../../packages/shared/partner';
import type {
  DrillPeriod,
  DrillProject,
  DrillRankingRow,
  DrillRoleId,
  StaffDrillResult,
} from '../../../../packages/shared/staffDrill.js';
import type { AnalyticsEvent } from '../../../../packages/shared/partner';
import { composeCabinetAnalytics, fetchAnalyticsDashboard, presetRange, rangeFromYmd } from './analytics';
import { isDemoModeEnabled } from './demoMode';
import { Skeleton } from './Skeleton';
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
  onPeriodChange,
  onClose,
  onOpenRoom,
  objects,
  projects,
  events,
  users,
  children,
}: {
  metric: string;
  mode: 'admin' | 'partner';
  orgId?: string | null;
  from?: string | null;
  to?: string | null;
  onPeriodChange?: (period: DrillPeriod) => void;
  onClose: () => void;
  onOpenRoom?: (roomId: string) => void;
  objects?: Array<Record<string, unknown>>;
  projects?: Array<Record<string, unknown>>;
  /** Тот же массив, из которого посчитаны плитки на экране. */
  events?: AnalyticsEvent[];
  /** Сотрудники того же кабинета, что и доска. */
  users?: Array<{ id: string; login?: string; displayName?: string; role: string; orgId?: string | null }>;
  children?: ReactNode;
}) {
  const [period, setPeriod] = useState<DrillPeriod | null>(null);
  const [roleId, setRoleId] = useState<DrillRoleId | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [data, setData] = useState<StaffDrillResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const explainZeros = import.meta.env.DEV || isDemoModeEnabled();
  const title = METRIC_LABELS[metric] || 'Рейтинг';

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    setRoleId(null);
    setUserId(null);
  }, [metric]);

  const preset = period ? presetRange(period) : null;
  const activeRange = preset
    ? rangeFromYmd(preset.fromYmd, preset.toYmd)
    : { from: from ?? null, to: to ?? null };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const from = activeRange.from ?? (activeRange.to ? null : 'all');
    const to = activeRange.to;
    const localDemo = orgId === 'org_demo' || orgId === 'org_demo_spb';
    void (async () => {
      try {
        // Демо уже держит полный архив. Чужой сервер отдаёт события выбранного окна, комнаты остаются из кабинета.
        let list = events || [];
        if (!localDemo) {
          const remote = await fetchAnalyticsDashboard({ mode, from, to, orgId });
          if (remote.source === 'api') list = remote.events || [];
        }
        const { drill } = composeCabinetAnalytics({
          events: list,
          objects,
          projects,
          users,
          from,
          to,
          orgId,
          metric,
          period: period ?? 'month',
          userId,
          mode,
        });
        if (!cancelled) setData(drill);
      } catch (reason: unknown) {
        if (!cancelled) {
          setData(null);
          setError(reason instanceof Error ? reason.message : 'Не удалось открыть рейтинг');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [metric, mode, orgId, period, userId, activeRange.from, activeRange.to, objects, projects, events, users]);

  const roles = visibleRoles(data);
  const activeRole = roles.find((role) => role.id === roleId) || roles[0] || null;
  const ranking = activeRole?.ranking || [];
  const person = ranking.find((row) => row.userId === userId) || data?.ranking.find((row) => row.userId === userId) || null;
  const detail = data?.detail && data.detail.userId === userId ? data.detail : null;

  function openProject(project: DrillProject) {
    if (!project.roomId || !onOpenRoom) return;
    onOpenRoom(project.roomId);
    onClose();
  }

  return createPortal(
    <>
      <button type="button" className={styles.drawerBackdrop} aria-label="Закрыть рейтинг" onClick={onClose} />
      <aside className={`${styles.drawer} ${styles.drawerWide}`} role="dialog" aria-label={title}>
        <div className={styles.drawerHead}>
          <div>
            <nav className={styles.crumbs} aria-label="Путь">
              <button type="button" className={styles.crumbBtn} onClick={() => setUserId(null)}>
                Рейтинг
              </button>
              {person ? (
                <span className={styles.crumb}>
                  <span aria-hidden>·</span>
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
          <button type="button" className={styles.ghost} onClick={() => (userId ? setUserId(null) : onClose())}>
            {userId ? 'Назад' : 'Закрыть'}
          </button>
        </div>

        {explainZeros && data ? (
          <p className={styles.whyZeroReport} data-testid="why-zero">
            чему 0. Хранилище mf_partner_db_v5. Комнат {data.drops?.rooms ?? 0}. Событий {data.drops?.events ?? 0}.
            Отсечено: компания {data.drops?.company ?? 0}, период {data.drops?.period ?? 0}, исполнитель{' '}
            {data.drops?.assignee ?? 0}. Монтаж: {assignmentLine(data.drops?.installByUser)}. Закрыто:{' '}
            {assignmentLine(data.drops?.closedByUser)}. Плитка панелей {data.drops?.tilePanels ?? 0}, площадь{' '}
            {data.drops?.tileArea ?? 0}.
          </p>
        ) : null}

        <div className={styles.drillPeriods} role="group" aria-label="Период рейтинга">
          {PERIODS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={styles.ghost}
              aria-pressed={period === item.id}
              onClick={() => {
                setPeriod(item.id);
                setUserId(null);
                onPeriodChange?.(item.id);
              }}
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
                  setRoleId(role.id);
                  setUserId(null);
                }}
              >
                {role.label}
              </button>
            ))}
          </div>
        ) : null}

        {loading && !data ? <Skeleton kind="rows" count={4} label="Загрузка рейтинга" /> : null}
        {error ? (
          <p className={styles.error} role="alert">
            {error}
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
                onClick={() => setUserId(row.userId)}
              >
                <span className={styles.drillPersonHead}>
                  <strong>
                    {index + 1}. {row.displayName}
                  </strong>
                  <span className={styles.drillValue}>{formatNum(row.value)}</span>
                </span>
                <span className={styles.hint}>
                  {roleLabel(row.role)}
                  {metric === 'staff' ? '' : ` · ${title}`}
                </span>
                <span className={styles.drillStats}>{activityLine(row)}</span>
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
      </aside>
    </>,
    document.body,
  );
}
