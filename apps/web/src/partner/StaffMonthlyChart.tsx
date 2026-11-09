import { useId, useMemo, useState } from 'react';
import type { StaffMonthlyPoint } from '../../../../packages/shared/staffAnalytics';
import styles from './StaffMonthlyChart.module.css';

export type StaffChartMetric = 'quotes' | 'measures' | 'installs' | 'sum';

const METRICS: Array<{ id: StaffChartMetric; label: string; unit: string }> = [
  { id: 'quotes', label: 'КП', unit: '' },
  { id: 'measures', label: 'Замеры', unit: '' },
  { id: 'installs', label: 'Монтажи', unit: '' },
  { id: 'sum', label: 'Сумма', unit: '₽' },
];

function formatValue(metric: StaffChartMetric, value: number): string {
  if (metric === 'sum') {
    return `${new Intl.NumberFormat('ru-RU').format(Math.round(value))} ₽`;
  }
  return String(value);
}

/** Линейный график помесячных показателей сотрудника. */
export function StaffMonthlyChart({
  series,
  title = 'По месяцам',
}: {
  series: StaffMonthlyPoint[];
  title?: string;
}) {
  const gid = useId();
  const [metric, setMetric] = useState<StaffChartMetric>('quotes');
  const [active, setActive] = useState<number | null>(null);
  const meta = METRICS.find((m) => m.id === metric) || METRICS[0];

  const points = useMemo(() => {
    return series.map((row) => ({
      key: row.key,
      label: row.label,
      value: Number(row[metric]) || 0,
    }));
  }, [series, metric]);

  const width = 640;
  const height = 220;
  const pad = { top: 18, right: 16, bottom: 36, left: 44 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const max = Math.max(1, ...points.map((p) => p.value));

  const coords = points.map((p, i) => {
    const x = pad.left + (points.length <= 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
    const y = pad.top + innerH - (p.value / max) * innerH;
    return { ...p, x, y, i };
  });

  const path = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ');
  const area =
    coords.length > 0
      ? `${path} L${coords[coords.length - 1].x.toFixed(1)} ${(pad.top + innerH).toFixed(1)} L${coords[0].x.toFixed(1)} ${(pad.top + innerH).toFixed(1)} Z`
      : '';

  const tip = active != null ? coords[active] : null;

  if (!series.length) {
    return (
      <div className={styles.wrap} data-staff-monthly-chart>
        <h3 className={styles.title}>{title}</h3>
        <p className={styles.empty}>Пока нет данных по месяцам</p>
      </div>
    );
  }

  return (
    <div className={styles.wrap} data-staff-monthly-chart>
      <div className={styles.head}>
        <h3 className={styles.title}>{title}</h3>
        <div className={styles.metrics} role="tablist" aria-label="Показатель графика">
          {METRICS.map((m) => (
            <button
              key={m.id}
              type="button"
              role="tab"
              aria-selected={metric === m.id}
              className={metric === m.id ? styles.metricActive : styles.metric}
              onClick={() => {
                setMetric(m.id);
                setActive(null);
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.chartBox}>
        <svg
          className={styles.svg}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`${title}: ${meta.label}`}
          onMouseLeave={() => setActive(null)}
        >
          <defs>
            <linearGradient id={`${gid}-fill`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--cab-accent, #1f8a5b)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--cab-accent, #1f8a5b)" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {[0, 0.5, 1].map((t) => {
            const y = pad.top + innerH * (1 - t);
            return (
              <g key={t}>
                <line
                  x1={pad.left}
                  x2={pad.left + innerW}
                  y1={y}
                  y2={y}
                  className={styles.grid}
                />
                <text x={pad.left - 8} y={y + 4} textAnchor="end" className={styles.axis}>
                  {metric === 'sum'
                    ? t === 0
                      ? '0'
                      : `${Math.round((max * t) / 1000)}к`
                    : String(Math.round(max * t))}
                </text>
              </g>
            );
          })}
          {area ? <path d={area} fill={`url(#${gid}-fill)`} className={styles.area} /> : null}
          {path ? <path d={path} className={styles.line} fill="none" /> : null}
          {coords.map((c) => (
            <g key={c.key}>
              <circle
                cx={c.x}
                cy={c.y}
                r={active === c.i ? 6 : 4}
                className={active === c.i ? styles.dotActive : styles.dot}
                onMouseEnter={() => setActive(c.i)}
                onFocus={() => setActive(c.i)}
                onClick={() => setActive((prev) => (prev === c.i ? null : c.i))}
                tabIndex={0}
                role="button"
                aria-label={`${c.label}: ${formatValue(metric, c.value)}`}
              />
              <text x={c.x} y={height - 12} textAnchor="middle" className={styles.tick}>
                {c.label}
              </text>
            </g>
          ))}
        </svg>
        {tip ? (
          <div className={styles.tooltip} role="status">
            <strong>{tip.label}</strong>
            <span>
              {meta.label}: {formatValue(metric, tip.value)}
            </span>
          </div>
        ) : null}
      </div>

      <table className={styles.srTable}>
        <caption>
          {title}: {meta.label}
        </caption>
        <thead>
          <tr>
            <th>Месяц</th>
            <th>{meta.label}</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.key}>
              <td>{p.label}</td>
              <td>{formatValue(metric, p.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
