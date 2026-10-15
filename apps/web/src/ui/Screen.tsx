import styles from './Screen.module.css';
import type { ReactNode } from 'react';

export function Screen({
  title,
  subtitle,
  eyebrow,
  lead,
  children,
  hero,
  stickyHead,
  dense,
}: {
  title?: string;
  subtitle?: string;
  eyebrow?: string;
  /** Line above the title (e.g. question counter) */
  lead?: ReactNode;
  children: ReactNode;
  hero?: boolean;
  /** Keep question header visible while scrolling options (mobile input steps) */
  stickyHead?: boolean;
  /** Tighter vertical rhythm (Result evidence pack) */
  dense?: boolean;
}) {
  return (
    <section
      className={`${styles.screen} ${hero ? styles.hero : ''} ${dense ? styles.dense : ''}`}
    >
      {title ? (
        <header className={`${styles.head} ${stickyHead ? styles.headSticky : ''}`}>
          {eyebrow ? <p className={styles.eyebrow}>{eyebrow}</p> : null}
          {lead ? (
            <p className={styles.lead} aria-live="polite">
              {lead}
            </p>
          ) : null}
          <h1>{title}</h1>
          {subtitle ? <p>{subtitle}</p> : null}
        </header>
      ) : null}
      <div className={styles.body}>{children}</div>
    </section>
  );
}
