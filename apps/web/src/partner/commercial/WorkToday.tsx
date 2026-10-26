import type { NextAction } from './nextActions';
import { Skeleton } from '../Skeleton';
import styles from '../partner.module.css';

export function WorkToday({
  title = 'Сегодня в работе',
  actions,
  empty = 'Нет срочных действий — можно начать новый расчёт или консультацию.',
  loading = false,
  onOpen,
}: {
  title?: string;
  actions: NextAction[];
  empty?: string;
  loading?: boolean;
  onOpen?: (action: NextAction) => void;
}) {
  return (
    <section className={styles.hintCard} aria-label={title} aria-busy={loading}>
      <h2>{title}</h2>
      {loading ? (
        <Skeleton count={4} label="Загрузка задач" />
      ) : actions.length === 0 ? (
        <p className={styles.lead}>{empty}</p>
      ) : (
        <ul className={styles.queue}>
          {actions.map((action) => (
            <li key={action.id}>
              <button type="button" className={styles.queueBtn} onClick={() => onOpen?.(action)}>
                <strong>{action.title}</strong>
                <span className={styles.lead}>{action.detail}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
