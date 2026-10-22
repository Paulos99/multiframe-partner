import type { NextAction } from './nextActions';
import styles from '../partner.module.css';

export function WorkToday({
  title = 'Сегодня в работе',
  actions,
  empty = 'Нет срочных действий — можно начать новый расчёт или консультацию.',
  onOpen,
}: {
  title?: string;
  actions: NextAction[];
  empty?: string;
  onOpen?: (action: NextAction) => void;
}) {
  return (
    <section className={styles.hintCard} aria-label={title}>
      <h2>{title}</h2>
      {actions.length === 0 ? (
        <p className={styles.lead}>{empty}</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
          {actions.map((action) => (
            <li key={action.id}>
              <button
                type="button"
                onClick={() => onOpen?.(action)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1px solid var(--border, #d8d8d8)',
                  background: 'transparent',
                  cursor: onOpen ? 'pointer' : 'default',
                }}
              >
                <strong style={{ display: 'block' }}>{action.title}</strong>
                <span className={styles.lead}>{action.detail}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
