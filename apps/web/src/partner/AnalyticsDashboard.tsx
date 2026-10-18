import { Skeleton } from './Skeleton';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type {
  AnalyticsBreakdownItem,
  AnalyticsDashboard as DashData,
  AnalyticsFunnel,
  AnalyticsKpi,
  AnalyticsSeriesPoint,
} from '../../../../packages/shared/partner';
import {
  HOUSE_TYPE_OPTIONS,
  OBJECT_STAGE_OPTIONS,
  ROOM_TYPE_LABELS,
  type HouseTypeOption,
  type ObjectStageOption,
  type RoomType,
} from '../state/types';
import { comfortTransitionLabel, comfortTransitionRank } from '../state/simulation';
import { funnelPercents } from '../../../../packages/shared/funnel';
import {
  fetchAnalyticsDashboard,
  formatPeriodLabel,
  getAnalyticsFocusOrg,
  getAnalyticsPeriod,
  monthLabel,
  rangeFromYmd,
  setAnalyticsFocusOrg,
  setAnalyticsPeriod,
  subscribeAnalyticsFocusOrg,
  subscribeAnalyticsPeriod,
} from './analytics';
import { JournalDownload } from './JournalDownload';
import { CountUp, FadeRise } from './motionBits';
import { PeriodCalendar } from './PeriodCalendar';
import { usePartner } from './PartnerContext';
import styles from './partner.module.css';

const HOUSE_LABELS = Object.fromEntries(
  HOUSE_TYPE_OPTIONS.map((o) => [o.id, o.label]),
) as Record<HouseTypeOption, string>;

const STAGE_LABELS = Object.fromEntries(
  OBJECT_STAGE_OPTIONS.map((o) => [o.id, o.label]),
) as Record<ObjectStageOption, string>;

const MODE_LABELS: Record<string, string> = {
  area: 'Только площадь',
  dims: 'Размеры',
  polygon: 'Полигон',
};

function formatWhen(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('ru-RU');
  } catch {
    return iso;
  }
}

function formatDay(day: string): string {
  const [, m, d] = day.split('-');
  return m && d ? `${d}.${m}` : day;
}

function formatNum(n: number): string {
  if (!Number.isFinite(n)) return '0';
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10);
}

function deltaText(current: number, prev: number | null | undefined): string | null {
  if (prev == null) return null;
  const d = current - prev;
  if (d === 0) return '0';
  return d > 0 ? `+${formatNum(d)}` : formatNum(d);
}

function deltaClass(current: number, prev: number | null | undefined): string {
  if (prev == null) return '';
  const d = current - prev;
  if (d > 0) return styles.kpiUp;
  if (d < 0) return styles.kpiDown;
  return styles.kpiFlat;
}

function labelKey(
  key: string,
  kind: 'room' | 'house' | 'stage' | 'mode' | 'comfort' | 'raw',
): string {
  if (kind === 'room') {
    return ROOM_TYPE_LABELS[key as RoomType] || key;
  }
  if (kind === 'house') {
    return HOUSE_LABELS[key as HouseTypeOption] || key;
  }
  if (kind === 'stage') {
    return STAGE_LABELS[key as ObjectStageOption] || key;
  }
  if (kind === 'mode') {
    return MODE_LABELS[key] || key;
  }
  if (kind === 'comfort') {
    const parts = key.split('→');
    if (parts.length === 2) return comfortTransitionLabel(parts[0], parts[1]);
    return comfortTransitionLabel(key, null) || key;
  }
  return key === 'unknown' ? 'Не указано' : key;
}

function toolLabel(tool: string): string {
  if (tool === 'problemomer') return 'Проблемомер';
  if (tool === 'calculator') return 'Калькулятор';
  return tool;
}

function actionLabel(action: string): string {
  if (action === 'result') return 'расчёт';
  if (action === 'calc_done') return 'расчёт';
  if (action === 'pdf') return 'PDF';
  if (action === 'share') return 'шаринг';
  return action;
}

function KpiCard({
  label,
  value,
  prev,
  showDelta,
}: {
  label: string;
  value: number;
  prev?: number | null;
  showDelta: boolean;
}) {
  const delta = showDelta ? deltaText(value, prev) : null;
  return (
    <div className={styles.kpi}>
      <span className={styles.kpiLabel}>{label}</span>
      <strong>
        <CountUp value={value} />
      </strong>
      {delta != null ? (
        <span className={`${styles.kpiDelta} ${deltaClass(value, prev)}`}>
          {delta} к пред.
        </span>
      ) : (
        <span className={styles.kpiDelta} aria-hidden>
          {'\u00a0'}
        </span>
      )}
    </div>
  );
}

function FunnelBlock({
  title,
  steps,
}: {
  title: string;
  steps: Array<{ label: string; value: number }>;
}) {
  const percents = funnelPercents(steps.map((step) => step.value));
  return (
    <div className={styles.funnelBlock}>
      <h4 className={styles.funnelTitle}>
        {title}
        <span
          className={styles.funnelLabel}
          style={{ display: 'block', marginTop: 4, fontSize: '0.75rem', fontWeight: 650 }}
        >
          % от всех открытий
        </span>
      </h4>
      <ol className={styles.funnelSteps}>
        {steps.map((step, index) => (
          <li key={step.label}>
            <span className={styles.funnelLabel}>{step.label}</span>
            <strong>{step.value}</strong>
            <span className={styles.funnelPct}>{percents[index]}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

type SliceRow = { label: string; total: number };

function slicesFromSeries(series: AnalyticsSeriesPoint[]): {
  months: SliceRow[];
  days: Array<{ day: number; total: number }>;
} {
  const months = new Map<string, number>();
  const days = Array.from({ length: 31 }, () => 0);
  for (const p of series) {
    const [y, m, d] = p.day.split('-');
    if (!y || !m || !d) continue;
    const total = p.problemomer + p.calculator + p.pdf + p.logins;
    const key = `${y}-${m}`;
    months.set(key, (months.get(key) || 0) + total);
    const day = Number(d);
    if (day >= 1 && day <= 31) days[day - 1] += total;
  }
  return {
    months: [...months.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([key, total]) => ({ label: monthLabel(key), total })),
    days: days.map((total, i) => ({ day: i + 1, total })),
  };
}

function MonthSlice({ rows }: { rows: SliceRow[] }) {
  const max = Math.max(1, ...rows.map((r) => r.total));
  if (!rows.length) return <p className={styles.lead}>Пока нет данных по месяцам</p>;
  return (
    <ul className={styles.sliceList}>
      {rows.map((r) => (
        <li key={r.label} className={styles.sliceRow}>
          <span>{r.label}</span>
          <span className={styles.sliceTrack}>
            <span className={styles.sliceFill} style={{ width: `${(r.total / max) * 100}%` }} />
          </span>
          <strong>{r.total}</strong>
        </li>
      ))}
    </ul>
  );
}

function DaySlice({ days }: { days: Array<{ day: number; total: number }> }) {
  const max = Math.max(1, ...days.map((d) => d.total));
  return (
    <div className={styles.seriesChart} role="img" aria-label="Срез по дням месяца">
      {days.map((d) => (
        <div key={d.day} className={styles.seriesDay} title={`${d.day}: ${d.total}`}>
          <div className={styles.seriesBars}>
            <div
              className={`${styles.seriesBar} ${styles.barPm}`}
              style={{ height: `${(d.total / max) * 100}%` }}
            />
          </div>
          <span className={styles.seriesTick}>{d.day % 2 === 1 ? d.day : ''}</span>
        </div>
      ))}
    </div>
  );
}

function SeriesChart({ series }: { series: AnalyticsSeriesPoint[] }) {
  const max = Math.max(
    1,
    ...series.map((p) => Math.max(p.problemomer, p.calculator, p.pdf, p.logins)),
  );
  const showEvery = series.length > 14 ? Math.ceil(series.length / 10) : 1;

  return (
    <div className={styles.seriesWrap}>
      <div className={styles.seriesLegend}>
        <span className={styles.legPm}>PM</span>
        <span className={styles.legCalc}>Кальк.</span>
        <span className={styles.legPdf}>PDF</span>
        <span className={styles.legLogin}>Входы</span>
      </div>
      <div className={styles.seriesChart} role="img" aria-label="Динамика по дням">
        {series.map((p, i) => (
          <div key={p.day} className={styles.seriesDay}>
            <div className={styles.seriesBars}>
              <div
                className={`${styles.seriesBar} ${styles.barPm}`}
                style={{ height: `${(p.problemomer / max) * 100}%` }}
                title={`PM: ${p.problemomer}`}
              />
              <div
                className={`${styles.seriesBar} ${styles.barCalc}`}
                style={{ height: `${(p.calculator / max) * 100}%` }}
                title={`Кальк.: ${p.calculator}`}
              />
              <div
                className={`${styles.seriesBar} ${styles.barPdf}`}
                style={{ height: `${(p.pdf / max) * 100}%` }}
                title={`PDF: ${p.pdf}`}
              />
              <div
                className={`${styles.seriesBar} ${styles.barLogin}`}
                style={{ height: `${(p.logins / max) * 100}%` }}
                title={`Входы: ${p.logins}`}
              />
            </div>
            {i % showEvery === 0 || i === series.length - 1 ? (
              <span className={styles.seriesTick}>{formatDay(p.day)}</span>
            ) : (
              <span className={styles.seriesTick} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function BreakdownList({
  title,
  items,
  kind,
}: {
  title: string;
  items: AnalyticsBreakdownItem[];
  kind: 'room' | 'house' | 'stage' | 'mode' | 'comfort' | 'raw';
}) {
  return (
    <div className={styles.breakdownBlock}>
      <h4 className={styles.funnelTitle}>{title}</h4>
      {!items.length ? (
        <p className={styles.lead}>Нет данных</p>
      ) : (
        <ul className={styles.breakdownList}>
          {items.slice(0, kind === 'comfort' ? 16 : 8).map((item) => (
            <li key={item.key}>
              <div className={styles.breakdownMeta}>
                <span>{labelKey(item.key, kind)}</span>
                <span>
                  {item.count} · {item.share}%
                </span>
              </div>
              <div className={styles.breakdownTrack}>
                <div
                  className={styles.breakdownFill}
                  style={{ width: `${Math.min(100, item.share)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function funnelStepsPm(f: AnalyticsFunnel) {
  return [
    { label: 'Открыл', value: f.problemomer.open },
    { label: 'Расчёт', value: f.problemomer.result },
    { label: 'PDF', value: f.problemomer.pdf },
    { label: 'Поделился', value: f.problemomer.share },
  ];
}

function funnelStepsCalc(f: AnalyticsFunnel) {
  return [
    { label: 'Открыл', value: f.calculator.open },
    { label: 'Расчёт', value: f.calculator.calcDone },
    { label: 'PDF', value: f.calculator.pdf },
  ];
}

type AnalyticsTab = 'overview' | 'portrait' | 'companies' | 'team' | 'objects';

export function AnalyticsDashboard({ mode }: { mode: 'admin' | 'partner' }) {
  const api = usePartner();
  const user = api.user!;
  const period = useSyncExternalStore(subscribeAnalyticsPeriod, getAnalyticsPeriod, getAnalyticsPeriod);
  const focusOrg = useSyncExternalStore(subscribeAnalyticsFocusOrg, getAnalyticsFocusOrg, getAnalyticsFocusOrg);
  const fromYmd = period.fromYmd;
  const toYmd = period.toYmd;
  const [section, setSection] = useState<AnalyticsTab>('overview');
  const [data, setData] = useState<DashData | null>(null);
  const [loading, setLoading] = useState(true);

  const partnersList = useMemo(
    () => (mode === 'admin' ? api.adminListPartners() : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode, api, data],
  );

  useEffect(() => {
    if (mode !== 'admin' && section === 'companies') setSection('overview');
  }, [mode, section]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const { from, to } = rangeFromYmd(fromYmd, toYmd);
    const orgId = mode === 'partner' ? user.orgId : focusOrg || null;
    void fetchAnalyticsDashboard({
      mode,
      from,
      to,
      orgId,
      partnerLogin: user.login,
      journal: section === 'objects',
    }).then((dash) => {
      if (!cancelled) {
        setData(dash);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [mode, fromYmd, toYmd, focusOrg, user.orgId, user.login, section]);

  const inactivePartners = useMemo(() => {
    if (mode !== 'admin' || !data) return [];
    const activeIds = new Set(
      data.partners.map((p) => p.orgId).filter((id): id is string => Boolean(id)),
    );
    const activeNames = new Set(data.partners.map((p) => p.companyName));
    return partnersList.filter((p) => {
      const orgId = p.user.orgId || '';
      const name = p.org?.settings.companyName || p.user.displayName;
      if (orgId && activeIds.has(orgId)) return false;
      if (activeNames.has(name)) return false;
      return true;
    });
  }, [mode, data, partnersList]);

  if (loading && !data) {
    return (
      <div className={`${styles.card} ${styles.dashCard}`} aria-busy="true">
        <h2>{mode === 'admin' ? 'Аналитика' : 'Аналитика команды'}</h2>
        <Skeleton kind="rows" count={1} label="Загрузка фильтров аналитики"/>
        <div className={styles.kpiRow}>{Array.from({length:mode==='admin'?9:8},(_,i)=><Skeleton key={i} kind="cards" count={1} label="Загрузка показателя"/>)}</div>
        <div className={styles.funnelGrid}><Skeleton kind="chart" count={1}/><Skeleton kind="chart" count={1}/></div>
        <Skeleton kind="chart" count={1} label="Загрузка графика"/>
      </div>
    );
  }

  const dash = data!;
  const showDelta = Boolean(dash.kpiPrev);
  const prev: AnalyticsKpi | null = dash.kpiPrev;

  const sectionTabs: Array<{ id: AnalyticsTab; label: string }> = [
    { id: 'overview', label: 'Сводка' },
    { id: 'portrait', label: 'Объекты' },
    ...(mode === 'admin' ? [{ id: 'companies' as const, label: 'Компании' }] : []),
    { id: 'team', label: mode === 'admin' ? 'Сотрудники сети' : 'Сотрудники' },
    { id: 'objects', label: 'Журнал' },
  ];

  return (
    <div className={`${styles.card} ${styles.dashCard}`}>
      <div className={styles.dashHead}>
        <div>
          <h2>{mode === 'admin' ? 'Аналитика' : 'Аналитика команды'}</h2>
          <p className={styles.lead}>
            {dash.source === 'api'
              ? 'Данные с сервера'
              : 'Только этот браузер (API недоступен)'}
            {` · ${formatPeriodLabel(fromYmd, toYmd)}`}
          </p>
        </div>
        {/* Единственный выбор периода: общий для всей аналитики (и админа, и партнёра). */}
        <div className={styles.dashFilters} role="group" aria-label="Период аналитики">
          <PeriodCalendar
            fromYmd={fromYmd}
            toYmd={toYmd}
            onChange={(from, to) => setAnalyticsPeriod(from, to)}
            triggerClassName={styles.dashPeriodTrigger}
          />
        </div>
      </div>

      {mode === 'admin' ? (
        <label className={styles.field}>
          Партнёр
          <select value={focusOrg} onChange={(e) => setAnalyticsFocusOrg(e.target.value)}>
            <option value="">Все</option>
            {partnersList.map((p) => (
              <option key={p.user.id} value={p.user.orgId || ''}>
                {p.org?.settings.companyName || p.user.displayName}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <div className={styles.tabs} role="tablist" aria-label="Разделы аналитики">
        {sectionTabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={section === t.id}
            className={section === t.id ? styles.tabActive : styles.tab}
            onClick={() => setSection(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {section === 'overview' ? (
        <div className={styles.dashSection}>
          <FadeRise className={styles.kpiRow}>
            {mode === 'admin' ? (
              <KpiCard
                label="Активные компании"
                value={dash.kpi.activePartners}
                prev={prev?.activePartners}
                showDelta={showDelta}
              />
            ) : null}
            <KpiCard
              label="Сотрудники"
              value={dash.kpi.executors}
              prev={prev?.executors}
              showDelta={showDelta}
            />
            <KpiCard
              label="Проблемомер"
              value={dash.kpi.problemomerResults}
              prev={prev?.problemomerResults}
              showDelta={showDelta}
            />
            <KpiCard
              label="Калькулятор"
              value={dash.kpi.calculatorDone}
              prev={prev?.calculatorDone}
              showDelta={showDelta}
            />
            <KpiCard label="PDF" value={dash.kpi.pdf} prev={prev?.pdf} showDelta={showDelta} />
            <KpiCard
              label="Отправки"
              value={dash.kpi.shares}
              prev={prev?.shares}
              showDelta={showDelta}
            />
            <KpiCard
              label="Входы"
              value={dash.kpi.logins}
              prev={prev?.logins}
              showDelta={showDelta}
            />
            <KpiCard
              label="Площадь, м²"
              value={dash.kpi.areaM2}
              prev={prev?.areaM2}
              showDelta={showDelta}
            />
            <KpiCard
              label="Панели"
              value={dash.kpi.panels}
              prev={prev?.panels}
              showDelta={showDelta}
            />
          </FadeRise>

          <h3 className={styles.dashSub}>Воронка</h3>
          <div className={styles.funnelGrid}>
            <FunnelBlock title="Проблемомер" steps={funnelStepsPm(dash.funnel)} />
            <FunnelBlock title="Калькулятор" steps={funnelStepsCalc(dash.funnel)} />
          </div>

          <h3 className={styles.dashSub}>Динамика</h3>
          {dash.series.length ? (
            <SeriesChart series={dash.series} />
          ) : (
            <p className={styles.lead}>Пока нет точек для графика</p>
          )}

          <h3 className={styles.dashSub}>По месяцам</h3>
          <MonthSlice rows={slicesFromSeries(dash.series).months} />
          <h3 className={styles.dashSub}>По дням месяца</h3>
          <DaySlice days={slicesFromSeries(dash.series).days} />

          <h3 className={styles.dashSub}>Объём</h3>
          <div className={styles.volumeRow}>
            <div className={styles.volumeItem}>
              <span className={styles.kpiLabel}>Сумма м²</span>
              <strong>{formatNum(dash.volume.areaM2Sum)}</strong>
            </div>
            <div className={styles.volumeItem}>
              <span className={styles.kpiLabel}>Средняя м²</span>
              <strong>{formatNum(dash.volume.areaM2Avg)}</strong>
            </div>
            <div className={styles.volumeItem}>
              <span className={styles.kpiLabel}>Панели</span>
              <strong>{formatNum(dash.volume.panelsSum)}</strong>
            </div>
            <div className={styles.volumeItem}>
              <span className={styles.kpiLabel}>Готовых расчётов</span>
              <strong>{formatNum(dash.volume.completedCount)}</strong>
            </div>
          </div>
        </div>
      ) : null}

      {section === 'portrait' ? (
        <div className={styles.dashSection}>
          <div className={styles.breakdownGrid}>
            <BreakdownList title="Тип комнаты" items={dash.breakdowns.roomType} kind="room" />
            <BreakdownList title="Тип дома" items={dash.breakdowns.houseType} kind="house" />
            <BreakdownList
              title="Стадия объекта"
              items={dash.breakdowns.objectStage}
              kind="stage"
            />
            <BreakdownList
              title="Класс комфорта"
              items={[...dash.breakdowns.classTransition].sort(
                (a, b) => comfortTransitionRank(a.key) - comfortTransitionRank(b.key) || b.count - a.count,
              )}
              kind="comfort"
            />
            <BreakdownList
              title="Режим калькулятора"
              items={dash.breakdowns.calcMode}
              kind="mode"
            />
            <BreakdownList
              title="Город / регион"
              items={dash.breakdowns.city || []}
              kind="raw"
            />
          </div>
        </div>
      ) : null}

      {section === 'companies' && mode === 'admin' ? (
        <div className={styles.dashSection}>
          <div className={styles.dashTableScroll}>
            <table className={styles.dashTable}>
              <thead>
                <tr>
                  <th>Компания</th>
                  <th>Город</th>
                  <th>Входы</th>
                  <th>PM</th>
                  <th>Кальк.</th>
                  <th>PDF</th>
                  <th>Шаринг</th>
                  <th>м²</th>
                  <th>Пан.</th>
                  <th>Активность</th>
                </tr>
              </thead>
              <tbody>
                {dash.partners.map((p) => (
                  <tr key={p.orgId || p.companyName}>
                    <td data-label="Компания">{p.companyName}</td>
                    <td data-label="Город">{p.city || '—'}</td>
                    <td data-label="Входы">{p.logins}</td>
                    <td data-label="PM">{p.problemomer}</td>
                    <td data-label="Кальк.">{p.calculator}</td>
                    <td data-label="PDF">{p.pdf}</td>
                    <td data-label="Шаринг">{p.shares}</td>
                    <td data-label="м²">{formatNum(p.areaM2)}</td>
                    <td data-label="Пан.">{formatNum(p.panels)}</td>
                    <td data-label="Активность">{formatWhen(p.lastActiveAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!dash.partners.length ? <p className={styles.lead}>Пока нет данных</p> : null}

          {inactivePartners.length ? (
            <>
              <h3 className={styles.dashSub}>Без активности за период</h3>
              <ul className={styles.inactiveList}>
                {inactivePartners.map((p) => (
                  <li key={p.user.id}>
                    {p.org?.settings.companyName || p.user.displayName}
                    <span className={styles.hint}> · {p.user.login}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}

      {section === 'team' ? (
        <div className={styles.dashSection}>
          <div className={styles.table}>
            {dash.executors.map((ex) => (
              <div key={ex.userId || ex.login} className={styles.tableRow}>
                <div>
                  <strong>{ex.displayName}</strong>
                  <div className={styles.hint}>
                    {ex.login} · входы {ex.logins} · расчёты PM {ex.problemomer} · расчёты кальк.{' '}
                    {ex.calculator} · PDF {ex.pdf} · объекты {ex.results}
                  </div>
                </div>
                <span className={styles.hint}>{formatWhen(ex.lastActiveAt)}</span>
              </div>
            ))}
            {!dash.executors.length ? (
              <p className={styles.lead}>Пока нет активности сотрудников</p>
            ) : null}
          </div>
        </div>
      ) : null}

      {section === 'objects' ? (
        <div className={styles.dashSection}>
          <JournalDownload
            mode={mode}
            fromYmd={fromYmd}
            toYmd={toYmd}
            orgId={mode === 'partner' ? user.orgId : focusOrg || null}
          />
          {loading ? (
            <Skeleton kind="rows" count={6} label="Загрузка журнала"/>
          ) : dash.recentObjects.length ? (
            <div className={styles.dashTableScroll}>
              <table className={styles.dashTable}>
                <thead>
                  <tr>
                    <th>Дата</th>
                    <th>Компания</th>
                    <th>Логин</th>
                    <th>Инструмент</th>
                    <th>Комната</th>
                    <th>м²</th>
                    <th>Класс</th>
                    <th>Пан.</th>
                  </tr>
                </thead>
                <tbody>
                  {dash.recentObjects.map((ev) => {
                    const o = ev.object;
                    const room =
                      o?.label ||
                      (typeof o?.roomTypeCustom === 'string' && o.roomTypeCustom.trim()
                        ? o.roomTypeCustom.trim()
                        : null) ||
                      (o?.roomType
                        ? ROOM_TYPE_LABELS[o.roomType as RoomType] || o.roomType
                        : '—');
                    const cls = comfortTransitionLabel(o?.classBefore, o?.classAfter) || '—';
                    return (
                      <tr key={ev.id}>
                        <td data-label="Дата">{formatWhen(ev.at)}</td>
                        <td data-label="Компания">{ev.companyName || '—'}</td>
                        <td data-label="Логин">{ev.login}</td>
                        <td data-label="Инструмент">
                          {toolLabel(ev.tool)} · {actionLabel(ev.action)}
                        </td>
                        <td data-label="Комната">{room}</td>
                        <td data-label="м²">{o?.areaM2 != null ? formatNum(Number(o.areaM2)) : '—'}</td>
                        <td data-label="Класс">{cls}</td>
                        <td data-label="Пан.">{o?.panels != null ? formatNum(Number(o.panels)) : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className={styles.lead}>Нет записей за выбранный фильтр</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
