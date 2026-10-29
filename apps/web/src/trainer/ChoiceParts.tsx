import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { errorLabel, shuffleOptions, type Try } from './choice';
import { checkPractice } from './practice';
import { Fold, Highlighted, HintPoints, Quotes } from './ui';
import type { AttemptAnswer, Choice, ChoiceOption, RequiredPoint, SourceQuote, VideoRef } from './types';
import styles from './Trainer.module.css';

const LETTERS = ['А', 'Б', 'В', 'Г', 'Д'];

/**
 * Выбор ответа на одну реплику клиента: четыре варианта в перемешанном порядке.
 * Неверный выбор помечается и блокируется, его объяснение остаётся под вариантом, выбрать можно снова.
 * Верный выбор показывает объяснение с цитатами и открывает кнопку «Дальше».
 */
export function ChoiceBlock({
  choice,
  seed,
  quotes,
  videos,
  coachHint,
  wrongNote,
  onHint,
  nextLabel,
  onDone,
  copyable = false,
}: {
  choice: Choice;
  seed: string;
  quotes: SourceQuote[];
  videos: VideoRef[];
  coachHint?: string;
  /** Реплика клиента после неверного выбора (заключительный шаг сценария). */
  wrongNote?: string;
  onHint?: () => void;
  nextLabel: string;
  onDone: (tries: Try[], usedHint: boolean) => void;
  copyable?: boolean;
}) {
  const options = useMemo(() => shuffleOptions(choice, seed), [choice, seed]);
  const [tries, setTries] = useState<Try[]>([]);
  const [hintOpen, setHintOpen] = useState(false);
  const last = useRef(Date.now());
  const nextRef = useRef<HTMLButtonElement>(null);
  const hintId = useId();
  const solved = tries.some((t) => options.find((o) => o.id === t.optionId)?.correct);
  const lastOption = tries.length ? options.find((o) => o.id === tries[tries.length - 1].optionId) : undefined;

  function pick(o: ChoiceOption) {
    if (solved || tries.some((t) => t.optionId === o.id)) return;
    const now = Date.now();
    setTries((list) => [...list, { optionId: o.id, ms: now - last.current }]);
    last.current = now;
  }

  useEffect(() => {
    if (!tries.length) return;
    const id = tries[tries.length - 1].optionId;
    document.getElementById(`${hintId}-fb-${id}`)?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    if (solved) nextRef.current?.focus({ preventScroll: true });
  }, [tries.length]);

  const quotesFor = (o: ChoiceOption) => quotes.filter((q) => o.quoteIds.includes(q.id));

  return (
    <div className={styles.choiceBlock}>
      <ul className={styles.options} aria-label="Варианты ответа">
        {options.map((o, i) => {
          const tried = tries.some((t) => t.optionId === o.id);
          const cls = !tried ? styles.option : o.correct ? `${styles.option} ${styles.optionRight}` : `${styles.option} ${styles.optionWrong}`;
          return (
            <li key={o.id}>
              <button type="button" className={cls} disabled={tried || solved} onClick={() => pick(o)} data-option={o.id} data-state={!tried ? 'idle' : o.correct ? 'right' : 'wrong'}>
                <span className={styles.optLetter} aria-hidden="true">{LETTERS[i]}</span>
                <span className={styles.optText}>{o.text}</span>
                {tried ? <span className={styles.optTag}>{o.correct ? '✔ Верно' : '✖ Неверно'}</span> : null}
              </button>
              {tried ? (
                <div id={`${hintId}-fb-${o.id}`} className={o.correct ? styles.fbRight : styles.fbWrong}>
                  <p className={styles.fbHead}>{o.correct ? 'Почему это верно' : `Почему неверно: ${errorLabel(o.errorType).toLowerCase()}`}</p>
                  <p className={styles.fbText}>{o.explanation}</p>
                  {o.correct ? <Quotes quotes={quotesFor(o)} videos={videos} copyable={copyable} /> : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      <p className={styles.srOnly} role="status">
        {lastOption ? (lastOption.correct ? 'Верно.' : 'Неверно. Выберите другой ответ.') : ''}
      </p>
      {wrongNote && tries.length && tries.some((tr) => !options.find((o) => o.id === tr.optionId)?.correct) ? <p className={styles.client}>{wrongNote}</p> : null}
      {!tries.length ? <p className={styles.hint}>Выберите ответ, который вы сказали бы клиенту. В зачёт идёт первый выбор.</p> : null}
      {tries.length && !solved ? <p className={styles.hint}>Выберите другой вариант. Первый выбор уже записан, ошибаться здесь не страшно.</p> : null}
      {coachHint && !solved ? (
        hintOpen ? (
          <p className={styles.coach} role="note">
            <strong>Подсказка наставника:</strong> {coachHint}
          </p>
        ) : (
          <div className={styles.hintRow}>
            <button
              type="button"
              className={styles.secondary}
              onClick={() => {
                setHintOpen(true);
                onHint?.();
              }}
            >
              Подсказка
            </button>
            <span className={styles.hint}>Оценку не снижает.</span>
          </div>
        )
      ) : null}
      {solved ? (
        <div className={styles.stickyBar}>
          <button ref={nextRef} type="button" className={styles.primary} onClick={() => onDone(tries, hintOpen)}>
            {nextLabel}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Необязательная свободная практика: текст не оценивается, показывает только «это вы сказали» по подсказкам. */
export function PracticeBox({
  lines,
  points,
  focus,
  onSave,
}: {
  lines: [string, string];
  points: RequiredPoint[];
  focus?: string[];
  onSave?: (answers: AttemptAnswer[]) => void | Promise<void>;
}) {
  const [texts, setTexts] = useState<[string, string]>(['', '']);
  const [checked, setChecked] = useState<{ said: Set<string>; texts: [string, string] } | null>(null);
  const started = useRef(Date.now());
  const ids = [useId(), useId()];
  const patterns = points.flatMap((p) => p.anyOf);

  function compare() {
    const res = checkPractice(points, texts);
    setChecked({ said: new Set(res.filter((r) => r.said).map((r) => r.point.id)), texts });
    const answers: AttemptAnswer[] = texts
      .map((text, i) => ({ beat: (i + 1) as 1 | 2, clientLine: lines[i], text: text.trim(), ms: Date.now() - started.current }))
      .filter((a) => a.text);
    void onSave?.(answers);
  }

  return (
    <Fold title="Ответить своими словами" hint="по желанию, без оценки" label="Свободная практика">
      <p className={styles.hint}>Оценку это не меняет. Скажите вслух или напишите, как ответили бы клиенту, и посмотрите, какие мысли из подсказок вы назвали.</p>
      {focus?.length ? (
        <>
          <p className={styles.beat}>На что обратить внимание</p>
          <ul className={styles.plainList}>
            {focus.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </>
      ) : null}
      {lines.map((line, i) => (
        <div key={i} className={styles.practiceField}>
          <label htmlFor={ids[i]} className={styles.answerLabel}>
            Клиент: {line}
          </label>
          <textarea
            id={ids[i]}
            className={styles.answer}
            rows={3}
            value={texts[i]}
            placeholder="Ваш ответ (по желанию)"
            onChange={(e) => {
              const next: [string, string] = [...texts] as [string, string];
              next[i] = e.target.value;
              setTexts(next);
              setChecked(null);
            }}
          />
        </div>
      ))}
      <button type="button" className={styles.secondary} disabled={!texts.some((x) => x.trim())} onClick={compare}>
        Показать, что вы сказали
      </button>
      {checked ? (
        <div className={styles.practiceResult} role="status">
          {checked.texts.map((x, i) =>
            x.trim() ? (
              <p key={i} className={styles.mine}>
                <Highlighted text={x} patterns={patterns} />
              </p>
            ) : null,
          )}
          <HintPoints points={points} said={checked.said} />
        </div>
      ) : null}
    </Fold>
  );
}
