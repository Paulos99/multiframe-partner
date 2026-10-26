import { useId, useState } from 'react';
import type { JobObjectHistoryEntry } from '../../../../packages/shared/partner';
import { describeHistory, historyAuthor, sortedHistory, type HistoryPerson } from './historyFormatting';
import styles from './ObjectHistory.module.css';

export function recordsLabel(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  const word =
    mod10 === 1 && mod100 !== 11
      ? 'запись'
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
        ? 'записи'
        : 'записей';
  return `${count} ${word}`;
}

export function ObjectHistory({ entries, people }: {
  entries: JobObjectHistoryEntry[];
  people: HistoryPerson[];
}) {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  if (!entries.length) return null;
  const sorted = sortedHistory(entries);
  const visible = expanded ? sorted : sorted.slice(0, 3);
  return (
    <section className={styles.history} aria-label="История комнаты">
      <div className={styles.heading}>
        <h3>История комнаты</h3>
        <span>{recordsLabel(entries.length)}</span>
      </div>
      <ol className={styles.list} id={listId}>
        {visible.map((entry, index) => {
          const validDate = !Number.isNaN(Date.parse(entry.at));
          return (
            <li className={styles.event} key={`${entry.at}-${index}`}>
              <span className={styles.dot} aria-hidden="true" />
              <div>
                <p className={styles.title}>{describeHistory(entry, people)}</p>
                <div className={styles.meta}>
                  <span className={styles.author}>{historyAuthor(entry, people)}</span>
                  {validDate ? <time dateTime={entry.at}>{new Date(entry.at).toLocaleString('ru-RU', {
                    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
                  })}</time> : <span>Дата не указана</span>}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      {entries.length > 3 ? (
        <button type="button" className={styles.toggle} aria-expanded={expanded} aria-controls={listId}
          onClick={() => setExpanded(value => !value)}>
          {expanded ? 'Свернуть историю' : `Показать всю историю (${entries.length})`}
        </button>
      ) : null}
    </section>
  );
}
