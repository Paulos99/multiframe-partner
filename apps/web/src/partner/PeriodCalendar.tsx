import { useEffect, useId, useRef, useState } from 'react';
import { formatPeriodLabel, ymdLocal, ymdShift } from './analytics';
import styles from './partner.module.css';

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const MONTHS = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
];

type Props = {
  fromYmd: string | null;
  toYmd: string | null;
  onChange: (fromYmd: string | null, toYmd: string | null) => void;
};

function monthCells(year: number, month: number): Array<string | null> {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7;
  const count = new Date(year, month + 1, 0).getDate();
  const cells: Array<string | null> = Array.from({ length: lead }, () => null);
  for (let day = 1; day <= count; day++) {
    cells.push(ymdLocal(new Date(year, month, day)));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function PeriodCalendar({ fromYmd, toYmd, onChange }: Props) {
  const today = ymdLocal(new Date());
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<string | null>(null);
  const [cursor, setCursor] = useState(() => {
    const seed = toYmd || fromYmd || today;
    const [y, m] = seed.split('-').map(Number);
    return { year: y, month: m - 1 };
  });
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const start = fromYmd && toYmd ? (fromYmd <= toYmd ? fromYmd : toYmd) : null;
  const end = fromYmd && toYmd ? (fromYmd <= toYmd ? toYmd : fromYmd) : null;

  function apply(from: string | null, to: string | null, close = false) {
    onChange(from, to);
    setAnchor(null);
    if (close) setOpen(false);
  }

  function pick(day: string) {
    if (day > today) return;
    if (!anchor) {
      setAnchor(day);
      onChange(day, day);
      return;
    }
    const a = anchor <= day ? anchor : day;
    const b = anchor <= day ? day : anchor;
    apply(a, b, true);
  }

  function shiftMonth(delta: number) {
    setCursor((c) => {
      const next = new Date(c.year, c.month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  }

  const cells = monthCells(cursor.year, cursor.month);

  return (
    <div className={styles.calRoot} ref={rootRef}>
      <button
        type="button"
        className={styles.calTrigger}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={styles.calTriggerLabel}>{formatPeriodLabel(fromYmd, toYmd)}</span>
      </button>
      {open ? (
        <div className={styles.calPop} id={panelId} role="dialog" aria-label="Период">
          <div className={styles.calPresets}>
            <button type="button" className={styles.ghost} onClick={() => apply(ymdShift(-6), today, true)}>
              7 дней
            </button>
            <button type="button" className={styles.ghost} onClick={() => apply(ymdShift(-29), today, true)}>
              30 дней
            </button>
            <button
              type="button"
              className={styles.ghost}
              onClick={() => apply(ymdLocal(new Date(new Date().getFullYear(), new Date().getMonth(), 1)), today, true)}
            >
              Этот месяц
            </button>
            <button
              type="button"
              className={styles.ghost}
              onClick={() => {
                const now = new Date();
                const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                const end = new Date(now.getFullYear(), now.getMonth(), 0);
                apply(ymdLocal(start), ymdLocal(end), true);
              }}
            >
              Прошлый месяц
            </button>
            <button type="button" className={styles.ghost} onClick={() => apply(null, null, true)}>
              Всё время
            </button>
          </div>
          <div className={styles.calNav}>
            <button type="button" className={styles.calNavBtn} onClick={() => shiftMonth(-1)} aria-label="Предыдущий месяц">
              ‹
            </button>
            <strong>
              {MONTHS[cursor.month]} {cursor.year}
            </strong>
            <button type="button" className={styles.calNavBtn} onClick={() => shiftMonth(1)} aria-label="Следующий месяц">
              ›
            </button>
          </div>
          <div className={styles.calWeek}>
            {WEEKDAYS.map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className={styles.calGrid}>
            {cells.map((day, i) => {
              if (!day) return <span key={`e-${i}`} />;
              const inRange = Boolean(start && end && day >= start && day <= end);
              const edge = day === start || day === end;
              const future = day > today;
              return (
                <button
                  key={day}
                  type="button"
                  disabled={future}
                  className={[
                    styles.calDay,
                    inRange ? styles.calDayIn : '',
                    edge ? styles.calDayEdge : '',
                    day === today ? styles.calDayToday : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => pick(day)}
                >
                  {Number(day.slice(8))}
                </button>
              );
            })}
          </div>
          <p className={styles.calHint}>
            {anchor ? 'Выберите второй день диапазона' : 'Нажмите день начала, затем день конца'}
          </p>
        </div>
      ) : null}
    </div>
  );
}
