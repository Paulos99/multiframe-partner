import { Skeleton } from './Skeleton';
import { useEffect, useId, useMemo, useState, useSyncExternalStore } from 'react';
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
import { comfortTransitionLabel, comfortTransitionRank, mergeComfortTransitions } from '../state/simulation';
import { funnelStopCounts, funnelStopPercents } from '../../../../packages/shared/funnel';
import type { DrillPeriod } from '../../../../packages/shared/staffDrill.js';
import { goAnalytics, useAnalyticsRoute } from './analyticsRoute';
import {
  applyDashboardProbe,
  composeCabinetAnalytics,
  loadSharedAnalyticsEvents,
  probeAnalyticsDashboard,
  roomsForCabinet,
  shownTileNumbers,
  type AnalyticsTileModel,
  formatPeriodLabel,
  getAnalyticsFocusOrg,
  getAnalyticsPeriod,
  monthLabel,
  presetRange,
  rangeFromYmd,
  setAnalyticsFocusOrg,
  setAnalyticsPeriod,
  subscribeAnalyticsFocusOrg,
  subscribeAnalyticsPeriod,
} from './analytics';
import { isDemoModeEnabled } from './demoMode';
import { calcModeLabel } from './calcModeLabel';
import { JournalDownload } from './JournalDownload';
import { spansMoreThanTwoMonths } from './periodSpan';
import { FadeRise } from './motionBits';
import { PeriodCalendar } from './PeriodCalendar';
import { usePartner } from './PartnerContext';
import { StaffDrillDrawer } from './StaffDrillDrawer';
import { refusalStats } from '../../../../packages/shared/refusal.js';
import { TrainingCompanyPage, TrainingTab, TrainingUserPage } from './TrainingAnalytics';
import { normalizeRole } from '../../../../packages/shared/partner';
import styles from './partner.module.css';
import { FunnelIcon } from '../icons';

const HOUSE_LABELS = Object.fromEntries(
  HOUSE_TYPE_OPTIONS.map((o) => [o.id, o.label]),
) as Record<HouseTypeOption, string>;

const STAGE_LABELS = Object.fromEntries(
  OBJECT_STAGE_OPTIONS.map((o) => [o.id, o.label]),
) as Record<ObjectStageOption, string>;

function formatWhen(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('ru-RU');
  } catch {
    return iso;
  }
}

function formatDay(day: string): string {
  const parts = day.split('-');
  if (parts.length === 2) {
    const [y, m] = parts;
    return y && m ? `${m}.${y.slice(-2)}` : day;
  }
  const [, m, d] = parts;
  return m && d ? `${d}.${m}` : day;
}

function seriesByMonth(series: AnalyticsSeriesPoint[]): AnalyticsSeriesPoint[] {
  const map = new Map<string, AnalyticsSeriesPoint>();
  for (const point of series) {
    const key = point.day.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(key)) continue;
    const row = map.get(key) || { day: key, problemomer: 0, calculator: 0, pdf: 0, logins: 0 };
    row.problemomer += point.problemomer;
    row.calculator += point.calculator;
    row.pdf += point.pdf;
    row.logins += point.logins;
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => (a.day < b.day ? -1 : 1));
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
    return calcModeLabel(key);
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

const DELTA_HINT = 'к предыдущему периоду';

function KpiCard({
  label,
  value,
  prev,
  showDelta,
  pressed,
  onSelect,
}: {
  label: string;
  value: number;
  prev?: number | null;
  showDelta: boolean;
  pressed: boolean;
  onSelect?: () => void;
}) {
  const delta = showDelta ? deltaText(value, prev) : null;
  const tipId = useId();
  // Подсказка показывается при наведении, фокусе и касании; на телефоне гаснет сама.
  const [tapped, setTapped] = useState(false);
  useEffect(() => {
    if (!tapped) return undefined;
    const timer = window.setTimeout(() => setTapped(false), 3000);
    return () => window.clearTimeout(timer);
  }, [tapped]);
  const deltaNode =
    delta != null ? (
      <span
        className={`${styles.kpiDelta} ${deltaClass(value, prev)} ${tapped ? styles.kpiDeltaOpen : ''}`}
        title={DELTA_HINT}
        aria-describedby={tipId}
        data-testid="kpi-delta"
        onClick={(event) => {
          // Касание числа только показывает подсказку; переход по карточке — касание вне числа.
          event.stopPropagation();
          setTapped(true);
        }}
        {...(onSelect ? {} : { tabIndex: 0, onFocus: () => setTapped(true), onBlur: () => setTapped(false) })}
      >
        {delta}
        <span id={tipId} role="tooltip" className={styles.kpiTip}>
          {DELTA_HINT}
        </span>
      </span>
    ) : (
      <span className={styles.kpiDelta} aria-hidden>
        {'\u00a0'}
      </span>
    );
  if (!onSelect) {
    return (
      <div className={styles.kpi}>
        <span className={styles.kpiLabel}>{label}</span>
        <strong>{formatNum(value)}</strong>
        {deltaNode}
      </div>
    );
  }
  return (
    <button
      type="button"
      className={styles.kpi}
      aria-pressed={pressed}
      onClick={onSelect}
      onBlur={() => setTapped(false)}
    >
      <span className={styles.kpiLabel}>{label}</span>
      <strong>{formatNum(value)}</strong>
      {deltaNode}
    </button>
  );
}

function FunnelBlock({
  title,
  steps,
}: {
  title: string;
  steps: Array<{ label: string; value: number }>;
}) {
  const reached = steps.map((step) => step.value);
  const stopped = funnelStopCounts(reached);
  const percents = funnelStopPercents(reached);
  const opened = stopped.reduce((sum, value) => sum + value, 0);
  return (
    <div className={styles.funnelBlock}>
      <h4 className={styles.funnelTitle}>
        <FunnelIcon size={16} style={{ marginRight: 6, verticalAlign: '-2px' }} />
        {title}
        <span
          className={styles.funnelLabel}
          style={{ display: 'block', marginTop: 4, fontSize: '0.75rem', fontWeight: 650 }}
        >
          Открыли: {opened} · где остановились, в сумме 100%
        </span>
      </h4>
      <ol className={styles.funnelSteps}>
        {steps.map((step, index) => (
          <li key={step.label}>
            <span className={styles.funnelLabel}>{step.label}</span>
            <strong title="Остановились на этом этапе">{stopped[index]}</strong>
            <span className={styles.funnelPct}>{percents[index]}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

type SliceRow = { label: string; total: number };

function monthsFromSeries(series: AnalyticsSeriesPoint[]): SliceRow[] {
  const months = new Map<string, number>();
  for (const p of series) {
    const [y, m, d] = p.day.split('-');
    if (!y || !m || !d) continue;
    const key = `${y}-${m}`;
    months.set(key, (months.get(key) || 0) + p.problemomer + p.calculator + p.pdf + p.logins);
  }
  return [...months.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([key, total]) => ({ label: monthLabel(key), total }));
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

function SeriesChart({ series, title = 'Динамика по дням' }: { series: AnalyticsSeriesPoint[]; title?: string }) {
  const max = Math.max(
    1,
    ...series.map((p) => Math.max(p.problemomer, p.calculator, p.pdf, p.logins)),
  );
  const showEvery = series.length > 14 ? Math.ceil(series.length / 10) : 1;

  return (
    <div className={styles.seriesWrap}>
      <div className={styles.seriesLegend}>
        <span className={styles.legPm}>Проблемомер</span>
        <span className={styles.legCalc}>Калькулятор</span>
        <span className={styles.legPdf}>PDF</span>
        <span className={styles.legLogin}>Входы</span>
      </div>
      <div className={styles.seriesChart} role="img" aria-label={title}>
        {series.map((p, i) => (
          <div key={p.day} className={styles.seriesDay}>
            <div className={styles.seriesBars}>
              <div
                className={`${styles.seriesBar} ${styles.barPm}`}
                style={{ height: `${(p.problemomer / max) * 100}%` }}
                title={`Проблемомер: ${p.problemomer}`}
              />
              <div
                className={`${styles.seriesBar} ${styles.barCalc}`}
                style={{ height: `${(p.calculator / max) * 100}%` }}
                title={`Калькулятор: ${p.calculator}`}
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

function funnelStepsPm(f: AnalyticsFunnel) {
  return [
    { label: 'Только открыл', value: f.problemomer.open },
    { label: 'Посчитал, без PDF', value: f.problemomer.result },
    { label: 'Скачал PDF, не поделился', value: f.problemomer.pdf },
    { label: 'Поделился', value: f.problemomer.share },
  ];
}

function funnelStepsCalc(f: AnalyticsFunnel) {
  return [
    { label: 'Только открыл', value: f.calculator.open },
    { label: 'Посчитал, без PDF', value: f.calculator.calcDone },
    { label: 'Скачал PDF', value: f.calculator.pdf },
  ];
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

type AnalyticsTab = 'overview' | 'portrait' | 'companies' | 'team' | 'training' | 'objects';

const DRILL_METRICS = new Set(['staff', 'problemomer', 'calculator', 'pdf', 'area', 'panels', 'avg', 'done']);

export function AnalyticsDashboard({
  mode,
  onOpenRoom,
}: {
  mode: 'admin' | 'partner';
  onOpenRoom?: (roomId: string) => void;
}) {
  const api = usePartner();
  const user = api.user!;
  const period = useSyncExternalStore(subscribeAnalyticsPeriod, getAnalyticsPeriod, getAnalyticsPeriod);
  const focusOrg = useSyncExternalStore(subscribeAnalyticsFocusOrg, getAnalyticsFocusOrg, getAnalyticsFocusOrg);
  const fromYmd = period.fromYmd;
  const toYmd = period.toYmd;
  const route = useAnalyticsRoute();
  const [section, setSection] = useState<AnalyticsTab>('overview');
  const panelPeriod = route.page === 'overview' ? null : route.period;
  const [panelData, setPanelData] = useState<{ period: DrillPeriod; dash: DashData } | null>(null);
  const [model, setModel] = useState<AnalyticsTileModel | null>(null);
  const [loading, setLoading] = useState(true);
  const data = model?.dash ?? null;

  const partnersList = useMemo(
    () => (mode === 'admin' ? api.adminListPartners() : []),
    [mode, api, data],
  );

  useEffect(() => {
    if (mode !== 'admin' && section === 'companies') setSection('overview');
  }, [mode, section]);

  // Обучение видят владелец (свою компанию) и администратор (все компании); остальным вкладки нет.
  const canTraining = mode === 'admin' || normalizeRole(user.role) === 'owner';
  const onTrainingPage = route.page === 'training-user' || route.page === 'training-company';
  useEffect(() => {
    if (onTrainingPage) setSection('training');
  }, [onTrainingPage]);
  useEffect(() => {
    if (!canTraining && section === 'training') setSection('overview');
  }, [canTraining, section]);

  const staffKey = api.partnerListStaff().map((member) => member.id).join('|');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const { from, to } = rangeFromYmd(fromYmd, toYmd);
    const orgId = mode === 'partner' ? user.orgId : focusOrg || null;
    const objects = roomsForCabinet(api.objects as unknown as Array<Record<string, unknown>>, orgId);
    const projects = (api.projects || []) as unknown as Array<Record<string, unknown>>;
    const users = api.partnerListStaff();
    void loadSharedAnalyticsEvents(orgId).then(async (events) => {
      const localComposed = composeCabinetAnalytics({
        events,
        objects,
        projects,
        users,
        from,
        to,
        orgId,
        mode,
      });
      const shown = shownTileNumbers(localComposed);
      const local: AnalyticsTileModel = {
        events: events.slice(),
        objects: objects.slice(),
        projects: projects.slice(),
        users: users.slice(),
        kpi: shown,
        source: 'local',
        from,
        to,
        dash: { ...localComposed.dash, kpi: { ...localComposed.dash.kpi, panels: shown.panels, areaM2: shown.areaM2 } },
      };
      const preferLocal = isDemoModeEnabled() || orgId === 'org_demo' || orgId === 'org_demo_spb';
      const probe = await probeAnalyticsDashboard({ mode, orgId, partnerLogin: user.login });
      const next = applyDashboardProbe(local, probe, { preferLocal, orgId, mode });
      if (!cancelled) {
        setModel(next);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [mode, fromYmd, toYmd, focusOrg, user.orgId, user.login, section, api.objects, api.projects, staffKey]);

  useEffect(() => {
    if (!panelPeriod || !model) {
      setPanelData(null);
      return;
    }
    let cancelled = false;
    const bounds = presetRange(panelPeriod);
    const { from, to } = rangeFromYmd(bounds.fromYmd, bounds.toYmd);
    const orgId = mode === 'partner' ? user.orgId : focusOrg || null;
    try {
      const next = composeCabinetAnalytics({
        events: model.events,
        objects: model.objects,
        projects: model.projects,
        users: model.users,
        from,
        to,
        orgId,
        mode,
      }).dash;
      if (!cancelled) setPanelData({ period: panelPeriod, dash: next });
    } catch {
      if (!cancelled) setPanelData(null);
    }
    return () => {
      cancelled = true;
    };
  }, [panelPeriod, mode, user.orgId, focusOrg, model]);

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

  if (onTrainingPage && canTraining) {
    return (
      <div className={`${styles.card} ${styles.dashCard}`}>
        {route.page === 'training-user' && route.userId ? <TrainingUserPage userId={route.userId} /> : null}
        {route.page === 'training-company' && route.orgId && mode === 'admin' ? (
          <TrainingCompanyPage orgId={route.orgId} />
        ) : null}
      </div>
    );
  }

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
  const refusals = (() => {
    const range = rangeFromYmd(fromYmd, toYmd);
    const stats = refusalStats((model?.objects || []) as never, range);
    const items: AnalyticsBreakdownItem[] = stats.byReason.map((row) => ({
      key: row.title,
      count: row.count,
      share: stats.total ? Math.round((row.count / stats.total) * 100) : 0,
    }));
    return { total: stats.total, items };
  })();
  const tilePanels = dash.kpi.panels;
  const tileArea = dash.kpi.areaM2;
  const showDelta = Boolean(dash.kpiPrev);
  const prev: AnalyticsKpi | null = dash.kpiPrev;

  const sectionTabs: Array<{ id: AnalyticsTab; label: string }> = [
    { id: 'overview', label: 'Сводка' },
    { id: 'portrait', label: 'Комнаты' },
    ...(mode === 'admin' ? [{ id: 'companies' as const, label: 'Компании' }] : []),
    { id: 'team', label: mode === 'admin' ? 'Сотрудники сети' : 'Сотрудники' },
    ...(canTraining ? [{ id: 'training' as const, label: 'Обучение' }] : []),
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
              : user.orgId === 'org_demo' || user.orgId === 'org_demo_spb' || focusOrg === 'org_demo' || focusOrg === 'org_demo_spb'
                ? 'Сохранённая история'
                : 'Только этот браузер, сервер недоступен'}
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

      {(route.page === 'rating' || route.page === 'staff') && model ? (
        <StaffDrillDrawer
          metric={route.metric || 'staff'}
          mode={mode}
          orgId={mode === 'partner' ? user.orgId : focusOrg || null}
          from={rangeFromYmd(fromYmd, toYmd).from}
          to={rangeFromYmd(fromYmd, toYmd).to}
          onOpenRoom={onOpenRoom}
          model={model}
          tilePanels={tilePanels}
          tileArea={tileArea}
        >
          {(() => {
            const panelReady = Boolean(panelPeriod && panelData?.period === panelPeriod);
            const view = panelReady && panelData ? panelData.dash : dash;
            const monthlyAxis = panelReady && (panelPeriod === 'quarter' || panelPeriod === 'year');
            const chartTitle = monthlyAxis ? 'Динамика по месяцам' : 'Динамика по дням';
            const chartSeries = monthlyAxis ? seriesByMonth(view.series) : view.series;
            const bounds = panelPeriod ? presetRange(panelPeriod) : { fromYmd, toYmd };
            return (
              <>
                <h3 className={styles.dashSub}>Воронка</h3>
                <div className={styles.funnelGrid}>
                  <FunnelBlock title="Проблемомер" steps={funnelStepsPm(view.funnel)} />
                  <FunnelBlock title="Калькулятор" steps={funnelStepsCalc(view.funnel)} />
                </div>
                <h3 className={styles.dashSub}>{chartTitle}</h3>
                {chartSeries.length ? (
                  <SeriesChart series={chartSeries} title={chartTitle} />
                ) : (
                  <p className={styles.lead}>Пока нет точек для графика</p>
                )}
                {spansMoreThanTwoMonths(bounds.fromYmd, bounds.toYmd, view.series) ? (
                  <>
                    <h3 className={styles.dashSub}>По месяцам</h3>
                    <MonthSlice rows={monthsFromSeries(view.series)} />
                  </>
                ) : null}
              </>
            );
          })()}
        </StaffDrillDrawer>
      ) : null}

      {route.page === 'overview' ? (
      <>
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
          {loading ? (
            <div className={styles.kpiRow} aria-busy="true">
              {Array.from({ length: mode === 'admin' ? 9 : 8 }, (_, index) => (
                <Skeleton key={index} kind="cards" count={1} label="Загрузка показателя" />
              ))}
            </div>
          ) : (
          <FadeRise className={styles.kpiRow}>
            {(
              [
                ...(mode === 'admin'
                  ? [{ id: 'partners', label: 'Активные компании', value: dash.kpi.activePartners, prev: prev?.activePartners, showDelta }]
                  : []),
                { id: 'staff', label: 'Сотрудники', value: dash.kpi.executors, prev: prev?.executors, showDelta },
                { id: 'problemomer', label: 'Проблемомер', value: dash.kpi.problemomerResults, prev: prev?.problemomerResults, showDelta },
                { id: 'calculator', label: 'Калькулятор', value: dash.kpi.calculatorDone, prev: prev?.calculatorDone, showDelta },
                { id: 'pdf', label: 'PDF', value: dash.kpi.pdf, prev: prev?.pdf, showDelta },
                { id: 'area', label: 'Площадь, м²', value: tileArea, prev: prev?.areaM2, showDelta },
                { id: 'panels', label: 'Панели', value: tilePanels, prev: prev?.panels, showDelta },
                { id: 'avg', label: 'Средняя м²', value: dash.volume.areaM2Avg, prev: null, showDelta: false },
                { id: 'done', label: 'Готовых расчётов', value: dash.volume.completedCount, prev: null, showDelta: false },
              ] as Array<{ id: string; label: string; value: number; prev?: number | null; showDelta: boolean }>
            ).map((tile) => (
              <KpiCard
                key={tile.id}
                label={tile.label}
                value={tile.value}
                prev={tile.prev}
                showDelta={tile.showDelta}
                pressed={false}
                onSelect={
                  DRILL_METRICS.has(tile.id)
                    ? () =>
                        goAnalytics(
                          { page: 'rating', metric: tile.id, role: null, userId: null, period: null },
                          'push',
                        )
                    : undefined
                }
              />
            ))}
          </FadeRise>
          )}
          <p className={styles.hint}>Нажмите показатель — откроются воронка и динамика.</p>
        </div>
      ) : null}

      {section === 'portrait' ? (
        <div className={styles.dashSection}>
          <div className={styles.breakdownGrid}>
            <BreakdownList title="Тип комнаты" items={dash.breakdowns.roomType} kind="room" />
            <BreakdownList title="Тип дома" items={dash.breakdowns.houseType} kind="house" />
            <BreakdownList
              title="Стадия комнаты"
              items={dash.breakdowns.objectStage}
              kind="stage"
            />
            <BreakdownList
              title="Класс комфорта"
              items={mergeComfortTransitions(dash.breakdowns.classTransition).sort(
                (a, b) => comfortTransitionRank(a.key) - comfortTransitionRank(b.key) || b.count - a.count,
              )}
              kind="comfort"
            />
            <BreakdownList
              title="Режим калькулятора"
              items={dash.breakdowns.calcMode}
              kind="mode"
            />
            <div data-refusals>
              <BreakdownList
                title={`Отказы клиентов: ${refusals.total}`}
                items={refusals.items}
                kind="raw"
              />
            </div>
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

      {section === 'training' && canTraining ? <TrainingTab mode={mode} /> : null}

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
      </>
      ) : null}
    </div>
  );
}
