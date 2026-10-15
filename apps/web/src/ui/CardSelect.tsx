import type { ReactNode } from 'react';
import styles from './CardSelect.module.css';

interface Props {
  selected?: boolean;
  onClick?: () => void;
  title: string;
  hint?: string;
  icon?: ReactNode;
  multi?: boolean;
  disabled?: boolean;
  /** Compact tile for 2-col mobile grids */
  dense?: boolean;
}

export function CardSelect({
  selected,
  onClick,
  title,
  hint,
  icon,
  multi,
  disabled,
  dense,
}: Props) {
  return (
    <button
      type="button"
      className={`${styles.card} ${selected ? styles.selected : ''} ${dense ? styles.dense : ''}`}
      onClick={onClick}
      aria-pressed={selected}
      disabled={disabled}
    >
      <span className={styles.lead}>
        {icon ? <span className={styles.icon}>{icon}</span> : null}
        <span className={styles.text}>
          <span className={styles.title}>{title}</span>
          {hint ? <span className={styles.hint}>{hint}</span> : null}
        </span>
      </span>
      <span className={styles.check} aria-hidden>
        {selected ? '✓' : multi ? '' : ''}
      </span>
    </button>
  );
}
