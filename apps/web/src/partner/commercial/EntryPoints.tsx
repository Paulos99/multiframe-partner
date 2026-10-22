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
      <p className={styles.lead}>Три равноправных входа — не обязательно с жалобы на шум.</p>
      <div className={styles.toolsGrid || undefined} style={{ display: 'grid', gap: 12 }}>
        {WORK_ENTRIES.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={styles.primaryBtn || styles.ghostBtn}
            style={{
              textAlign: 'left',
              padding: '12px 14px',
              borderRadius: 12,
              border: '1px solid var(--border, #d8d8d8)',
              background: 'var(--surface, #fff)',
              cursor: 'pointer',
            }}
            onClick={() =>
              onSelect(entry.id, entry.route === 'calculator' ? 'calculator' : 'problemomer')
            }
          >
            <strong style={{ display: 'block', marginBottom: 4 }}>{entry.title}</strong>
            <span className={styles.lead}>{entry.description}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
