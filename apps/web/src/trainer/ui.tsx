import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeftIcon } from '../icons';
import { navigateHash } from '../partner/projectRoute';
import { highlightRanges } from './engine';
import { trainerHash, type TrainerRoute } from './route';
import { isWebQuote, type RequiredPoint, type SourceQuote, type VideoRef } from './types';
import styles from './Trainer.module.css';

export function go(route: TrainerRoute, mode: 'push' | 'replace' = 'push') {
  navigateHash(trainerHash(route), mode);
}

export function Page({ title, back, children, lead }: { title: string; back?: { label: string; to: TrainerRoute }; lead?: string; children: ReactNode }) {
  return (
    <section className={styles.page} aria-label={title}>
      {back ? (
        <button type="button" className={styles.back} onClick={() => go(back.to)}>
          <ChevronLeftIcon size={18} />
          <span>{back.label}</span>
        </button>
      ) : null}
      <h3 className={styles.pageTitle}>{title}</h3>
      {lead ? <p className={styles.lead}>{lead}</p> : null}
      {children}
    </section>
  );
}

/** Полоса «шаг из N»: видно, сколько пройдено и сколько осталось. Подпись выводит сам экран. */
export function StepBar({ current, total, label, extra }: { current: number; total: number; label: string; extra?: ReactNode }) {
  const done = Math.max(0, Math.min(total, current));
  return (
    <div className={styles.stepBar}>
      <div className={styles.stepHead}>
        <span className={styles.step}>{label}</span>
        {extra}
      </div>
      <div className={styles.stepTrack} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
        <span className={styles.stepFill} style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
      </div>
    </div>
  );
}

/** Раздел, который раскрывается по нажатию: обзор сверху, подробности по запросу. */
export function Fold({ title, hint, label, defaultOpen = false, children }: { title: string; hint?: string; label?: string; defaultOpen?: boolean; children: ReactNode }) {
  return (
    <section className={styles.fold} aria-label={label ?? title}>
      <details open={defaultOpen || undefined}>
        <summary>
          <span className={styles.foldTitle}>{title}</span>
          {hint ? <span className={styles.foldHint}>{hint}</span> : null}
        </summary>
        <div className={styles.foldBody}>{children}</div>
      </details>
    </section>
  );
}

/** Подсказка: на широком экране раскрыта сразу, на телефоне свёрнута. */
export function useWideScreen(query = '(min-width: 900px)'): boolean {
  const [wide, setWide] = useState(() => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : true));
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia(query);
    const on = () => setWide(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return wide;
}

/** Небольшое окно по центру: настройки подхода и подобные короткие формы. */
export function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('input,select,button,textarea')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [onClose]);
  return createPortal(
    <div className={styles.backdrop} role="presentation" onClick={onClose}>
      <div ref={ref} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby={id} onClick={(e) => e.stopPropagation()}>
        <h2 id={id}>{title}</h2>
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function videoTitle(videos: VideoRef[], code: string): string {
  return videos.find((v) => v.code === code)?.title ?? code;
}

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
export function ruDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : iso;
}

/**
 * Цитаты из видео и со страниц производителей. Факт с сайта всегда идёт с ссылкой на источник и словами
 * «производитель указывает»; предостережение (caveat) клиенту не говорится.
 */
export function Quotes({ quotes, videos, copyable = false }: { quotes: SourceQuote[]; videos: VideoRef[]; copyable?: boolean }) {
  const [copied, setCopied] = useState<string | null>(null);
  if (!quotes.length) return null;
  return (
    <ul className={styles.quotes}>
      {quotes.map((q) =>
        isWebQuote(q) ? (
          <li key={q.id} className={q.use === 'caveat' ? styles.quoteCaveat : styles.quoteWeb}>
            {q.use === 'caveat' ? (
              <p className={styles.quoteLabel}>
                <strong>Клиенту не говорить.</strong> {q.note ?? 'Это предостережение для вас, а не фраза для разговора.'}
              </p>
            ) : (
              <p className={styles.quoteLabel}>
                <strong>Производитель указывает:</strong>
              </p>
            )}
            <blockquote>«{q.quote}»</blockquote>
            <span className={styles.quoteSrc}>
              Источник: {q.publisher}, проверено {ruDate(q.accessed)}.{' '}
              <a className={styles.extLink} href={q.url} target="_blank" rel="noopener noreferrer">
                Открыть страницу
              </a>
            </span>
          </li>
        ) : (
          <li key={q.id}>
            <blockquote>«{q.quote}»</blockquote>
            <span className={styles.quoteSrc}>Видео {q.videoCode}: {videoTitle(videos, q.videoCode)}</span>
            {copyable ? (
              <button
                type="button"
                className={styles.linkBtn}
                onClick={() => {
                  void navigator.clipboard?.writeText(q.quote).then(() => setCopied(q.quote));
                }}
              >
                {copied === q.quote ? 'Скопировано' : 'Скопировать цитату'}
              </button>
            ) : null}
          </li>
        ),
      )}
    </ul>
  );
}

export function Highlighted({ text, patterns }: { text: string; patterns: string[] }) {
  const ranges = highlightRanges(text, patterns);
  if (!ranges.length) return <>{text}</>;
  const out: ReactNode[] = [];
  let at = 0;
  ranges.forEach(([a, b], i) => {
    if (a > at) out.push(text.slice(at, a));
    out.push(<mark key={i} className={styles.mark}>{text.slice(a, b)}</mark>);
    at = b;
  });
  if (at < text.length) out.push(text.slice(at));
  return <>{out}</>;
}

export function Score({ value }: { value: number }) {
  return <span className={styles.scoreNum}>{String(value).replace('.', ',')}</span>;
}


/** Что содержит хороший ответ: подсказка, не оценка. `said` — отметки «вы сказали» из свободной практики. */
export function HintPoints({ points, said }: { points: RequiredPoint[]; said?: Set<string> }) {
  return (
    <ul className={styles.points}>
      {[...points]
        .sort((a, b) => Number(b.critical) - Number(a.critical))
        .map((p) => {
          const mark = said ? (said.has(p.id) ? styles.pointOk : styles.pointMiss) : styles.pointHint;
          return (
            <li key={p.id} className={mark}>
              <span className={styles.mark2} aria-hidden="true">{said ? (said.has(p.id) ? '✔' : '—') : '•'}</span>
              <span>
                {said ? <strong>{said.has(p.id) ? 'Вы сказали' : 'Не сказали'}</strong> : null}
                {said && p.critical ? <em className={styles.critTag}> · главное</em> : null}
                {!said && p.critical ? <em className={styles.critTag}>Главное: </em> : null}
                {said ? <br /> : null}
                {p.text}
              </span>
            </li>
          );
        })}
    </ul>
  );
}
