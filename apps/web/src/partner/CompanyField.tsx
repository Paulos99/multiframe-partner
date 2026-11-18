import { useEffect, useId, useRef, useState } from 'react';
import { COMPANY_SEARCH_MIN, apiSearchCompanies, type CompanyHint } from './staffJoin';
import styles from './partner.module.css';

type CompanyFieldProps = {
  value: string;
  selectedId: string;
  onChange: (next: { id: string; name: string }) => void;
  placeholder?: string;
};

/**
 * Поиск компании, как выбор города: человек вводит название и выбирает подходящую из списка.
 * Полный список компаний не показывается.
 */
export function CompanyField({
  value,
  selectedId,
  onChange,
  placeholder = 'Начните вводить название компании',
}: CompanyFieldProps) {
  const listId = useId();
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [hits, setHits] = useState<CompanyHint[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const requestId = useRef(0);

  useEffect(() => {
    if (!focused) setQuery(value);
  }, [value, focused]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < COMPANY_SEARCH_MIN) {
      setHits([]);
      setLoading(false);
      setLoadError(null);
      return;
    }
    setLoading(true);
    const id = ++requestId.current;
    const timer = window.setTimeout(() => {
      void apiSearchCompanies(q)
        .then((rows) => {
          if (requestId.current !== id) return;
          setHits(rows);
          setLoadError(null);
          setActive(0);
        })
        .catch((err) => {
          if (requestId.current !== id) return;
          setHits([]);
          setLoadError(err instanceof Error ? err.message : 'Не удалось найти компанию');
        })
        .finally(() => {
          if (requestId.current === id) setLoading(false);
        });
    }, 220);
    return () => window.clearTimeout(timer);
  }, [query]);

  const tooShort = query.trim().length > 0 && query.trim().length < COMPANY_SEARCH_MIN;
  const empty = open && !loading && !tooShort && query.trim().length >= COMPANY_SEARCH_MIN && !hits.length && !loadError;
  const invalid = !focused && Boolean(query.trim()) && !selectedId;
  const message = loadError
    ? loadError
    : empty && !focused
      ? 'Компания не зарегистрирована'
      : invalid
        ? 'Выберите компанию из списка'
        : tooShort && !focused
          ? 'Введите не меньше двух букв названия'
          : null;

  function choose(row: CompanyHint) {
    setQuery(row.name);
    onChange({ id: row.id, name: row.name });
    setOpen(false);
  }

  return (
    <div className={styles.combo} ref={boxRef}>
      <input
        role="combobox"
        aria-expanded={open && hits.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-invalid={Boolean(message)}
        value={query}
        placeholder={placeholder}
        autoComplete="off"
        onFocus={() => {
          setFocused(true);
          setOpen(true);
        }}
        onBlur={() => {
          setFocused(false);
          setOpen(false);
        }}
        onChange={(event) => {
          const next = event.target.value;
          setQuery(next);
          setOpen(true);
          setActive(0);
          if (selectedId) onChange({ id: '', name: next });
          else onChange({ id: '', name: next });
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setOpen(true);
            setActive((n) => Math.min(Math.max(hits.length - 1, 0), n + 1));
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActive((n) => Math.max(0, n - 1));
          } else if (event.key === 'Enter' && open && hits[active]) {
            event.preventDefault();
            choose(hits[active]);
          } else if (event.key === 'Escape') {
            setOpen(false);
          }
        }}
      />
      {open && query.trim() ? (
        <ul className={styles.comboList} id={listId} role="listbox">
          {tooShort ? (
            <li className={styles.comboEmpty}>Введите ещё хотя бы одну букву</li>
          ) : loading && !hits.length ? (
            <li className={styles.comboEmpty}>Ищем компанию…</li>
          ) : hits.length ? (
            hits.map((row, index) => (
              <li key={row.id} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={index === active}
                  className={index === active ? styles.comboOptionOn : styles.comboOption}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(row)}
                >
                  <span>{row.name}</span>
                </button>
              </li>
            ))
          ) : loadError ? (
            <li className={styles.comboEmpty}>{loadError}</li>
          ) : (
            <li className={styles.comboEmpty}>Компания не зарегистрирована</li>
          )}
        </ul>
      ) : null}
      {message ? (
        <span className={styles.fieldError} role="alert">
          {message}
        </span>
      ) : (
        <span className={styles.hint}>Начните вводить название — появится список подходящих компаний.</span>
      )}
    </div>
  );
}
