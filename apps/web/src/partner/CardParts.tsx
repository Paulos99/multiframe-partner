import type { ReactNode } from 'react';
import type { StageState } from './cardView';
import styles from './CardParts.module.css';

export type Stage<T extends string> = { key: T; label: string; state: StageState };

/**
 * Шкала этапов. С onPick шаги — кнопки смены этапа (группа с подписью groupLabel),
 * без него — список только для чтения.
 */
export function StageTrack<T extends string>({
  stages,
  groupLabel,
  refused,
  disabled,
  onPick,
}: {
  stages: Stage<T>[];
  groupLabel: string;
  refused?: boolean;
  disabled?: boolean;
  onPick?: (key: T) => void;
}) {
  if (onPick) {
    return (
      <div className={styles.track} role="group" aria-label={groupLabel} data-stage-track data-refused={refused ? 'true' : undefined}>
        {stages.map((stage) => (
          <button
            key={stage.key}
            type="button"
            className={styles.step}
            data-state={stage.state}
            aria-pressed={stage.state === 'current'}
            disabled={disabled}
            onClick={() => onPick(stage.key)}
          >
            {stage.label}
          </button>
        ))}
      </div>
    );
  }
  return (
    <ol className={styles.track} aria-label={groupLabel} data-stage-track data-refused={refused ? 'true' : undefined}>
      {stages.map((stage) => (
        <li key={stage.key} className={styles.step} data-state={stage.state} aria-current={stage.state === 'current' ? 'step' : undefined}>
          {stage.label}
        </li>
      ))}
    </ol>
  );
}

export type Fact = { key: string; label: string; value: ReactNode; wide?: boolean; data?: Record<string, string> };

/** Короткие факты одной сеткой: подпись мелко, значение крупно. */
export function FactGrid({ facts, label }: { facts: Fact[]; label: string }) {
  return (
    <dl className={styles.facts} aria-label={label} data-facts>
      {facts.map((fact) => (
        <div key={fact.key} className={fact.wide ? styles.factWide : undefined} {...(fact.data || {})}>
          <dt>{fact.label}</dt>
          <dd>{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Блок «Следующий шаг»: что сделать и главная кнопка; рядом второстепенные действия. */
export function NextStep({ text, children }: { text: string; children?: ReactNode }) {
  return (
    <div className={styles.next} data-next-step>
      <div className={styles.nextText}>
        <span className={styles.nextLabel}>Следующий шаг</span>
        <p>{text}</p>
      </div>
      {children ? <div className={styles.nextActions}>{children}</div> : null}
    </div>
  );
}

/** Раздел карточки с заголовком. */
export function CardSection({
  title,
  hint,
  aside,
  children,
  data,
}: {
  title: string;
  hint?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  data?: Record<string, string>;
}) {
  return (
    <section className={styles.section} aria-label={title} {...(data || {})}>
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>{title}</h2>
        {aside}
      </div>
      {hint ? <p className={styles.sectionHint}>{hint}</p> : null}
      {children}
    </section>
  );
}

export { styles as cardStyles };
