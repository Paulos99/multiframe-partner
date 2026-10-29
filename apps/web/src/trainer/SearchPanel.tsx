import { useId, useMemo, useState } from 'react';
import { go } from './ui';
import { buildSearchEntries, queryTokens, searchBank, type SearchEntry } from './search';
import { useTrainer } from './TrainerContext';
import styles from './Trainer.module.css';

const FIRST_PAGE = 8;

function ResultCard({ entry, open, onToggle }: { entry: SearchEntry; open: boolean; onToggle: () => void }) {
  const bodyId = useId();
  return (
    <li className={styles.searchItem}>
      <button type="button" className={styles.searchHead} aria-expanded={open} aria-controls={bodyId} onClick={onToggle}>
        <span className={styles.searchKind}>{entry.kind === 'objection' ? 'Возражение' : 'Вопрос'}</span>
        <strong>{entry.title}</strong>
        {entry.question !== entry.title ? <span className={`${styles.meta} ${open ? '' : styles.clamp}`}>Клиент: {entry.question}</span> : null}
      </button>
      {open ? (
        <div id={bodyId} className={styles.searchBody}>
          <section aria-label="Что ответить">
            <h5>Что ответить</h5>
            <p className={styles.refAnswer}>{entry.answer}</p>
          </section>
          <section aria-label="Почему так">
            <h5>Почему так</h5>
            <p>{entry.explanation}</p>
          </section>
          {entry.mistake ? (
            <section aria-label="Типичная ошибка">
              <h5>Типичная ошибка</h5>
              <p>{entry.mistake}</p>
            </section>
          ) : null}
          {entry.kind === 'objection' ? (
            <button type="button" className={styles.linkBtn} onClick={() => go({ page: 'bank', id: entry.id })}>
              Открыть карточку целиком
            </button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

/** Быстрый поиск по банку: слово из речи клиента, и сразу видны вопросы с эталонным ответом. Ничего не оценивается. */
export function SearchPanel() {
  const t = useTrainer();
  const inputId = useId();
  const entries = useMemo(() => buildSearchEntries(t.content), [t.content]);
  const [query, setQuery] = useState('');
  const [opened, setOpened] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const hits = useMemo(() => searchBank(entries, query), [entries, query]);
  const searching = queryTokens(query).length > 0;
  const shown = all ? hits : hits.slice(0, FIRST_PAGE);
  const single = hits.length === 1 ? hits[0].entry.id : null;
  return (
    <section className={styles.searchPanel} aria-label="Быстрый поиск">
      <h4>Быстрый поиск ответа</h4>
      <p className={styles.hint}>Клиент спросил на объекте? Введите слово, например «горение» или «цена». Поиск не оценивается.</p>
      <div className={styles.searchField}>
        <label htmlFor={inputId} className={styles.srOnly}>
          Слово или вопрос клиента
        </label>
        <input
          id={inputId}
          type="search"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="Слово из вопроса клиента"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpened(null);
            setAll(false);
          }}
        />
        {query ? (
          <button
            type="button"
            className={styles.searchClear}
            aria-label="Очистить поиск"
            onClick={() => {
              setQuery('');
              setOpened(null);
            }}
          >
            ×
          </button>
        ) : null}
      </div>
      <div role="status" aria-live="polite" className={styles.searchStatus}>
        {searching ? (hits.length ? `Найдено: ${hits.length}` : 'Ничего не нашлось. Попробуйте другое слово или его начало.') : ''}
      </div>
      {shown.length ? (
        <ul className={styles.searchList}>
          {shown.map(({ entry }) => (
            <ResultCard
              key={entry.id}
              entry={entry}
              open={opened === entry.id || single === entry.id}
              onToggle={() => setOpened((cur) => (cur === entry.id ? null : entry.id))}
            />
          ))}
        </ul>
      ) : null}
      {hits.length > shown.length ? (
        <button type="button" className={styles.secondary} onClick={() => setAll(true)}>
          Показать все ({hits.length})
        </button>
      ) : null}
    </section>
  );
}
