import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { SpectrumSeries } from '../state/spectrum';
import { SoundPressureHelpButton } from './SoundPressureHelp';
import styles from './SpectrumChart.module.css';

type IndexBadge = {
  kind: 'Rw' | 'Lnw';
  before: number;
  after: number;
};

export type SpectrumSeriesMode = 'both' | 'before' | 'after';

type Props = {
  title: string;
  subtitle: string;
  series: SpectrumSeries;
  yLabel: string;
  beforeLabel?: string;
  afterLabel?: string;
  /**
   * Chart polarity for lay copy:
   * - up — isolation R/I (higher = quieter)
   * - down — noise level Ln (lower = quieter)
   */
  betterDirection?: 'up' | 'down';
  /** Weighted index shown in the top-right corner (до → после). */
  indexBadge?: IndexBadge;
  /** |Δ| index for «тише %» from the sound-pressure table. */
  reductionDb?: number;
  reductionPct?: number;
  /** Larger plot for desktop dashboard. */
  tall?: boolean;
  /** Show series toggles (wide dashboard). */
  showSeriesToggles?: boolean;
  /** Controlled series visibility (optional). */
  seriesMode?: SpectrumSeriesMode;
  onSeriesModeChange?: (mode: SpectrumSeriesMode) => void;
  /** Shared hover Hz across charts (desktop sync). */
  externalHz?: number | null;
  onHzHover?: (hz: number | null) => void;
};

type HoverPoint = {
  hz: number;
  before: number;
  after: number;
  x: number;
  yBefore: number;
  yAfter: number;
};

type Pt = { x: number; y: number };

function xAt(hz: number, hzMin: number, hzMax: number, x0: number, w: number): number {
  const t =
    (Math.log10(hz) - Math.log10(hzMin)) / Math.max(1e-6, Math.log10(hzMax) - Math.log10(hzMin));
  return x0 + t * w;
}

function yAt(v: number, yMin: number, yMax: number, y0: number, h: number): number {
  const t = (v - yMin) / Math.max(1e-6, yMax - yMin);
  return y0 + h - t * h;
}

function toPoints(
  hz: readonly number[],
  values: number[],
  x0: number,
  y0: number,
  w: number,
  h: number,
  yMin: number,
  yMax: number,
): Pt[] {
  const hzMin = hz[0] ?? 100;
  const hzMax = hz[hz.length - 1] ?? 5000;
  return values.map((v, i) => ({
    x: xAt(hz[i] ?? hzMin, hzMin, hzMax, x0, w),
    y: yAt(v, yMin, yMax, y0, h),
  }));
}

/** Smooth cubic path through points (Catmull-Rom → Bezier). */
function smoothPath(pts: Pt[]): string {
  if (!pts.length) return '';
  if (pts.length === 1) return `M${pts[0]!.x.toFixed(1)},${pts[0]!.y.toFixed(1)}`;
  let d = `M${pts[0]!.x.toFixed(1)},${pts[0]!.y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
}

function areaUnder(pts: Pt[], yBase: number): string {
  if (!pts.length) return '';
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
  return `${smoothPath(pts)} L${last.x.toFixed(1)},${yBase.toFixed(1)} L${first.x.toFixed(1)},${yBase.toFixed(1)} Z`;
}

function gainBand(beforePts: Pt[], afterPts: Pt[]): string {
  if (!beforePts.length || !afterPts.length) return '';
  const beforeRev = [...beforePts].reverse();
  return `M${afterPts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L')} L${beforeRev
    .map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' L')} Z`;
}

function niceRange(min: number, max: number): { yMin: number; yMax: number; ticks: number[] } {
  const lo = Math.floor(min / 10) * 10;
  const hiRaw = Math.ceil(max / 10) * 10;
  const span = Math.max(10, hiRaw - lo);
  const step = span > 40 ? 20 : 10;
  const steps = Math.max(2, Math.ceil((hiRaw - lo) / step));
  const hi = lo + steps * step;
  const ticks = Array.from({ length: steps + 1 }, (_, i) => lo + i * step);
  return { yMin: lo, yMax: hi, ticks };
}

function formatHz(hz: number): string {
  if (hz >= 1000) {
    const k = hz / 1000;
    return Number.isInteger(k) ? `${k}k` : `${k.toFixed(1)}k`;
  }
  return String(Math.round(hz));
}

function sampleAt(
  hzList: readonly number[],
  before: number[],
  after: number[],
  targetHz: number,
): { hz: number; before: number; after: number } {
  const n = hzList.length;
  if (n === 0) return { hz: targetHz, before: 0, after: 0 };
  if (n === 1) return { hz: hzList[0]!, before: before[0]!, after: after[0]! };

  if (targetHz <= hzList[0]!) {
    return { hz: hzList[0]!, before: before[0]!, after: after[0]! };
  }
  if (targetHz >= hzList[n - 1]!) {
    return { hz: hzList[n - 1]!, before: before[n - 1]!, after: after[n - 1]! };
  }

  let i = 0;
  while (i < n - 1 && hzList[i + 1]! < targetHz) i++;
  const h0 = hzList[i]!;
  const h1 = hzList[i + 1]!;
  const t =
    (Math.log10(targetHz) - Math.log10(h0)) / Math.max(1e-6, Math.log10(h1) - Math.log10(h0));
  return {
    hz: targetHz,
    before: before[i]! + t * (before[i + 1]! - before[i]!),
    after: after[i]! + t * (after[i + 1]! - after[i]!),
  };
}

export function SpectrumChart({
  title,
  subtitle,
  series,
  yLabel,
  beforeLabel = 'Сейчас',
  afterLabel = 'С MultiFrame',
  betterDirection = 'up',
  indexBadge,
  reductionDb,
  reductionPct,
  tall = false,
  showSeriesToggles = false,
  seriesMode: seriesModeProp,
  onSeriesModeChange,
  externalHz,
  onHzHover,
}: Props) {
  const padL = tall ? 34 : 28;
  const padR = tall ? 14 : 10;
  const padT = tall ? 14 : 10;
  const padB = tall ? 28 : 22;
  const W = tall ? 640 : 360;
  const H = tall ? 360 : 168;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const yBase = padT + plotH;

  const all = [...series.before, ...series.after];
  const rawMin = Math.min(...all);
  const rawMax = Math.max(...all);
  const { yMin, yMax, ticks: yTicks } = niceRange(rawMin, rawMax);
  const hzMin = series.hz[0] ?? 100;
  const hzMax = series.hz[series.hz.length - 1] ?? 5000;

  const beforePts = toPoints(series.hz, series.before, padL, padT, plotW, plotH, yMin, yMax);
  const afterPts = toPoints(series.hz, series.after, padL, padT, plotW, plotH, yMin, yMax);
  const beforePath = smoothPath(beforePts);
  const afterPath = smoothPath(afterPts);
  const afterFill = areaUnder(afterPts, yBase);
  const band = gainBand(beforePts, afterPts);

  const xLabels = [100, 250, 500, 1000, 2000, 5000];
  const [hover, setHover] = useState<HoverPoint | null>(null);
  const [active, setActive] = useState(false);
  const [localMode, setLocalMode] = useState<SpectrumSeriesMode>('both');
  const mode = seriesModeProp ?? localMode;
  const leaveTimer = useRef<number | null>(null);
  const gradId = useId().replace(/:/g, '');
  const showBefore = mode === 'both' || mode === 'before';
  const showAfter = mode === 'both' || mode === 'after';

  const setMode = (next: SpectrumSeriesMode) => {
    onSeriesModeChange?.(next);
    if (seriesModeProp == null) setLocalMode(next);
  };

  const applyHz = useCallback(
    (targetHz: number, announce: boolean) => {
      const sample = sampleAt(series.hz, series.before, series.after, targetHz);
      const sx = xAt(sample.hz, hzMin, hzMax, padL, plotW);
      setHover({
        hz: sample.hz,
        before: sample.before,
        after: sample.after,
        x: sx,
        yBefore: yAt(sample.before, yMin, yMax, padT, plotH),
        yAfter: yAt(sample.after, yMin, yMax, padT, plotH),
      });
      setActive(true);
      if (announce) onHzHover?.(sample.hz);
    },
    [hzMax, hzMin, onHzHover, padL, plotH, plotW, series.after, series.before, series.hz, yMax, yMin],
  );

  useEffect(() => {
    if (externalHz == null) {
      setActive(false);
      setHover(null);
      return;
    }
    if (leaveTimer.current != null) {
      window.clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
    }
    applyHz(externalHz, false);
  }, [applyHz, externalHz]);

  const onMove = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      if (leaveTimer.current != null) {
        window.clearTimeout(leaveTimer.current);
        leaveTimer.current = null;
      }
      const svg = e.currentTarget;
      const rect = svg.getBoundingClientRect();
      const sx = ((e.clientX - rect.left) / rect.width) * W;
      if (sx < padL || sx > W - padR) {
        setActive(false);
        return;
      }
      const t = (sx - padL) / plotW;
      const logHz = Math.log10(hzMin) + t * (Math.log10(hzMax) - Math.log10(hzMin));
      applyHz(10 ** logHz, true);
    },
    [W, applyHz, hzMax, hzMin, padL, padR, plotW],
  );

  const onLeave = useCallback(() => {
    setActive(false);
    leaveTimer.current = window.setTimeout(() => {
      setHover(null);
      leaveTimer.current = null;
      onHzHover?.(null);
    }, 180);
  }, [onHzHover]);

  const tooltipStyle = useMemo(() => {
    if (!hover) return undefined;
    const leftPct = (hover.x / W) * 100;
    const flip = leftPct > 62;
    return {
      left: `${leftPct}%`,
      transform: flip ? 'translate(-100%, 0)' : 'translate(0, 0)',
      opacity: active ? 1 : 0,
    } as const;
  }, [hover, active]);

  const delta = hover ? hover.after - hover.before : 0;
  const polarityHint =
    betterDirection === 'down'
      ? 'Чем ниже линия, тем тише на этой частоте.'
      : 'Чем выше линия, тем лучше изоляция на этой частоте.';
  const deltaLabel = (() => {
    if (!hover || !(showBefore && showAfter)) return null;
    const abs = Math.abs(delta).toFixed(1);
    if (betterDirection === 'down') {
      if (delta < -0.05) return <>тише на <b>{abs} дБ</b></>;
      if (delta > 0.05) return <>громче на <b>{abs} дБ</b></>;
      return <>без изменений</>;
    }
    if (delta > 0.05) return <>лучше на <b>{abs} дБ</b></>;
    if (delta < -0.05) return <>хуже на <b>{abs} дБ</b></>;
    return <>без изменений</>;
  })();

  return (
    <figure className={`${styles.wrap} ${tall ? styles.wrapTall : ''}`}>
      <figcaption className={styles.captionRow}>
        <div className={styles.captionText}>
          <strong>{title}</strong>
          <span>{subtitle}</span>
        </div>
        <div className={styles.captionRight}>
          {showSeriesToggles ? (
            <div className={styles.seriesToggles} role="group" aria-label="Серии графика">
              {(
                [
                  ['both', 'Обе'],
                  ['before', 'Сейчас'],
                  ['after', 'MultiFrame'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={`${styles.seriesBtn} ${mode === id ? styles.seriesBtnOn : ''}`}
                  aria-pressed={mode === id}
                  onClick={() => setMode(id)}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : null}
          {indexBadge ? (
            <div className={styles.indexBadge} aria-label={`${indexBadge.kind} до и после`}>
              <b>{indexBadge.kind}</b>
              <span>
                ≈ {Math.round(indexBadge.before)}
                <span aria-hidden> → </span>≈ {Math.round(indexBadge.after)}
              </span>
              {reductionPct != null && reductionDb != null && reductionDb > 0 ? (
                <span className={styles.quieterBadge}>
                  ≈ {reductionPct}% тише
                  <SoundPressureHelpButton
                    highlightDb={reductionDb}
                    label={`Таблица снижения для ${indexBadge.kind}`}
                  />
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </figcaption>

      <div className={styles.plot}>
        <svg
          className={styles.svg}
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`${title}: ${beforeLabel} и ${afterLabel}. ${polarityHint} Наведите курсор, чтобы увидеть дБ по частоте.`}
          onPointerMove={onMove}
          onPointerLeave={onLeave}
        >
          <defs>
            <linearGradient id={`afterFill-${gradId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent-color)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--accent-color)" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {yTicks.map((tick) => {
            const y = yAt(tick, yMin, yMax, padT, plotH);
            return (
              <g key={tick}>
                <line x1={padL} x2={W - padR} y1={y} y2={y} className={styles.grid} />
                <text x={padL - 6} y={y + 3} className={styles.tick} textAnchor="end">
                  {tick}
                </text>
              </g>
            );
          })}

          {xLabels.map((hz) => {
            const x = xAt(hz, hzMin, hzMax, padL, plotW);
            return (
              <text key={hz} x={x} y={H - 6} className={styles.tick} textAnchor="middle">
                {formatHz(hz)}
              </text>
            );
          })}

          <text
            x={11}
            y={padT + plotH / 2}
            className={styles.axisLabel}
            transform={`rotate(-90 11 ${padT + plotH / 2})`}
            textAnchor="middle"
          >
            {yLabel}
          </text>

          {showAfter ? (
            <path d={afterFill} className={styles.afterArea} fill={`url(#afterFill-${gradId})`} />
          ) : null}
          {showBefore && showAfter ? <path d={band} className={styles.gain} /> : null}
          {showBefore ? (
            <path d={beforePath} className={styles.before} fill="none" pathLength={1} />
          ) : null}
          {showAfter ? (
            <path d={afterPath} className={styles.after} fill="none" pathLength={1} />
          ) : null}

          {hover ? (
            <g
              className={`${styles.hoverLayer} ${active ? styles.hoverLayerOn : ''}`}
              pointerEvents="none"
            >
              <line
                x1={hover.x}
                x2={hover.x}
                y1={padT}
                y2={padT + plotH}
                className={styles.hoverLine}
              />
              {showBefore ? (
                <circle cx={hover.x} cy={hover.yBefore} r={tall ? 4 : 2.8} className={styles.dotBefore} />
              ) : null}
              {showAfter ? (
                <circle cx={hover.x} cy={hover.yAfter} r={tall ? 4.4 : 3.1} className={styles.dotAfter} />
              ) : null}
            </g>
          ) : null}
        </svg>

        {hover ? (
          <div className={`${styles.tooltip} ${tall ? styles.tooltipDash : ''}`} style={tooltipStyle} role="status">
            <strong>{formatHz(hover.hz)} Гц</strong>
            {showBefore ? (
              <span>
                {beforeLabel}: <b>{hover.before.toFixed(1)} дБ</b>
              </span>
            ) : null}
            {showAfter ? (
              <span>
                {afterLabel}: <b>{hover.after.toFixed(1)} дБ</b>
              </span>
            ) : null}
            {deltaLabel ? <span className={styles.tooltipDelta}>{deltaLabel}</span> : null}
          </div>
        ) : null}
      </div>

      {!showSeriesToggles && !tall ? (
        <ul className={styles.legend}>
          <li>
            <span className={styles.swatchBefore} />
            {beforeLabel}
          </li>
          <li>
            <span className={styles.swatchAfter} />
            {afterLabel}
          </li>
        </ul>
      ) : null}
    </figure>
  );
}
