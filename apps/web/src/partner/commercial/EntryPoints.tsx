import { WORK_ENTRIES, type WorkEntryId } from './entryPoints';
import styles from '../partner.module.css';

export function EntryPoints({
  onSelect,
}: {
  onSelect: (id: WorkEntryId, route: 'problemomer' | 'calculator') => void;
}) {
  return (
    <section className={styles.hintCard} aria-label="Начать работу">
      <h2>С чего начать</h2>
      <p className={styles.lead}>Проблемомер и калькулятор открываются отдельно.</p>
      <div className={styles.salesCtas}>
        {WORK_ENTRIES.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={`${styles.ghost} ${styles.entryBtn}`}
            onClick={() => onSelect(entry.id, entry.route)}
          >
            <strong style={{ display: 'block', marginBottom: 4 }}>{entry.title}</strong>
            <span className={styles.lead}>{entry.description}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
