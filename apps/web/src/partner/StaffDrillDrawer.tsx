import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ROLE_LABELS, type UserRole } from '../../../../packages/shared/partner';
import type {
  DrillPeriod,
  DrillProject,
  DrillRankingRow,
  StaffDrillResult,
} from '../../../../packages/shared/staffDrill.js';
import { fetchStaffDrill, rangeFromYmd, ymdLocal } from './analytics';
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

function formatNum(n: number): string {
  if (!Number.isFinite(n)) return '0';
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10);
}

function roleLabel(role: string): string {
  return ROLE_LABELS[role as UserRole] || role;
}

function activityLine(row: Pick<DrillRankingRow, 'problemomer' | 'calculator' | 'pdf' | 'areaM2' | 'panels'>): string {
  return `Проблемомер ${row.problemomer} · расчёты ${row.calculator} · PDF ${row.pdf} · ${formatNum(row.areaM2)} м² · панели ${formatNum(row.panels)}`;
}

function presetRange(period: DrillPeriod, now = new Date()): { fromYmd: string; toYmd: string } {
  const months = period === 'year' ? 12 : period === 'quarter' ? 3 : 1;
  const from = new Date(now.getFullYear(), now.getMonth() - months, now.getDate());
  return { fromYmd: ymdLocal(from), toYmd: ymdLocal(now) };
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
  children,
}: {
  metric: string;
  mode: 'admin' | 'partner';
  orgId?: string | null;
  from?: string | null;
  to?: string | null;
  onPeriodChange?: (fromYmd: string, toYmd: string) => void;
  onClose: () => void;
  onOpenRoom?: (roomId: string) => void;
  children?: ReactNode;
}) {
  const [period, setPeriod] = useState<DrillPeriod | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [data, setData] = useState<StaffDrillResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const title = METRIC_LABELS[metric] || 'Рейтинг';

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const preset = period ? presetRange(period) : null;
  const activeRange = preset
    ? rangeFromYmd(preset.fromYmd, preset.toYmd)
    : { from: from ?? null, to: to ?? null };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetchStaffDrill({
      mode,
      metric,
      period: period ?? 'month',
      userId,
      orgId,
      from: activeRange.from ?? (activeRange.to ? null : 'all'),
      to: activeRange.to,
    })
      .then((next) => {
        if (!cancelled) setData(next);
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setData(null);
          setError(reason instanceof Error ? reason.message : 'Не удалось открыть рейтинг');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [metric, mode, orgId, period, userId, activeRange.from, activeRange.to]);

  const person = data?.ranking.find((row) => row.userId === userId) || null;
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

        <div className={styles.drillPeriods} role="group" aria-label="Период рейтинга">
          {PERIODS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={styles.ghost}
              aria-pressed={period === item.id}
              onClick={() => {
                const next = presetRange(item.id);
                setPeriod(item.id);
                onPeriodChange?.(next.fromYmd, next.toYmd);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>

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
            {data?.ranking.map((row, index) => (
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
            {data && !data.ranking.length ? <p className={styles.lead}>Пока нет активности</p> : null}
          </div>
        ) : null}

        {person ? null : children}

        {person && detail ? (
          <div className={styles.drillDetail}>
            <h4 className={styles.dashSub}>Среднемесячные показатели</h4>
            <div className={styles.drillAvg}>
              {(
                [
                  ['Проблемомер', detail.averages.problemomer],
                  ['Расчёты', detail.averages.calculator],
                  ['PDF', detail.averages.pdf],
                  ['Площадь, м²', detail.averages.areaM2],
                  ['Панели', detail.averages.panels],
                  ['Готовых расчётов', detail.averages.completed],
                ] as Array<[string, number]>
              ).map(([label, value]) => (
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
                  <span>{activityLine(month)}</span>
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
