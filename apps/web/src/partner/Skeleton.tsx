import styles from './Skeleton.module.css';
export function Skeleton({
  kind = 'rows',
  count = 3,
  label = 'Загрузка данных',
}: {
  kind?: 'rows' | 'cards' | 'chart' | 'page';
  count?: number;
  label?: string;
}) {
  return (
    <div
      className={`${styles.group} ${styles[kind]}`}
      role="status"
      aria-label={label}
      aria-busy="true"
    >
      {Array.from({ length: count }, (_, i) => (
        <div className={styles.block} key={i} aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      ))}
    </div>
  );
}
