import { Skeleton } from './Skeleton';
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type {
  AnalyticsBreakdownItem,
  AnalyticsDashboard as DashData,
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
import type { DrillPeriod } from '../../../../packages/shared/staffDrill.js';
import { goAnalytics, OVERVIEW_LOCATION, useAnalyticsRoute } from './analyticsRoute';
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
import pill from '../ui/SlidingPill.module.css';
import { useSlidingPill } from '../ui/useSlidingPill';
import { AnimatedNumber, useGrow, useStaggerIn } from '../ui/gsapMotion';
import { PeriodCalendar } from './PeriodCalendar';
import { PhotoCases } from './photos/PhotoCases';
import { usePartner } from './PartnerContext';
import { StaffDrillDrawer } from './StaffDrillDrawer';
import { closedOutcomeRates, refusalStats } from '../../../../packages/shared/refusal.js';
import { computeClientJourney } from '../../../../packages/shared/clientJourney';
import { TrainingCompanyPage, TrainingTab, TrainingUserPage } from './TrainingAnalytics';
import { ROLE_LABELS, normalizeRole } from '../../../../packages/shared/partner';
import { JourneyFunnel, KpiPctCard } from './JourneyFunnel';
import { StaffPersonalAnalytics } from './StaffPersonalAnalytics';
import { listStaffForOrg } from './localStore';
import { PartnerComparisonTable, PeriodSummaryBlock, usePeriodSummary } from './PeriodSummary';
import { analyticsFiltersKey, analyticsSectionTitle, shouldFlashAnalyticsReload } from './analyticsReload';
import { AnimatePresence, m, usePrefersReducedMotion } from './motionBits';
import styles from './partner.module.css';

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
        <strong>
          <AnimatedNumber value={value} format={formatNum} />
        </strong>
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
      <strong>
          <AnimatedNumber value={value} format={formatNum} />
        </strong>
      {deltaNode}
    </button>
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
  const ref = useRef<HTMLUListElement>(null);
  useGrow(ref, `.${styles.sliceFill}`, 'x', rows.map((r) => r.total).join(','));
  if (!rows.length) return <p className={styles.lead}>Пока нет данных по месяцам</p>;
  return (
    <ul className={styles.sliceList} ref={ref}>
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
  const ref = useRef<HTMLDivElement>(null);
  useGrow(ref, `.${styles.seriesBar}`, 'y', `${series.length}:${series[0]?.day ?? ''}:${max}`, { stagger: 0.01, duration: 0.6, max: 0.35 });

  return (
    <div className={styles.seriesWrap} ref={ref}>
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


function BreakdownList({
  title,
  items,
  kind,
}: {
  title: string;
  items: AnalyticsBreakdownItem[];
  kind: 'room' | 'house' | 'stage' | 'mode' | 'comfort' | 'raw';
}) {
  const ref = useRef<HTMLDivElement>(null);
  useGrow(ref, `.${styles.breakdownFill}`, 'x', items.map((item) => `${item.key}:${item.share}`).join(','), { stagger: 0.04, duration: 0.6, max: 0.3 });
  return (
    <div className={styles.breakdownBlock} ref={ref}>
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

type AnalyticsTab = 'overview' | 'portrait' | 'companies' | 'team' | 'training' | 'photos' | 'objects';

/** Плавная смена заголовка раздела; без анимации при prefers-reduced-motion. */
function AnimatedDashTitle({ title }: { title: string }) {
  const reduce = usePrefersReducedMotion();
  return (
    <div className={styles.dashTitleWrap} data-analytics-title>
      <AnimatePresence mode="wait" initial={false}>
        <m.h2
          key={title}
          className={styles.dashTitle}
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? undefined : { opacity: 0, y: -6 }}
          transition={reduce ? { duration: 0 } : { duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        >
          {title}
        </m.h2>
      </AnimatePresence>
    </div>
  );
}

function KpiRow({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  // Карточки показателей выезжают со ступенькой; после «Загрузка…» (смена периода и фильтров) ряд монтируется заново.
  useStaggerIn(ref, ':scope > *', 'enter', { y: 16, stagger: 0.05, duration: 0.5 });
  return (
    <div className={styles.kpiRow} ref={ref} data-motion-own data-analytics-kpi-row>
      {children}
    </div>
  );
}

/** Раздел аналитики: содержимое мягко проявляется при переключении вкладки. */
function DashSection({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useStaggerIn(ref, ':scope > :not([data-motion-own])', 'enter', { y: 12, stagger: 0.07, duration: 0.45 });
  return (
    <div className={styles.dashSection} ref={ref}>
      {children}
    </div>
  );
}

/** Вкладки разделов: выбранную подсвечивает плавно переезжающая подложка. */
function SectionTabs({
  tabs,
  section,
  onOpen,
}: {
  tabs: ReadonlyArray<{ id: AnalyticsTab; label: string }>;
  section: AnalyticsTab;
  onOpen: (id: AnalyticsTab) => void;
}) {
  const { boxRef, pillRef } = useSlidingPill(section, tabs.map((t) => t.id).join(','));
  return (
    <div className={styles.tabs} role="tablist" aria-label="Разделы аналитики" ref={boxRef}>
      <span ref={pillRef} className={`${pill.pill} ${styles.tabPill}`} aria-hidden="true" />
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={section === t.id}
          className={section === t.id ? styles.tabActive : styles.tab}
          onClick={() => onOpen(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

const NO_ROWS: ReadonlyArray<object> = [];

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
  const focusStaffId = route.page === 'team-user' ? route.userId : null;
  const [overviewPane, setOverviewPane] = useState<'metrics' | 'summary'>(() => {
    if (typeof window === 'undefined') return 'metrics';
    const state = window.history.state;
    const pane = state && typeof state === 'object' ? (state as { mfOverviewPane?: unknown }).mfOverviewPane : null;
    return pane === 'summary' ? 'summary' : 'metrics';
  });
  function openOverviewPane(pane: 'metrics' | 'summary') {
    setOverviewPane(pane);
    if (typeof window === 'undefined') return;
    const prev = window.history.state && typeof window.history.state === 'object' ? window.history.state : {};
    window.history.replaceState({ ...prev, mfOverviewPane: pane }, '', window.location.href);
  }
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

  // «Фото отчёты» — только у админа сети; страница отчёта по комнате открывается отдельным адресом.
  const onPhotoPage = mode === 'admin' && (route.page === 'photos' || route.page === 'photo-case');
  useEffect(() => {
    if (onPhotoPage) setSection('photos');
  }, [onPhotoPage]);
  useEffect(() => {
    if (mode !== 'admin' && section === 'photos') setSection('overview');
  }, [mode, section]);
  useEffect(() => {
    if (mode !== 'admin' && section === 'objects') setSection('overview');
  }, [mode, section]);
  useEffect(() => {
    if (route.page === 'team' || route.page === 'team-user') setSection('team');
  }, [route.page]);
  const sectionTabs: Array<{ id: AnalyticsTab; label: string }> = [
    { id: 'overview', label: 'Обзор' },
    { id: 'portrait', label: 'Комнаты' },
    ...(mode === 'admin' ? [{ id: 'companies' as const, label: 'Компании' }] : []),
    { id: 'team', label: mode === 'admin' ? 'Сотрудники сети' : 'Сотрудники' },
    ...(canTraining ? [{ id: 'training' as const, label: 'Обучение' }] : []),
    ...(mode === 'admin' ? [{ id: 'photos' as const, label: 'Фото отчёты' }] : []),
    // «Журнал» только у админа StP; в «Аналитике команды» вкладку убрали.
    ...(mode === 'admin' ? [{ id: 'objects' as const, label: 'Журнал' }] : []),
  ];
  function openSection(id: AnalyticsTab) {
    if (id === 'photos') {
      if (route.page !== 'photos') goAnalytics({ ...OVERVIEW_LOCATION, page: 'photos' }, 'push');
    } else if (id === 'team') {
      if (route.page !== 'team' && route.page !== 'team-user') {
        goAnalytics({ ...OVERVIEW_LOCATION, page: 'team' }, 'push');
      }
    } else if (id === 'overview') {
      if (route.page !== 'overview') goAnalytics(OVERVIEW_LOCATION, 'push');
    } else if (route.page === 'photos' || route.page === 'photo-case' || route.page === 'team' || route.page === 'team-user') {
      goAnalytics(OVERVIEW_LOCATION, 'replace');
    }
    setSection(id);
  }
  const sectionTabBar = <SectionTabs tabs={sectionTabs} section={section} onOpen={openSection} />;

  const staffKey = api.partnerListStaff().map((member) => member.id).join('|');
  const filtersKey = analyticsFiltersKey({
    mode,
    fromYmd: fromYmd || '',
    toYmd: toYmd || '',
    focusOrg: focusOrg || '',
    orgId: user.orgId || '',
    login: user.login,
  });
  const loadedOnceRef = useRef(false);
  const prevFiltersKeyRef = useRef(filtersKey);
  const rootRef = useRef<HTMLDivElement>(null);
  const minHeightRef = useRef(0);
  const [minHeightPx, setMinHeightPx] = useState(0);
  const prevSectionRef = useRef(section);
  const pageTitle = analyticsSectionTitle(section, mode);
  const showPeriodFilters = section !== 'photos' && section !== 'training';

  useEffect(() => {
    let cancelled = false;
    // Фоновый опрос объектов/проектов (~45 с) меняет api.objects/api.projects.
    // Скелет и анимация появления — только при первом открытии и смене периода/вкладки/фильтра.
    const hard = shouldFlashAnalyticsReload({
      loadedOnce: loadedOnceRef.current,
      prevFiltersKey: prevFiltersKeyRef.current,
      nextFiltersKey: filtersKey,
    });
    prevFiltersKeyRef.current = filtersKey;
    if (hard) setLoading(true);
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
        loadedOnceRef.current = true;
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [filtersKey, mode, fromYmd, toYmd, focusOrg, user.orgId, user.login, api.objects, api.projects, staffKey]);

  // Резерв высоты: короткий раздел (журнал/фото) не схлопывает карточку и не дёргает скроллбар.
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const apply = () => {
      const h = Math.ceil(el.getBoundingClientRect().height);
      if (h > minHeightRef.current) {
        minHeightRef.current = h;
        setMinHeightPx(h);
      }
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, [section, loading, data, pageTitle]);

  // Сохраняем позицию прокрутки окна при смене раздела аналитики.
  useLayoutEffect(() => {
    if (prevSectionRef.current === section) return;
    const y = typeof window !== 'undefined' ? window.scrollY : 0;
    prevSectionRef.current = section;
    if (typeof window !== 'undefined') window.scrollTo(0, y);
  }, [section]);

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

  const summaryOrgs = useMemo(
    () =>
      partnersList
        .filter((p) => Boolean(p.user.orgId))
        .map((p) => ({
          id: p.user.orgId as string,
          name: p.org?.settings.companyName || p.user.displayName,
          city: p.org?.settings.city || '',
        })),
    [partnersList],
  );
  const summaryRange = useMemo(() => rangeFromYmd(fromYmd, toYmd), [fromYmd, toYmd]);
  const periodSummary = usePeriodSummary({
    mode,
    rooms: (model?.objects as ReadonlyArray<object> | undefined) ?? NO_ROWS,
    events: (model?.events as ReadonlyArray<object> | undefined) ?? NO_ROWS,
    users: (model?.users as ReadonlyArray<object> | undefined) ?? NO_ROWS,
    from: summaryRange.from,
    to: summaryRange.to,
    orgId: mode === 'partner' ? user.orgId || null : focusOrg || null,
    orgs: summaryOrgs,
    preferServer: model?.source === 'server',
  });

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

  if (onPhotoPage && route.page === 'photo-case') {
    return <PhotoCases />;
  }

  // Фото отчёты в общем каркасе: early return прыгал по высоте и сбрасывал скролл.
  if (loading && !data && section !== 'photos') {
    return (
      <div
        className={`${styles.card} ${styles.dashCard}`}
        aria-busy="true"
        data-analytics-busy="1"
        ref={rootRef}
        style={minHeightPx ? { minHeight: minHeightPx } : undefined}
      >
        <AnimatedDashTitle title={pageTitle} />
        <Skeleton kind="rows" count={1} label="Загрузка фильтров аналитики"/>
        <div className={styles.kpiRow}>{Array.from({length:mode==='admin'?9:8},(_,i)=><Skeleton key={i} kind="cards" count={1} label="Загрузка показателя"/>)}</div>
        <div className={styles.funnelGrid}><Skeleton kind="chart" count={1}/><Skeleton kind="chart" count={1}/></div>
        <Skeleton kind="chart" count={1} label="Загрузка графика"/>
      </div>
    );
  }

  if (!data && section === 'photos') {
    return (
      <div
        className={`${styles.card} ${styles.dashCard}`}
        data-analytics-busy="0"
        data-analytics-root
        ref={rootRef}
        style={minHeightPx ? { minHeight: minHeightPx } : undefined}
      >
        <div className={styles.dashHead}>
          <div>
            <AnimatedDashTitle title={pageTitle} />
          </div>
        </div>
        {sectionTabBar}
        <div className={styles.dashPane} data-analytics-pane="photos">
          <PhotoCases embedded />
        </div>
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
  const outcomeRates = closedOutcomeRates((model?.objects || []) as never, rangeFromYmd(fromYmd, toYmd));
  const companyJourney = computeClientJourney({
    rooms: (model?.objects || []) as never,
    events: (model?.events || []) as never,
    users: (model?.users || []) as never,
    from: rangeFromYmd(fromYmd, toYmd).from,
    to: rangeFromYmd(fromYmd, toYmd).to,
  });
  const staffPeople = (() => {
    const mapMember = (member: { id: string; displayName?: string; login: string; role: string }) => ({
      id: member.id,
      displayName: member.displayName || member.login,
      login: member.login,
      role: normalizeRole(member.role),
    });
    if (mode === 'admin') {
      const orgIds = focusOrg
        ? [focusOrg]
        : partnersList
            .map((row) => (row.org && 'id' in row.org ? String(row.org.id) : ''))
            .filter(Boolean);
      const seen = new Set<string>();
      const list: Array<{ id: string; displayName: string; login: string; role: ReturnType<typeof normalizeRole> }> = [];
      for (const orgId of orgIds) {
        for (const member of listStaffForOrg(orgId)) {
          if (seen.has(member.id)) continue;
          seen.add(member.id);
          list.push(mapMember(member));
        }
      }
      return list;
    }
    const list = (api.partnerListStaff() || []).map(mapMember);
    // Владелец тоже в списке, если его нет среди staff.
    if (user.role === 'owner' && !list.some((p) => p.id === user.id)) {
      list.unshift({
        id: user.id,
        displayName: user.displayName,
        login: user.login,
        role: 'owner' as const,
      });
    }
    return list;
  })();
  const tilePanels = dash.kpi.panels;
  const tileArea = dash.kpi.areaM2;
  const showDelta = Boolean(dash.kpiPrev);
  const prev: AnalyticsKpi | null = dash.kpiPrev;


  return (
    <div
      className={`${styles.card} ${styles.dashCard}`}
      data-analytics-busy={loading ? '1' : '0'}
      data-analytics-root
      data-analytics-section={section}
      aria-busy={loading || undefined}
      ref={rootRef}
      style={minHeightPx ? { minHeight: minHeightPx } : undefined}
    >
      <div className={styles.dashHead}>
        <div>
          <AnimatedDashTitle title={pageTitle} />
          {showPeriodFilters ? (
            <p className={styles.lead}>
              {dash.source === 'api'
                ? 'Данные с сервера'
                : user.orgId === 'org_demo' || user.orgId === 'org_demo_spb' || focusOrg === 'org_demo' || focusOrg === 'org_demo_spb'
                  ? 'Сохранённая история'
                  : 'Только этот браузер, сервер недоступен'}
              {` · ${formatPeriodLabel(fromYmd, toYmd)}`}
            </p>
          ) : null}
        </div>
        {/* Единственный выбор периода: общий для всей аналитики (и админа, и партнёра). */}
        {showPeriodFilters ? (
          <div className={styles.dashFilters} role="group" aria-label="Период аналитики">
            <PeriodCalendar
              fromYmd={fromYmd}
              toYmd={toYmd}
              onChange={(from, to) => setAnalyticsPeriod(from, to)}
              triggerClassName={styles.dashPeriodTrigger}
            />
          </div>
        ) : null}
      </div>

      {mode === 'admin' && showPeriodFilters && !partnersList.length && !isDemoModeEnabled() ? (
        <p className={styles.hint} role="status" data-testid="analytics-no-partners">
          Пока нет подключённых кабинетов партнёров. Цифры появятся, когда партнёры начнут работать в кабинете.
        </p>
      ) : null}

      {mode === 'admin' && showPeriodFilters && partnersList.length ? (
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
                <h3 className={styles.dashSub}>Путь клиента</h3>
                <JourneyFunnel
                  title="Общая воронка"
                  steps={computeClientJourney({
                    rooms: (model?.objects || []) as never,
                    events: (model?.events || []) as never,
                    users: (model?.users || []) as never,
                    from: rangeFromYmd(bounds.fromYmd, bounds.toYmd).from,
                    to: rangeFromYmd(bounds.fromYmd, bounds.toYmd).to,
                  }).steps}
                />
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

      {route.page === 'overview' || route.page === 'team' || route.page === 'team-user' || route.page === 'photos' ? (
      <>
      {sectionTabBar}

      {section === 'overview' ? (
        <DashSection>
          <div className={styles.overviewPanes} role="tablist" aria-label="Разделы обзора" data-overview-panes>
            <button
              type="button"
              role="tab"
              aria-selected={overviewPane === 'metrics'}
              className={overviewPane === 'metrics' ? styles.overviewPaneActive : styles.overviewPane}
              onClick={() => openOverviewPane('metrics')}
            >
              Показатели
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={overviewPane === 'summary'}
              className={overviewPane === 'summary' ? styles.overviewPaneActive : styles.overviewPane}
              onClick={() => openOverviewPane('summary')}
            >
              Сводка
            </button>
          </div>

          <div hidden={overviewPane !== 'summary'} data-overview-pane="summary">
            {!loading && periodSummary ? (
              <PeriodSummaryBlock
                view={periodSummary}
                periodLabel={formatPeriodLabel(fromYmd, toYmd)}
                mode={mode}
                onOpenPartners={mode === 'admin' ? () => openSection('companies') : undefined}
              />
            ) : loading ? (
              <Skeleton kind="rows" count={4} label="Загрузка сводки" />
            ) : (
              <p className={styles.lead}>Пока нет сводки за период</p>
            )}
          </div>

          <div hidden={overviewPane !== 'metrics'} data-overview-pane="metrics">
            {loading ? (
              <div className={styles.kpiRow} aria-busy="true" data-motion-own>
                {Array.from({ length: mode === 'admin' ? 9 : 8 }, (_, index) => (
                  <Skeleton key={index} kind="cards" count={1} label="Загрузка показателя" />
                ))}
              </div>
            ) : (
            <KpiRow>
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
            </KpiRow>
            )}
            <div className={styles.kpiRow} data-outcome-kpis>
              <KpiPctCard label="Отказы, %" pct={outcomeRates.refusedPct} />
              <KpiPctCard label="Доведено до монтажа, %" pct={outcomeRates.completedPct} />
            </div>
            <JourneyFunnel
              title="Путь клиента"
              steps={companyJourney.steps}
              refusalReasons={companyJourney.refusalReasons}
              hint="Считаем, сколько дошло до каждого этапа за период. Процент — от предыдущего этапа и от начала. «Не дошли…» — сколько выбыло между этапами. Нажмите этап, чтобы увидеть шаги."
            />
            <p className={styles.hint}>Нажмите показатель выше — откроются динамика и детализация.</p>
          </div>
        </DashSection>
      ) : null}

      {section === 'portrait' ? (
        <DashSection>
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
        </DashSection>
      ) : null}

      {section === 'companies' && mode === 'admin' ? (
        <DashSection>
          <h3 className={styles.dashSub}>Сравнение партнёров</h3>
          <p className={styles.hint}>
            {formatPeriodLabel(fromYmd, toYmd)} · стрелки — к прошлому периоду той же длины. «До КП» — доля комнат периода,
            дошедших до КП; «Сумма» — по завершённым комнатам.
          </p>
          <PartnerComparisonTable rows={periodSummary?.partners?.rows ?? []} />
          <h3 className={styles.dashSub}>Работа с инструментами</h3>
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
        </DashSection>
      ) : null}

      {section === 'team' ? (
        <DashSection>
          {focusStaffId ? (
            (() => {
              const person = staffPeople.find((row) => row.id === focusStaffId);
              if (!person) {
                return (
                  <p className={styles.lead}>
                    Сотрудник не найден.{' '}
                    <button
                      type="button"
                      className={styles.ghost}
                      onClick={() => goAnalytics({ ...OVERVIEW_LOCATION, page: 'team' }, 'replace')}
                    >
                      К списку
                    </button>
                  </p>
                );
              }
              return (
                <StaffPersonalAnalytics
                  person={person}
                  rooms={(model?.objects || []) as never}
                  events={(model?.events || []) as never}
                  projects={(model?.projects || []) as never}
                  users={staffPeople}
                  from={rangeFromYmd(fromYmd, toYmd).from}
                  to={rangeFromYmd(fromYmd, toYmd).to}
                  onBack={() => goAnalytics({ ...OVERVIEW_LOCATION, page: 'team' }, 'push')}
                  onBackToOverview={() => {
                    goAnalytics(OVERVIEW_LOCATION, 'push');
                    setSection('overview');
                  }}
                />
              );
            })()
          ) : (
            <>
              <div className={styles.staffNavRow}>
                <button
                  type="button"
                  className={styles.staffBackPrimary}
                  onClick={() => {
                    goAnalytics(OVERVIEW_LOCATION, 'push');
                    setSection('overview');
                  }}
                >
                  ← Общая аналитика
                </button>
              </div>
              <p className={styles.lead}>Нажмите имя — откроется личная аналитика и воронка роли.</p>
              <ul className={styles.staffNameList}>
                {staffPeople.map((person) => (
                  <li key={person.id}>
                    <button
                      type="button"
                      className={styles.staffNameBtn}
                      onClick={() =>
                        goAnalytics({ ...OVERVIEW_LOCATION, page: 'team-user', userId: person.id }, 'push')
                      }
                    >
                      <strong>{person.displayName || person.login}</strong>
                      <span className={styles.hint}>{ROLE_LABELS[person.role] || person.role}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {!staffPeople.length ? <p className={styles.lead}>Пока нет сотрудников</p> : null}
            </>
          )}
        </DashSection>
      ) : null}

      {section === 'training' && canTraining ? <TrainingTab mode={mode} /> : null}

      {section === 'photos' && mode === 'admin' ? (
        <div className={styles.dashPane} data-analytics-pane="photos">
          <DashSection>
            <PhotoCases embedded />
          </DashSection>
        </div>
      ) : null}

      {section === 'objects' ? (
        <div className={styles.dashPane} data-analytics-pane="objects">
        <DashSection>
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
        </DashSection>
        </div>
      ) : null}
      </>
      ) : null}
    </div>
  );
}
