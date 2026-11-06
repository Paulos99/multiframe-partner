import { useMemo, useRef, useState } from 'react';
import type { JourneyStep } from '../../../../packages/shared/clientJourney';
import { groupJourneySteps } from '../../../../packages/shared/clientJourney';
import { useGrow, useStaggerIn } from '../ui/gsapMotion';
import styles from './partner.module.css';

function formatCount(count: number | null): string {
  if (count == null) return 'нет данных';
  return String(count);
}

function StepRow({
  step,
  index,
  max,
  row = false,
}: {
  step: JourneyStep;
  index: number;
  max: number;
  row?: boolean;
}) {
  const width = step.count == null ? 0 : Math.max(4, Math.round((step.count / max) * 100));
  return (
    <li data-funnel-row={row ? '' : undefined}>
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
}

/** Сжатая воронка клиента: 6 групп (клик раскрывает шаги) + отказ. Ролевые — плоский список. */
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
  const { groups, refusal } = useMemo(() => groupJourneySteps(steps), [steps]);
  const compact = groups.some((g) => g.steps.length > 0);
  const [openId, setOpenId] = useState<string | null>(null);
  const key = steps.map((step) => `${step.id}:${step.count}`).join('|') + `|${openId || ''}|${compact ? 'c' : 'f'}`;
  useStaggerIn(ref, '[data-funnel-row]', key, { y: 8, stagger: 0.04, duration: 0.35 });
  useGrow(ref, `.${styles.funnelBarFill}`, 'x', key, { stagger: 0.04, duration: 0.55, delay: 0.08, max: 0.5 });

  if (!compact) {
    const numeric = steps.map((step) => (typeof step.count === 'number' ? step.count : 0));
    const max = Math.max(1, ...numeric);
    return (
      <div className={styles.funnelBlock} ref={ref} data-journey-funnel>
        <h4 className={styles.funnelTitle}>{title}</h4>
        {hint ? <p className={styles.hint}>{hint}</p> : null}
        <ol className={styles.funnelSteps}>
          {steps.map((step, index) => (
            <StepRow key={step.id} step={step} index={index} max={max} row />
          ))}
        </ol>
      </div>
    );
  }

  const numeric = groups.map((g) => (typeof g.count === 'number' ? g.count : 0));
  const max = Math.max(1, ...numeric);

  return (
    <div className={styles.funnelBlock} ref={ref} data-journey-funnel data-funnel-compact>
      <h4 className={styles.funnelTitle}>{title}</h4>
      {hint ? <p className={styles.hint}>{hint}</p> : null}
      <ol className={styles.funnelGroups}>
        {groups.map((group, gi) => {
          const expanded = openId === group.id;
          const width = group.count == null ? 0 : Math.max(4, Math.round((group.count / max) * 100));
          return (
            <li key={group.id} data-funnel-row data-funnel-group={group.id} data-expanded={expanded ? '1' : '0'}>
              <button
                type="button"
                className={styles.funnelGroupBtn}
                aria-expanded={expanded}
                onClick={() => setOpenId(expanded ? null : group.id)}
              >
                <span className={styles.funnelLabel}>
                  {gi + 1}. {group.label}
                </span>
                <span className={styles.funnelPct}>{group.fromPrevPct}</span>
                <span className={styles.funnelCount}>{formatCount(group.count)}</span>
                <span className={styles.funnelBar} aria-hidden="true">
                  <span className={styles.funnelBarFill} style={{ width: `${width}%` }} />
                </span>
                <span className={styles.funnelChevron} aria-hidden="true">
                  {expanded ? '▾' : '▸'}
                </span>
              </button>
              {expanded ? (
                <ol className={styles.funnelSteps} data-funnel-expanded={group.id}>
                  {group.steps.map((step) => {
                    const globalIndex = steps.findIndex((s) => s.id === step.id);
                    return (
                      <StepRow
                        key={step.id}
                        step={step}
                        index={globalIndex >= 0 ? globalIndex : 0}
                        max={max}
                      />
                    );
                  })}
                </ol>
              ) : null}
            </li>
          );
        })}
      </ol>
      {refusal ? (
        <div className={styles.funnelRefusal} data-funnel-refusal>
          <span className={styles.funnelLabel}>{refusal.label}</span>
          <span className={styles.funnelPct}>{refusal.fromPrevPct}</span>
          <span className={styles.funnelCount}>{formatCount(refusal.count)}</span>
          <span className={styles.hint}>доля от всех закрытых за период</span>
        </div>
      ) : null}
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
