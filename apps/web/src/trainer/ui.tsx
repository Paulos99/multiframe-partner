import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { navigateHash } from '../partner/projectRoute';
import { highlightRanges, needsNote } from './engine';
import { trainerHash, type TrainerRoute } from './route';
import type { CriterionId, Flag, Objection, Scores, SourceQuote, TrainerContent, VideoRef } from './types';
import styles from './Trainer.module.css';

export function go(route: TrainerRoute, mode: 'push' | 'replace' = 'push') {
  navigateHash(trainerHash(route), mode);
}

export function Page({ title, back, children, lead }: { title: string; back?: { label: string; to: TrainerRoute }; lead?: string; children: ReactNode }) {
  return (
    <section className={styles.page} aria-label={title}>
      {back ? (
        <button type="button" className={styles.back} onClick={() => go(back.to)}>
          ← {back.label}
        </button>
      ) : null}
      <h3 className={styles.pageTitle}>{title}</h3>
      {lead ? <p className={styles.lead}>{lead}</p> : null}
      {children}
    </section>
  );
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

export function Quotes({ quotes, videos, copyable = false }: { quotes: Pick<SourceQuote, 'videoCode' | 'quote'>[]; videos: VideoRef[]; copyable?: boolean }) {
  const [copied, setCopied] = useState<string | null>(null);
  if (!quotes.length) return null;
  return (
    <ul className={styles.quotes}>
      {quotes.map((q, i) => (
        <li key={`${q.videoCode}-${i}`}>
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
      ))}
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

export function flagExplanation(content: TrainerContent, flag: Flag, objection?: Objection | null): string {
  const g = content.scoring.globalForbidden.find((r) => r.id === flag.id);
  if (g?.text) return g.text;
  const local = objection?.forbiddenClaims.find((c) => c.patternsRef === flag.id || c.id === flag.id);
  if (local) return local.text;
  return 'Формулировка, которой нет в обучающих видео. Лучше сказать так, как в эталоне.';
}

export function Flags({ flags, content, objection }: { flags: Flag[]; content: TrainerContent; objection?: Objection | null }) {
  const unique = [...new Map(flags.map((f) => [f.id, f])).values()];
  if (!unique.length) {
    return <p className={styles.okLine}>✔ Запрещённых утверждений не найдено.</p>;
  }
  return (
    <ul className={styles.flags}>
      {unique.map((f) => (
        <li key={f.id} className={f.severity === 'critical' ? styles.flagCrit : styles.flagWarn}>
          <strong>{f.severity === 'critical' ? '✖ Нарушение: ' : '⚠ Осторожно: '}</strong>
          «{f.fragment}». {flagExplanation(content, f, objection)}
        </li>
      ))}
    </ul>
  );
}

export function Points({ objection, matched, content }: { objection: Objection; matched: string[]; content: TrainerContent }) {
  void content;
  return (
    <ul className={styles.points}>
      {objection.requiredPoints.map((p) => {
        const ok = matched.includes(`${objection.id}:${p.id}`);
        return (
          <li key={p.id} className={ok ? styles.pointOk : styles.pointMiss}>
            <span className={styles.mark2} aria-hidden="true">{ok ? '✔' : '✖'}</span>
            <span>
              <strong>{ok ? 'Названо' : 'Не названо'}</strong>
              {p.critical ? <em className={styles.critTag}> · обязательный пункт</em> : null}
              <br />
              {p.text}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function Score({ value }: { value: number }) {
  return <span className={styles.scoreNum}>{String(value).replace('.', ',')}</span>;
}

/** Самооценка по якорям: автооценка проставлена заранее, можно изменить; изменение больше чем на балл требует пометки. */
export function SelfAssess({
  criteria,
  content,
  auto,
  onSubmit,
  busy,
  submitLabel = 'Сохранить оценку',
}: {
  criteria: CriterionId[];
  content: TrainerContent;
  auto: Scores;
  onSubmit: (scores: Scores, notes: Partial<Record<CriterionId, string>>) => void;
  busy?: boolean;
  submitLabel?: string;
}) {
  const hasAuto = criteria.some((c) => auto[c] !== undefined);
  const [values, setValues] = useState<Scores>(() => Object.fromEntries(criteria.map((c) => [c, auto[c] ?? 3])) as Scores);
  const [notes, setNotes] = useState<Partial<Record<CriterionId, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const defs = content.scoring.criteria.filter((c) => criteria.includes(c.id));
  return (
    <form
      className={styles.assess}
      onSubmit={(e) => {
        e.preventDefault();
        const missing = defs.find((c) => hasAuto && needsNote(auto[c.id], values[c.id] ?? 3) && !(notes[c.id] ?? '').trim());
        if (missing) {
          setError(`Вы изменили оценку «${missing.title}» больше чем на один балл. Напишите коротко, почему.`);
          return;
        }
        setError(null);
        onSubmit(values, Object.fromEntries(Object.entries(notes).filter(([, v]) => (v ?? '').trim())) as Partial<Record<CriterionId, string>>);
      }}
    >
      <h4>Ваша оценка</h4>
      <p className={styles.hint}>
        {hasAuto
          ? 'Предварительная оценка проставлена автоматически, это подсказка, а не экзамен. Поправьте её по описаниям. В итог идёт ваша оценка.'
          : 'Оцените свой ответ по описаниям. В итог идёт ваша оценка.'}
      </p>
      {defs.map((c) => {
        const v = values[c.id] ?? 3;
        return (
          <fieldset key={c.id} className={styles.criterion}>
            <legend>
              {c.title}
              {auto[c.id] !== undefined ? <span className={styles.autoTag}> · предварительно {auto[c.id]}</span> : null}
            </legend>
            <div className={styles.scale} role="radiogroup" aria-label={c.title}>
              {[1, 2, 3, 4, 5].map((n) => (
                <label key={n} className={v === n ? styles.scaleOn : styles.scaleOff}>
                  <input type="radio" name={`self-${c.id}`} value={n} checked={v === n} onChange={() => setValues((s) => ({ ...s, [c.id]: n }))} />
                  <span>{n}</span>
                </label>
              ))}
            </div>
            <p className={styles.anchor}>{c.anchors[String(v) as '1']}</p>
            {hasAuto && needsNote(auto[c.id], v) ? (
              <label className={styles.noteField}>
                Почему вы изменили оценку?
                <input type="text" value={notes[c.id] ?? ''} onChange={(e) => setNotes((s) => ({ ...s, [c.id]: e.target.value }))} maxLength={200} />
              </label>
            ) : null}
            <details className={styles.checkSelf}>
              <summary>Проверить себя</summary>
              <ul>
                {c.selfChecklist.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
            </details>
          </fieldset>
        );
      })}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" className={styles.primary} disabled={busy}>
        {submitLabel}
      </button>
    </form>
  );
}
