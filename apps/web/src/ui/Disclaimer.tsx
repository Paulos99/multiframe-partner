import styles from './Disclaimer.module.css';
import { DISCLAIMER_EXPERT } from '../state/types';

interface Props {
  text?: string;
  compact?: boolean;
}

export function Disclaimer({ text = DISCLAIMER_EXPERT, compact }: Props) {
  return (
    <aside className={`${styles.box} ${compact ? styles.compact : ''}`} role="note">
      <span className={styles.mark} aria-hidden>
        i
      </span>
      <p>{text}</p>
    </aside>
  );
}
