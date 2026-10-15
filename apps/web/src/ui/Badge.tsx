import styles from './Badge.module.css';

export function Badge({ children }: { children: string }) {
  return <span className={styles.badge}>{children}</span>;
}
