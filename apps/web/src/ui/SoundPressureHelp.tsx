import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLenis } from 'lenis/react';
import {
  formatTimesRu,
  SOUND_PRESSURE_TABLE,
} from '../state/acoustic/soundPressureTable';
import styles from './SoundPressureHelp.module.css';

type ButtonProps = {
  /** Подсветить строку таблицы (округление до целого дБ). */
  highlightDb?: number;
  /** Для screen readers. */
  label?: string;
  className?: string;
};

export function SoundPressureHelpButton({
  highlightDb,
  label = 'Таблица: разница уровней звукового давления',
  className,
}: ButtonProps) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={`${styles.helpBtn} ${className ?? ''}`}
        aria-label={label}
        onClick={() => setOpen(true)}
      >
        ?
      </button>
      {open ? (
        <SoundPressureHelpDialog
          highlightDb={highlightDb}
          onClose={() => {
            setOpen(false);
            btnRef.current?.focus();
          }}
        />
      ) : null}
    </>
  );
}

type DialogProps = {
  highlightDb?: number;
  onClose: () => void;
};

function SoundPressureHelpDialog({ highlightDb, onClose }: DialogProps) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const closingRef = useRef(false);
  const lenis = useLenis();
  const [visible, setVisible] = useState(false);
  const highlight =
    highlightDb != null && highlightDb > 0
      ? Math.min(20, Math.max(1, Math.round(Math.abs(highlightDb))))
      : null;

  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setVisible(false);
    window.setTimeout(onClose, 220);
  }, [onClose]);

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    lenis?.stop();
    closeRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') requestClose();
    };

    const blockPageScroll = (e: WheelEvent | TouchEvent) => {
      const scroller = scrollRef.current;
      if (scroller && scroller.contains(e.target as Node)) return;
      e.preventDefault();
    };

    const backdrop = backdropRef.current;
    window.addEventListener('keydown', onKey);
    backdrop?.addEventListener('wheel', blockPageScroll, { passive: false });
    backdrop?.addEventListener('touchmove', blockPageScroll, { passive: false });

    return () => {
      document.body.style.overflow = prevOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
      lenis?.start();
      window.removeEventListener('keydown', onKey);
      backdrop?.removeEventListener('wheel', blockPageScroll);
      backdrop?.removeEventListener('touchmove', blockPageScroll);
    };
  }, [lenis, requestClose]);

  useEffect(() => {
    if (highlight == null || !scrollRef.current) return;
    const row = scrollRef.current.querySelector<HTMLElement>(`#sp-row-${highlight}`);
    if (!row) return;
    const scroller = scrollRef.current;
    const rowTop = row.offsetTop;
    const rowH = row.offsetHeight;
    const viewH = scroller.clientHeight;
    scroller.scrollTop = Math.max(0, rowTop - viewH / 2 + rowH / 2);
  }, [highlight]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={backdropRef}
      className={`${styles.backdrop} ${visible ? styles.backdropOpen : ''}`}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <div
        className={`${styles.sheet} ${visible ? styles.sheetOpen : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className={styles.head}>
          <div className={styles.headText}>
            <h2 id={titleId}>Разница уровней звукового давления</h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            className={styles.closeX}
            aria-label="Закрыть"
            onClick={requestClose}
          >
            <span aria-hidden>×</span>
          </button>
        </header>

        <div className={styles.tableScroll} ref={scrollRef}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">
                  Разница
                  <span>дБ</span>
                </th>
                <th scope="col">
                  Уменьшение
                  <span>в разах</span>
                </th>
                <th scope="col">
                  Уменьшение
                  <span>%</span>
                </th>
                <th scope="col">
                  Увеличение
                  <span>%</span>
                </th>
                <th scope="col">
                  Увеличение
                  <span>в разах</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {SOUND_PRESSURE_TABLE.map((row) => (
                <tr
                  key={row.db}
                  id={`sp-row-${row.db}`}
                  className={highlight === row.db ? styles.highlight : undefined}
                >
                  <td className={styles.colDb}>{row.db}</td>
                  <td className={styles.colDec}>{formatTimesRu(row.decreaseTimes)}</td>
                  <td>
                    <span className={styles.pillDec}>{row.decreasePct}%</span>
                  </td>
                  <td>
                    <span className={styles.pillInc}>{row.increasePct}%</span>
                  </td>
                  <td className={styles.colInc}>{formatTimesRu(row.increaseTimes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className={styles.footnote}>
          дБ — логарифмическая величина, именно поэтому снижение звука в 6&nbsp;дБ равно уменьшению
          на 50% или в 2 раза
        </p>
      </div>
    </div>,
    document.body,
  );
}
