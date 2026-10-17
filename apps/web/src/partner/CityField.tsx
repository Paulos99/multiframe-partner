import { useEffect, useId, useRef, useState } from 'react';
import type { CityRow } from './cityCatalog';
import { citiesReady, isKnownCity, loadCities, resolveCity, searchCities } from './cityCatalog';
import styles from './partner.module.css';

type CityFieldProps = {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
};

export function CityField({
  value,
  onChange,
  placeholder = 'Например, Шуя',
}: CityFieldProps) {
  const listId = useId();
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(citiesReady());
  const [loadError, setLoadError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const [blurred, setBlurred] = useState(false);
  const [active, setActive] = useState(0);
  const dirty = useRef(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    void loadCities()
      .then(() => {
        if (live) setReady(true);
      })
      .catch(() => {
        if (live) setLoadError('Не удалось загрузить справочник городов');
      });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!focused) setQuery(value);
  }, [value, focused]);

  const hits: CityRow[] = ready && query.trim() ? searchCities(query, 8) : [];
  const invalid =
    ready &&
    !focused &&
    Boolean(value.trim()) &&
    !isKnownCity(value) &&
    (blurred || !dirty.current);
  const message = loadError
    ? loadError
    : invalid
      ? resolveCity(value, null).ok
        ? null
        : (resolveCity(value, null) as { message: string }).message
      : null;

  function choose(row: CityRow) {
    dirty.current = false;
    setQuery(row.label);
    onChange(row.label);
    setOpen(false);
    setBlurred(true);
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
          setBlurred(true);
          setOpen(false);
          if (dirty.current && ready) {
            const resolved = resolveCity(query, null);
            if (resolved.ok) {
              dirty.current = false;
              setQuery(resolved.city);
              if (resolved.city !== value) onChange(resolved.city);
              return;
            }
          }
          if (query !== value) onChange(query);
        }}
        onChange={(e) => {
          dirty.current = true;
          setQuery(e.target.value);
          onChange(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
            setActive((n) => Math.min(hits.length - 1, n + 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((n) => Math.max(0, n - 1));
          } else if (e.key === 'Enter' && open && hits[active]) {
            e.preventDefault();
            choose(hits[active]);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
      />
      {open && query.trim() && ready ? (
        <ul className={styles.comboList} id={listId} role="listbox">
          {hits.length ? (
            hits.map((row, index) => (
              <li key={row.label} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={index === active}
                  className={index === active ? styles.comboOptionOn : styles.comboOption}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(row)}
                >
                  <span>{row.name}</span>
                  <span className={styles.comboRegion}>{row.subject}</span>
                </button>
              </li>
            ))
          ) : (
            <li className={styles.comboEmpty}>Нет в справочнике городов РФ</li>
          )}
        </ul>
      ) : null}
      {message ? (
        <span className={styles.fieldError} role="alert">
          {message}
        </span>
      ) : (
        <span className={styles.hint}>
          Город и регион из справочника РФ · Википедия, CC BY-SA 4.0
        </span>
      )}
    </div>
  );
}
