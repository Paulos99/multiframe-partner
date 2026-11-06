import { useRef } from 'react';
import type { JourneyStep } from '../../../../packages/shared/clientJourney';
import { useGrow, useStaggerIn } from '../ui/gsapMotion';
import styles from './partner.module.css';

function formatCount(count: number | null): string {
  if (count == null) return 'нет данных';
  return String(count);
}

/** Одна воронка пути клиента: у шага процент и число; «нет данных» без выдуманных цифр. */
export function JourneyFunnel({
  title,
  steps,
  hint,
}: {
  title: string;
  steps: JourneyStep[];
  hint?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const key = steps.map((step) => `${step.id}:${step.count}`).join('|');
  useStaggerIn(ref, 'li', key, { y: 8, stagger: 0.04, duration: 0.35 });
  useGrow(ref, `.${styles.funnelBarFill}`, 'x', key, { stagger: 0.04, duration: 0.55, delay: 0.08, max: 0.5 });

  const numeric = steps.map((step) => (typeof step.count === 'number' ? step.count : 0));
  const max = Math.max(1, ...numeric);

  return (
    <div className={styles.funnelBlock} ref={ref} data-journey-funnel>
      <h4 className={styles.funnelTitle}>{title}</h4>
      {hint ? <p className={styles.hint}>{hint}</p> : null}
      <ol className={styles.funnelSteps}>
        {steps.map((step, index) => {
          const width =
            step.count == null ? 0 : Math.max(4, Math.round((step.count / max) * 100));
          return (
            <li key={step.id}>
              <span className={styles.funnelLabel}>
                {index + 1}. {step.label}
              </span>
              <span className={styles.funnelPct}>{step.fromPrevPct}</span>
              <span className={styles.funnelCount}>{formatCount(step.count)}</span>
              <span className={styles.funnelBar} aria-hidden="true">
                <span className={styles.funnelBarFill} style={{ width: `${width}%` }} />
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function KpiPctCard({ label, pct }: { label: string; pct: number | null }) {
  return (
    <div className={styles.kpi} data-kpi-pct={label}>
      <span className={styles.kpiLabel}>{label}</span>
      <strong>{pct == null ? '—' : `${pct}%`}</strong>
      <span className={styles.kpiDelta} aria-hidden>
        {'\u00a0'}
      </span>
    </div>
  );
}
