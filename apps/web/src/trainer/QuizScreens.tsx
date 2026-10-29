import { useEffect, useMemo, useRef, useState } from 'react';
import { buildQuizAttempt } from './attempts';
import { buildQuiz, isCorrectAnswer, questionsForRole, shuffledOptions, summarizeQuiz, type QuizKind } from './engine';
import { useTrainer } from './TrainerContext';
import { Fold, Page, Quotes, Score, StepBar, go } from './ui';
import type { LearningAttempt, QuizAnswer, QuizQuestion } from './types';
import styles from './Trainer.module.css';

export type QuizSession = {
  kind: QuizKind;
  topic?: string;
  ids: string[];
  index: number;
  answers: QuizAnswer[];
  selected: string[];
  checked: boolean;
  startedAt: number;
  seed: string;
  attempt: LearningAttempt | null;
};

const KINDS: { kind: QuizKind; title: string; text: string }[] = [
  { kind: 'quick', title: 'Быстрая (10 вопросов)', text: 'Новые вопросы вперёд, затем уже знакомые.' },
  { kind: 'topic', title: 'По теме', text: 'Выберите тему и проверьте себя.' },
  { kind: 'traps', title: 'Ловушки', text: 'Вопросы, где легко пообещать лишнее.' },
  { kind: 'repeat', title: 'Повторить', text: 'Вопросы, которые пора повторить по расписанию.' },
];

export function QuizStart({ setSession }: { setSession: (s: QuizSession | null) => void }) {
  const t = useTrainer();
  const pool = questionsForRole(t.content, t.role, t.settings.showAllRoles);
  const [topic, setTopic] = useState('');
  const [empty, setEmpty] = useState<string | null>(null);
  const topics = t.content.quiz.topics.filter((x) => pool.some((q) => q.topic === x.id));
  const now = new Date();

  function start(kind: QuizKind) {
    const seed = `${t.who.userId}:${now.getTime()}`;
    const qs = buildQuiz(t.content, t.role, t.settings.showAllRoles, kind, { topic: topic || topics[0]?.id, cards: t.cards, now, seed });
    if (!qs.length) {
      setEmpty(kind === 'repeat' ? 'Сейчас повторять нечего: все вопросы ещё не вернулись по расписанию. Выберите «Быструю» проверку.' : 'Для этого выбора вопросов нет.');
      return;
    }
    setEmpty(null);
    setSession({ kind, topic: kind === 'topic' ? topic || topics[0]?.id : undefined, ids: qs.map((q) => q.id), index: 0, answers: [], selected: [], checked: false, startedAt: now.getTime(), seed, attempt: null });
    go({ page: 'quiz', step: 'run' });
  }

  return (
    <Page title="Проверка знаний" back={{ label: 'Тренажёр продаж', to: { page: 'home' } }} lead="Один вопрос на экране. После ответа сразу видно верный вариант и источник. Засчитывается от 80 % верных.">
      {empty ? (
        <p className={styles.notice} role="status">
          {empty}
        </p>
      ) : null}
      <ul className={styles.cards}>
        {KINDS.filter((k) => k.kind !== 'topic').map((k) => (
          <li key={k.kind}>
            <button type="button" className={styles.cardBtn} onClick={() => start(k.kind)}>
              <strong>{k.title}</strong>
              <span className={styles.meta}>{k.text}</span>
            </button>
          </li>
        ))}
        <li>
          <div className={styles.cardBox}>
            <strong>По теме</strong>
            <span className={styles.meta}>Выберите тему и проверьте себя только по ней.</span>
            <label className={styles.fieldLine}>
              Тема
              <select value={topic || topics[0]?.id || ''} onChange={(e) => setTopic(e.target.value)}>
                {topics.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.title}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className={styles.secondary} onClick={() => start('topic')}>
              Начать по теме
            </button>
          </div>
        </li>
      </ul>
    </Page>
  );
}

export function QuizRun({ session, setSession }: { session: QuizSession | null; setSession: (s: QuizSession | null) => void }) {
  const t = useTrainer();
  const byId = useMemo(() => new Map(t.content.quiz.questions.map((q) => [q.id, q])), [t.content]);
  const startedQ = useRef(Date.now());
  useEffect(() => {
    if (!session) go({ page: 'quiz', step: 'start' }, 'replace');
  }, [session]);
  useEffect(() => {
    startedQ.current = Date.now();
  }, [session?.index]);
  if (!session) return null;
  const q = byId.get(session.ids[session.index]);
  if (!q) return null;
  const options = shuffledOptions(q, session.seed);
  const total = session.ids.length;
  const last = session.index + 1 >= total;
  const lastAnswer = session.answers[session.answers.length - 1];

  function toggle(id: string) {
    if (session!.checked) return;
    if (q!.type === 'single') setSession({ ...session!, selected: [id] });
    else setSession({ ...session!, selected: session!.selected.includes(id) ? session!.selected.filter((x) => x !== id) : [...session!.selected, id] });
  }

  function check() {
    if (!session!.selected.length) return;
    const correct = isCorrectAnswer(q!, session!.selected);
    setSession({
      ...session!,
      checked: true,
      answers: [...session!.answers, { questionId: q!.id, selected: session!.selected, correct, ms: Date.now() - startedQ.current }],
    });
  }

  async function next() {
    if (!last) {
      setSession({ ...session!, index: session!.index + 1, selected: [], checked: false });
      return;
    }
    const questions = session!.ids.map((id) => byId.get(id)).filter((x): x is QuizQuestion => Boolean(x));
    const built = buildQuizAttempt({
      who: t.who,
      content: t.content,
      startedAt: new Date(session!.startedAt),
      now: new Date(),
      cards: new Map(t.cards.map((c) => [c.key, c])),
      questions,
      answers: session!.answers,
    });
    await t.commit(built);
    setSession({ ...session!, attempt: built.attempt });
    go({ page: 'quiz', step: 'result' });
  }

  return (
    <Page title="Проверка знаний" back={{ label: 'Выбор проверки', to: { page: 'quiz', step: 'start' } }}>
      <StepBar current={session.checked ? session.index + 1 : session.index} total={total} label={`Вопрос ${session.index + 1} из ${total}`} />
      <fieldset className={styles.question} disabled={session.checked}>
        <legend>{q.question}</legend>
        {q.type === 'multi' ? <p className={styles.hint}>Можно выбрать несколько вариантов.</p> : null}
        <ul className={styles.options}>
          {options.map((o) => {
            const sel = session.selected.includes(o.id);
            const right = q.correctOptionIds.includes(o.id);
            const cls = session.checked ? (right ? styles.optRight : sel ? styles.optWrong : styles.opt) : sel ? styles.optOn : styles.opt;
            return (
              <li key={o.id}>
                <label className={cls}>
                  <input type={q.type === 'single' ? 'radio' : 'checkbox'} name="quiz-option" checked={sel} onChange={() => toggle(o.id)} />
                  <span>
                    {o.text}
                    {session.checked ? <strong>{right ? ' — верно' : sel ? ' — неверно' : ''}</strong> : null}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </fieldset>
      {session.checked ? (
        <section className={styles.block} aria-live="polite" aria-label="Разбор вопроса">
          <p className={lastAnswer?.correct ? styles.okLine : styles.failLine}>{lastAnswer?.correct ? '✔ Верно' : '✖ Неверно'}</p>
          <p>{q.explanation}</p>
          {q.sourceQuotes.length > 0 ? (
            <Fold title="Источник" hint={`цитат: ${q.sourceQuotes.length}`} label="Источник">
              <Quotes quotes={q.sourceQuotes} videos={t.content.quiz.videos} copyable={t.role === 'stp_admin'} />
            </Fold>
          ) : null}
        </section>
      ) : null}
      <div className={styles.stickyBar}>
        {session.checked ? (
          <button type="button" className={styles.primary} onClick={() => void next()}>
            {last ? 'Показать итог' : 'Дальше'}
          </button>
        ) : (
          <button type="button" className={styles.primary} onClick={check} disabled={!session.selected.length}>
            Проверить
          </button>
        )}
      </div>
    </Page>
  );
}

export function QuizResult({ session, setSession, startDrill }: { session: QuizSession | null; setSession: (s: QuizSession | null) => void; startDrill: (objectionId: string) => void }) {
  const t = useTrainer();
  const ok = Boolean(session?.attempt);
  useEffect(() => {
    if (!ok) go({ page: 'quiz', step: 'start' }, 'replace');
  }, [ok]);
  if (!session || !session.attempt) return null;
  const questions = session.ids.map((id) => t.content.quiz.questions.find((q) => q.id === id)).filter((x): x is QuizQuestion => Boolean(x));
  const sum = summarizeQuiz(t.content, questions, session.answers);
  const a = session.attempt;
  return (
    <Page title="Итог проверки" back={{ label: 'Тренажёр продаж', to: { page: 'home' } }}>
      <p className={styles.bigScore}>
        <Score value={sum.percent} />% <span>верных: {sum.correct} из {sum.count}</span>
      </p>
      <p className={a.passed ? styles.okLine : styles.failLine}>{a.passed ? '✔ Засчитано (от 80 %)' : '✖ Не засчитано: нужно не меньше 80 %'}</p>
      <section className={styles.block} aria-label="По темам">
        <h4>По темам</h4>
        <ul className={styles.list}>
          {sum.byTopic.map((r) => (
            <li key={r.topic}>
              <span>{r.title}</span>
              <span>
                {r.correct} из {r.count}
              </span>
            </li>
          ))}
        </ul>
      </section>
      {sum.mistakes.length ? (
        <section className={styles.block} aria-label="Ошибки">
          <h4>Ошибки</h4>
          <ul className={styles.mistakes}>
            {sum.mistakes.map(({ question }) => {
              const rel = question.relatedObjectionIds[0];
              const relObj = rel ? t.content.objections.objections.find((o) => o.id === rel) : undefined;
              return (
                <li key={question.id}>
                  <p>
                    <strong>{question.question}</strong>
                  </p>
                  <p>{question.explanation}</p>
                  {question.isTrap ? <p className={styles.tag}>Вопрос-ловушка</p> : null}
                  {relObj ? (
                    <button
                      type="button"
                      className={styles.secondary}
                      onClick={() => {
                        startDrill(relObj.id);
                        go({ page: 'drill', objectionId: relObj.id });
                      }}
                    >
                      Потренировать: {relObj.panel.title}
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : (
        <p className={styles.okLine}>✔ Ошибок нет.</p>
      )}
      <div className={styles.actions}>
        <button type="button" className={styles.primary} onClick={() => { setSession(null); go({ page: 'quiz', step: 'start' }); }}>
          Ещё одна проверка
        </button>
        <button type="button" className={styles.secondary} onClick={() => { setSession(null); go({ page: 'home' }); }}>
          В тренажёр
        </button>
      </div>
    </Page>
  );
}
