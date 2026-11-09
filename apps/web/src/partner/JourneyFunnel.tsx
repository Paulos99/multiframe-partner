import { memo, useCallback, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { JourneyStep } from '../../../../packages/shared/clientJourney';
import { groupJourneySteps } from '../../../../packages/shared/clientJourney';
import { useGrow, useStaggerIn } from '../ui/gsapMotion';
import styles from './partner.module.css';

const DEFAULT_HINT =
  'Считаем, сколько дошло до каждого этапа за период. Процент — от предыдущего этапа и от начала. «Не дошли…» — сколько выбыло между этапами. Нажмите этап, чтобы увидеть шаги.';

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

/** Доля для полоски: 0…1 от базы этапа/начала. */
function fillRatio(count: number | null, base: number): number {
  if (base <= 0) return 0;
  if (count == null) return 0;
  return Math.max(0, Math.min(1, count / base));
}

function dropLabel(prev: number | null, curr: number | null): string | null {
  if (prev == null || curr == null) return null;
  const lost = prev - curr;
  if (lost <= 0) return null;
  return `Не дошли до следующего этапа: ${lost}`;
}

const NestedStep = memo(function NestedStep({
  step,
  entry,
}: {
  step: JourneyStep;
  entry: number;
}) {
  const pct = pctLabel(step.fromPrevPct);
  const empty = step.count == null || step.count <= 0;
  const ratio = fillRatio(step.count, entry > 0 ? entry : 1);
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
        style={{ '--funnel-fill': `${Math.round(ratio * 100)}%` } as CSSProperties}
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
  fromStartPct,
  fillPct,
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
  fromStartPct?: string;
  fillPct: number;
  expandable: boolean;
  expanded: boolean;
  onToggle: (id: string) => void;
  children?: ReactNode;
  dropAfter: string | null;
}) {
  const prev = pctLabel(fromPrevPct);
  const start = pctLabel(fromStartPct);
  const empty = count == null || count <= 0;
  const conv =
    index === 0
      ? start
        ? `от начала ${start}`
        : null
      : [prev ? `от предыдущего ${prev}` : null, start ? `от начала ${start}` : null]
          .filter(Boolean)
          .join(' · ') || null;

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
        </span>
      </span>
      {conv ? <span className={styles.funnelConv}>{conv}</span> : null}
      <span
        className={empty ? `${styles.funnelTrack} ${styles.funnelTrackEmpty}` : styles.funnelTrack}
        style={{ '--funnel-fill': `${fillPct}%` } as CSSProperties}
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
        <div className={styles.funnelDrop} role="note">
          <span className={styles.funnelDropVal}>{dropAfter}</span>
        </div>
      ) : null}
    </li>
  );
});

export type RefusalReason = { key: string; title: string; count: number };

/** Сжатая воронка клиента: 6 групп (клик раскрывает шаги) + отказ. Ролевые — плоский список. */
export function JourneyFunnel({
  title,
  steps,
  hint = DEFAULT_HINT,
  refusalReasons = [],
}: {
  title: string;
  steps: JourneyStep[];
  hint?: string;
  refusalReasons?: RefusalReason[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { groups, refusal } = useMemo(() => groupJourneySteps(steps), [steps]);
  const compact = groups.some((g) => g.steps.length > 0);
  const [openId, setOpenId] = useState<string | null>(null);

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

  const startBase = useMemo(() => {
    const first = groups.find((g) => typeof g.count === 'number' && g.count > 0);
    return first && typeof first.count === 'number' ? first.count : 0;
  }, [groups]);

  if (!compact) {
    const numeric = steps.map((step) => (typeof step.count === 'number' ? step.count : 0));
    const base = Math.max(1, ...numeric, 1);
    return (
      <div className={styles.funnelBlock} ref={ref} data-journey-funnel>
        <h4 className={styles.funnelTitle}>{title}</h4>
        {hint ? <p className={styles.hint}>{hint}</p> : null}
        <ol className={styles.funnelLadder}>
          {steps.map((step, index) => {
            const next = steps[index + 1];
            const drop = next
              ? dropLabel(
                  typeof step.count === 'number' ? step.count : null,
                  typeof next.count === 'number' ? next.count : null,
                )
              : null;
            const fill = Math.round(fillRatio(step.count, base) * 100);
            return (
              <FunnelStage
                key={step.id}
                id={step.id}
                index={index}
                label={step.label}
                count={step.count}
                fromPrevPct={step.fromPrevPct}
                fromStartPct={step.fromStartPct}
                fillPct={fill}
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

  const emptyJourney = groups.every((g) => g.count == null || g.count === 0);

  return (
    <div className={styles.funnelBlock} ref={ref} data-journey-funnel data-funnel-compact>
      <h4 className={styles.funnelTitle}>{title}</h4>
      {hint ? <p className={styles.hint}>{hint}</p> : null}
      {emptyJourney ? <p className={styles.funnelEmpty}>За период комнат пока нет</p> : null}
      <ol className={styles.funnelLadder}>
        {groups.map((group, gi) => {
          const expanded = openId === group.id;
          const next = groups[gi + 1];
          const drop = next
            ? dropLabel(
                typeof group.count === 'number' ? group.count : null,
                typeof next.count === 'number' ? next.count : null,
              )
            : null;
          const entry = typeof group.count === 'number' && group.count > 0 ? group.count : 0;
          const fill = Math.round(fillRatio(group.count, startBase > 0 ? startBase : 1) * 100);
          return (
            <FunnelStage
              key={group.id}
              id={group.id}
              index={gi}
              label={group.label}
              count={group.count}
              fromPrevPct={group.fromPrevPct}
              fromStartPct={group.fromStartPct}
              fillPct={fill}
              expandable={group.steps.length > 0}
              expanded={expanded}
              onToggle={onToggle}
              dropAfter={drop}
            >
              {group.steps.map((step) => (
                <NestedStep key={step.id} step={step} entry={entry || startBase || 1} />
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
            <span className={styles.funnelRefusalPct}>{pctLabel(refusal.fromPrevPct)} от всех закрытых за период</span>
          ) : (
            <span className={styles.hint}>доля от всех закрытых за период</span>
          )}
          {refusalReasons.length ? (
            <ul className={styles.funnelRefusalReasons}>
              {refusalReasons.map((reason) => (
                <li key={reason.key}>
                  <span>{reason.title}</span>
                  <span>{reason.count}</span>
                </li>
              ))}
            </ul>
          ) : null}
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
