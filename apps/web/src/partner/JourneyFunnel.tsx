import { memo, useCallback, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { JourneyStep } from '../../../../packages/shared/clientJourney';
import { groupJourneySteps } from '../../../../packages/shared/clientJourney';
import { useGrow, useStaggerIn } from '../ui/gsapMotion';
import styles from './partner.module.css';

function formatCount(count: number | null): string {
  if (count == null) return 'нет данных';
  return String(count);
}

/** Показывать процент только когда он посчитан; «—» и пустоту скрываем. */
function pctLabel(raw: string | undefined | null): string | null {
  if (!raw) return null;
  if (raw === '—' || raw === '-' || raw === 'нет данных') return null;
  return raw;
}

function stageWidthPct(count: number | null, base: number): number {
  if (base <= 0) return 100;
  if (count == null) return 36;
  const ratio = Math.max(0, Math.min(1, count / base));
  // 0 → 34%, первый этап → 100%: ступени читаются и визуально сужаются.
  return Math.round(34 + ratio * 66);
}

function dropBetween(prev: number | null, curr: number | null): string | null {
  if (prev == null || curr == null) return null;
  const lost = prev - curr;
  if (lost <= 0) return null;
  return `−${lost}`;
}

const NestedStep = memo(function NestedStep({
  step,
  base,
}: {
  step: JourneyStep;
  base: number;
}) {
  const width = stageWidthPct(step.count, base);
  const pct = pctLabel(step.fromPrevPct);
  const empty = step.count == null || step.count <= 0;
  return (
    <li className={styles.funnelNestedItem} data-funnel-nested={step.id}>
      <div className={styles.funnelNestedHead}>
        <span className={styles.funnelNestedLabel}>{step.label}</span>
        <span className={styles.funnelNestedNums}>
          <strong className={styles.funnelCountStrong}>{formatCount(step.count)}</strong>
          {pct ? <span className={styles.funnelPctTiny}>{pct}</span> : null}
        </span>
      </div>
      <span
        className={empty ? `${styles.funnelTrack} ${styles.funnelTrackEmpty}` : styles.funnelTrack}
        style={{ '--funnel-w': `${width}%` } as CSSProperties}
        aria-hidden="true"
      >
        <span className={styles.funnelTrackFill} />
      </span>
    </li>
  );
});

const FunnelStage = memo(function FunnelStage({
  id,
  index,
  label,
  count,
  fromPrevPct,
  widthPct,
  expandable,
  expanded,
  onToggle,
  children,
  dropAfter,
}: {
  id: string;
  index: number;
  label: string;
  count: number | null;
  fromPrevPct: string;
  widthPct: number;
  expandable: boolean;
  expanded: boolean;
  onToggle: (id: string) => void;
  children?: ReactNode;
  dropAfter: string | null;
}) {
  const pct = pctLabel(fromPrevPct);
  const empty = count == null || count <= 0;
  const head = (
    <>
      <span className={styles.funnelStageMeta}>
        <span className={styles.funnelStageName}>
          <span className={styles.funnelStageIndex} aria-hidden="true">
            {index + 1}
          </span>
          {label}
        </span>
        <span className={styles.funnelStageNums}>
          <strong className={styles.funnelCountStrong}>{formatCount(count)}</strong>
          {pct ? <span className={styles.funnelPctTiny}>{pct}</span> : null}
        </span>
      </span>
      <span
        className={empty ? `${styles.funnelTrack} ${styles.funnelTrackEmpty}` : styles.funnelTrack}
        aria-hidden="true"
      >
        <span className={styles.funnelTrackFill} />
      </span>
      {expandable ? (
        <span className={styles.funnelChevron} aria-hidden="true">
          <svg viewBox="0 0 12 12" width="12" height="12" focusable="false">
            <path
              d="M3.2 1.6 L8.4 6 L3.2 10.4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      ) : null}
    </>
  );

  return (
    <li
      className={styles.funnelStage}
      data-funnel-stage={id}
      data-funnel-group={expandable ? id : undefined}
      data-funnel-row=""
      data-expanded={expanded ? '1' : '0'}
      data-empty={empty ? '1' : '0'}
      style={{ '--funnel-w': `${widthPct}%` } as CSSProperties}
    >
      {expandable ? (
        <button
          type="button"
          className={styles.funnelStageBtn}
          aria-expanded={expanded}
          aria-label={`${index + 1}. ${label}`}
          onClick={() => onToggle(id)}
        >
          {head}
        </button>
      ) : (
        <div className={styles.funnelStageBtn} data-static="">
          {head}
        </div>
      )}
      {expandable ? (
        <div
          className={styles.funnelExpand}
          data-open={expanded ? '1' : '0'}
          aria-hidden={expanded ? undefined : true}
        >
          <div className={styles.funnelExpandInner}>
            <ol className={styles.funnelNested} data-funnel-expanded={id}>
              {children}
            </ol>
          </div>
        </div>
      ) : null}
      {dropAfter ? (
        <div className={styles.funnelDrop} aria-hidden="true">
          <span className={styles.funnelDropVal}>{dropAfter}</span>
        </div>
      ) : null}
    </li>
  );
});

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

  // Ключ только от данных: раскрытие не перезапускает появление и рост полос.
  const dataKey = useMemo(
    () => steps.map((step) => `${step.id}:${step.count}`).join('|') + (compact ? '|c' : '|f'),
    [steps, compact],
  );
  useStaggerIn(ref, '[data-funnel-stage]', dataKey, { y: 8, stagger: 0.04, duration: 0.35 });
  useGrow(ref, `.${styles.funnelTrackFill}`, 'x', dataKey, {
    stagger: 0.04,
    duration: 0.55,
    delay: 0.08,
    max: 0.5,
  });

  const onToggle = useCallback((id: string) => {
    setOpenId((prev) => (prev === id ? null : id));
  }, []);

  if (!compact) {
    const numeric = steps.map((step) => (typeof step.count === 'number' ? step.count : 0));
    const base = Math.max(1, ...numeric);
    return (
      <div className={styles.funnelBlock} ref={ref} data-journey-funnel>
        <h4 className={styles.funnelTitle}>{title}</h4>
        {hint ? <p className={styles.hint}>{hint}</p> : null}
        <ol className={styles.funnelLadder}>
          {steps.map((step, index) => {
            const next = steps[index + 1];
            const drop = next
              ? dropBetween(
                  typeof step.count === 'number' ? step.count : null,
                  typeof next.count === 'number' ? next.count : null,
                )
              : null;
            return (
              <FunnelStage
                key={step.id}
                id={step.id}
                index={index}
                label={step.label}
                count={step.count}
                fromPrevPct={step.fromPrevPct}
                widthPct={stageWidthPct(step.count, base)}
                expandable={false}
                expanded={false}
                onToggle={onToggle}
                dropAfter={drop}
              />
            );
          })}
        </ol>
      </div>
    );
  }

  const firstNumeric = groups.find((g) => typeof g.count === 'number' && g.count > 0);
  const base = firstNumeric && typeof firstNumeric.count === 'number' ? Math.max(1, firstNumeric.count) : 1;

  return (
    <div className={styles.funnelBlock} ref={ref} data-journey-funnel data-funnel-compact>
      <h4 className={styles.funnelTitle}>{title}</h4>
      {hint ? <p className={styles.hint}>{hint}</p> : null}
      <ol className={styles.funnelLadder}>
        {groups.map((group, gi) => {
          const expanded = openId === group.id;
          const next = groups[gi + 1];
          const drop = next
            ? dropBetween(
                typeof group.count === 'number' ? group.count : null,
                typeof next.count === 'number' ? next.count : null,
              )
            : null;
          return (
            <FunnelStage
              key={group.id}
              id={group.id}
              index={gi}
              label={group.label}
              count={group.count}
              fromPrevPct={group.fromPrevPct}
              widthPct={stageWidthPct(group.count, base)}
              expandable={group.steps.length > 0}
              expanded={expanded}
              onToggle={onToggle}
              dropAfter={drop}
            >
              {group.steps.map((step) => (
                <NestedStep key={step.id} step={step} base={base} />
              ))}
            </FunnelStage>
          );
        })}
      </ol>
      {refusal ? (
        <div className={styles.funnelRefusal} data-funnel-refusal>
          <div className={styles.funnelRefusalMain}>
            <span className={styles.funnelRefusalLabel}>{refusal.label}</span>
            <strong className={styles.funnelCountStrong}>{formatCount(refusal.count)}</strong>
          </div>
          {pctLabel(refusal.fromPrevPct) ? (
            <span className={styles.funnelRefusalPct}>{pctLabel(refusal.fromPrevPct)}</span>
          ) : null}
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
