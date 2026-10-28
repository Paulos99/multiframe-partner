import { useEffect, useMemo, useRef, useState } from 'react';
import { buildScenarioAttempt } from './attempts';
import { ROLEPLAY_CRITERIA, answerError, evaluateScenario, scenariosForRole, wordCount, MIN_WORDS } from './engine';
import { draftKey } from './store';
import { scoreStep } from './scoring';
import { useTrainer } from './TrainerContext';
import { Flags, Page, Score, SelfAssess, go } from './ui';
import type { AttemptAnswer, CriterionId, LearningAttempt, Scenario, Scores } from './types';
import styles from './Trainer.module.css';

export type ScenarioSession = {
  scenarioId: string;
  stepIndex: number;
  answers: AttemptAnswer[];
  hintsUsed: string[];
  startedAt: number;
  reaction: string | null;
  attempt: LearningAttempt | null;
};

const stars = (n: number) => '●'.repeat(n) + '○'.repeat(Math.max(0, 5 - n));

export function ScenarioList() {
  const t = useTrainer();
  const list = scenariosForRole(t.content, t.role, t.settings.showAllRoles);
  const done = new Map<string, LearningAttempt>();
  for (const a of t.attempts) if (a.itemType === 'scenario' && a.passed) done.set(a.itemIds[0], a);
  return (
    <Page title="Ролевые разговоры" back={{ label: 'Тренажёр продаж', to: { page: 'home' } }} lead="Телефонный разговор с клиентом по шагам. Выберите ситуацию.">
      {list.length === 0 ? <p className={styles.notice}>Для вашей роли пока нет сценариев. Включите «Показывать материалы всех ролей» в настройках тренажёра.</p> : null}
      <ul className={styles.cards}>
        {list.map((s) => {
          const draft = t.drafts.find((d) => d.scenarioId === s.id);
          return (
            <li key={s.id}>
              <button type="button" className={styles.cardBtn} onClick={() => go({ page: 'scenario', id: s.id, step: 'situation' })}>
                <strong>{s.title}</strong>
                <span className={styles.meta}>
                  {s.callType} · сложность {stars(s.difficulty)} · около {s.estimatedMinutes} мин
                </span>
                {draft ? <span className={styles.tag}>Есть незавершённый разговор</span> : null}
                {done.has(s.id) ? <span className={styles.tagOk}>Засчитан</span> : null}
              </button>
            </li>
          );
        })}
      </ul>
    </Page>
  );
}

export function ScenarioSituation({ id, setSession }: { id: string; setSession: (s: ScenarioSession | null) => void }) {
  const t = useTrainer();
  const s = t.content.scenarios.scenarios.find((x) => x.id === id);
  if (!s) return <Missing />;
  const draft = t.drafts.find((d) => d.scenarioId === id);
  const begin = async (fromDraft: boolean) => {
    if (!fromDraft) {
      await t.store.deleteDraft(t.who.userId, id);
      await t.refresh();
    }
    setSession({
      scenarioId: id,
      stepIndex: fromDraft && draft ? draft.stepIndex : 0,
      answers: fromDraft && draft ? draft.answers : [],
      hintsUsed: fromDraft && draft ? draft.hintsUsed : [],
      startedAt: fromDraft && draft ? new Date(draft.startedAt).getTime() : Date.now(),
      reaction: null,
      attempt: null,
    });
    go({ page: 'scenario', id, step: 'talk' });
  };
  return (
    <Page title={s.title} back={{ label: 'Ролевые разговоры', to: { page: 'scenarios' } }}>
      <section className={styles.block} aria-label="Ситуация">
        <h4>Ситуация</h4>
        <p>{s.setup}</p>
        <p>
          <strong>Клиент:</strong> {s.persona.name}, {s.persona.age}. {s.persona.description}
        </p>
        <p>
          <strong>Настроение:</strong> {s.persona.mood}
        </p>
        <p>
          <strong>Ваша цель:</strong> {s.goal}
        </p>
        <h4>Что будет считаться успехом</h4>
        <ul>
          {s.successCriteria.map((c) => (
            <li key={c.id}>{c.text}</li>
          ))}
        </ul>
        <p className={styles.hint}>
          {s.callType} · около {s.estimatedMinutes} мин · шагов: {s.steps.length + 1}
        </p>
      </section>
      <div className={styles.actions}>
        {draft ? (
          <>
            <button type="button" className={styles.primary} onClick={() => void begin(true)}>
              Продолжить разговор
            </button>
            <button type="button" className={styles.secondary} onClick={() => void begin(false)}>
              Начать заново
            </button>
          </>
        ) : (
          <button type="button" className={styles.primary} onClick={() => void begin(false)}>
            Начать разговор
          </button>
        )}
      </div>
    </Page>
  );
}

function Missing() {
  return (
    <Page title="Не найдено" back={{ label: 'Тренажёр продаж', to: { page: 'home' } }}>
      <p>Такой карточки нет. Вернитесь в тренажёр и выберите другую.</p>
    </Page>
  );
}

export function ScenarioTalk({
  id,
  session,
  setSession,
}: {
  id: string;
  session: ScenarioSession | null;
  setSession: (s: ScenarioSession | null) => void;
}) {
  const t = useTrainer();
  const s = t.content.scenarios.scenarios.find((x) => x.id === id);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [hintOpen, setHintOpen] = useState(false);
  const beatStart = useRef(Date.now());
  const area = useRef<HTMLTextAreaElement>(null);

  const valid = session && s && session.scenarioId === id;
  useEffect(() => {
    if (!valid) go({ page: 'scenario', id, step: 'situation' }, 'replace');
  }, [valid, id]);
  useEffect(() => {
    beatStart.current = Date.now();
    setText('');
    setHintOpen(false);
    area.current?.focus();
  }, [session?.stepIndex, session?.answers.length, session?.reaction]);

  if (!valid || !s) return null;
  const objById = new Map(t.content.objections.objections.map((o) => [o.id, o]));
  const isClosing = session.stepIndex >= s.steps.length;
  const step = isClosing ? null : s.steps[session.stepIndex];
  const stepKey = isClosing ? 'closing' : step!.id;
  const doneBeats = session.answers.filter((a) => a.stepId === stepKey).length;
  const beat: 1 | 2 = doneBeats >= 1 ? 2 : 1;
  const obj = step ? objById.get(step.objectionId) : undefined;
  const clientLine = isClosing ? s.closing.clientLine : beat === 1 ? (obj?.clientPhrasing[step!.clientPhrasingIndex] ?? '') : (obj?.pushback ?? '');

  async function persist(next: ScenarioSession) {
    setSession(next);
    if (next.stepIndex <= s!.steps.length) {
      await t.store.putDraft({
        key: draftKey(t.who.userId, id),
        userId: t.who.userId,
        scenarioId: id,
        savedAt: new Date().toISOString(),
        stepIndex: next.stepIndex,
        answers: next.answers.filter((a) => a.stepId !== 'closing'),
        hintsUsed: next.hintsUsed,
        startedAt: new Date(next.startedAt).toISOString(),
      });
      await t.refresh();
    }
  }

  function submit() {
    const problem = answerError(text);
    if (problem) {
      setError(problem);
      area.current?.focus();
      return;
    }
    setError(null);
    const answer: AttemptAnswer = {
      stepId: stepKey,
      beat,
      clientLine,
      text: text.trim(),
      ms: Date.now() - beatStart.current,
      usedHint: step ? session!.hintsUsed.includes(step.id) : false,
    };
    const answers = [...session!.answers, answer];
    if (isClosing) {
      void persist({ ...session!, answers, reaction: null });
      go({ page: 'scenario', id, step: 'result' });
      return;
    }
    if (beat < step!.beats) {
      void persist({ ...session!, answers });
      return;
    }
    // шаг закончен: реакция клиента
    const b1 = answers.find((a) => a.stepId === step!.id && a.beat === 1)?.text ?? '';
    const b2 = answers.find((a) => a.stepId === step!.id && a.beat === 2)?.text ?? '';
    const r = scoreStep(b1, b2, obj!, step!.clientPhrasingIndex, t.content.scoring);
    const passed = r.cov >= 0.6 && !r.hits.some((h) => h.severity === 'critical');
    void persist({ ...session!, answers, stepIndex: session!.stepIndex + 1, reaction: passed ? step!.afterPass : step!.afterFail });
  }

  const transcript = session.answers.filter((a) => a.stepId !== stepKey || a.beat < beat);
  const total = s.steps.length + 1;

  return (
    <Page title={s.title} back={{ label: 'Выйти (разговор сохранится)', to: { page: 'scenario', id, step: 'situation' } }}>
      <p className={styles.step}>
        Шаг {Math.min(session.stepIndex + 1, total)} из {total}
      </p>
      <ol className={styles.chat} aria-label="Разговор">
        {transcript.map((a, i) => (
          <li key={i}>
            <p className={styles.client}>Клиент: {a.clientLine}</p>
            <p className={styles.mine}>Вы: {a.text}</p>
          </li>
        ))}
      </ol>
      {session.reaction ? (
        <div className={styles.block} aria-live="polite">
          <p className={styles.client}>Клиент: {session.reaction}</p>
          <button type="button" className={styles.primary} onClick={() => setSession({ ...session, reaction: null })}>
            Дальше
          </button>
        </div>
      ) : (
        <div className={styles.talk}>
          <blockquote className={styles.client}>{clientLine}</blockquote>
          <label className={styles.answerLabel} htmlFor="scenario-answer">
            {isClosing ? 'Ваша заключительная реплика' : 'Ваш ответ клиенту'}
          </label>
          <textarea
            id="scenario-answer"
            ref={area}
            className={styles.answer}
            rows={6}
            value={text}
            placeholder="Говорите так, как сказали бы по телефону"
            onChange={(e) => {
              setText(e.target.value);
              if (error) setError(null);
            }}
            aria-invalid={error ? true : undefined}
          />
          <p className={styles.count}>
            Слов: {wordCount(text)} из {MIN_WORDS}
          </p>
          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}
          {hintOpen && step ? (
            <p className={styles.coach} role="note">
              <strong>Подсказка наставника:</strong> {step.coachHint}
            </p>
          ) : null}
          {isClosing ? <p className={styles.hint}>Закрепите следующий шаг: что, когда и кто делает.</p> : null}
          <div className={styles.stickyBar}>
            <button type="button" className={styles.primary} onClick={submit}>
              Ответить
            </button>
            {step && !hintOpen ? (
              <button
                type="button"
                className={styles.secondary}
                onClick={() => {
                  setHintOpen(true);
                  if (!session.hintsUsed.includes(step.id)) setSession({ ...session, hintsUsed: [...session.hintsUsed, step.id] });
                }}
              >
                Подсказка
              </button>
            ) : null}
          </div>
          {step && !hintOpen ? <p className={styles.hint}>Подсказка снижает оценку за ответ на возражение на один балл.</p> : null}
        </div>
      )}
    </Page>
  );
}

export function ScenarioResult({ id, session, setSession }: { id: string; session: ScenarioSession | null; setSession: (s: ScenarioSession | null) => void }) {
  const t = useTrainer();
  const s = t.content.scenarios.scenarios.find((x) => x.id === id) as Scenario | undefined;
  const ok = Boolean(session && s && session.scenarioId === id && session.answers.some((a) => a.stepId === 'closing'));
  useEffect(() => {
    if (!ok) go({ page: 'scenario', id, step: 'situation' }, 'replace');
  }, [ok, id]);
  const evaluation = useMemo(() => (ok && s && session ? evaluateScenario(s, session.answers, session.hintsUsed, t.content) : null), [ok, s, session, t.content]);
  const [manual, setManual] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  if (!ok || !s || !session || !evaluation) return null;
  const attempt = session.attempt;
  const objById = new Map(t.content.objections.objections.map((o) => [o.id, o]));

  async function save(scores: Scores, notes: Partial<Record<CriterionId, string>>) {
    setBusy(true);
    try {
      const built = buildScenarioAttempt({
        who: t.who,
        content: t.content,
        startedAt: new Date(session!.startedAt),
        now: new Date(),
        cards: new Map(t.cards.map((c) => [c.key, c])),
        scenario: s!,
        answers: session!.answers,
        evaluation: evaluation!,
        selfScores: scores,
        selfNotes: notes,
        manualChecks: manual,
      });
      await t.commit(built);
      await t.store.deleteDraft(t.who.userId, id);
      await t.refresh();
      setSession({ ...session!, attempt: built.attempt });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page title={`Итог: ${s.title}`} back={{ label: 'Ролевые разговоры', to: { page: 'scenarios' } }}>
      <section className={styles.block} aria-label="Критерии успеха">
        <h4>Достигли ли цели</h4>
        <ul className={styles.points}>
          {evaluation.criteria.map((c) => {
            const isManual = c.ok === null;
            const checked = isManual ? manual.includes(c.id) : c.ok;
            return (
              <li key={c.id} className={checked ? styles.pointOk : styles.pointMiss}>
                {isManual ? (
                  <label className={styles.manualCheck}>
                    <input
                      type="checkbox"
                      checked={manual.includes(c.id)}
                      disabled={Boolean(attempt)}
                      onChange={(e) => setManual((m) => (e.target.checked ? [...m, c.id] : m.filter((x) => x !== c.id)))}
                    />
                    <span>{c.text} (отметьте сами)</span>
                  </label>
                ) : (
                  <>
                    <span className={styles.mark2} aria-hidden="true">{c.ok ? '✔' : '✖'}</span>
                    <span>{c.text}</span>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      </section>
      <section className={styles.block} aria-label="Разбор шагов">
        <h4>Разбор по шагам</h4>
        {evaluation.steps.map((st) => {
          const o = objById.get(st.objectionId);
          return (
            <div key={st.stepId} className={styles.stepResult}>
              <strong>{o?.panel.title ?? st.stepId}</strong> {st.passed ? <span className={styles.tagOk}>Засчитан</span> : <span className={styles.tag}>Не засчитан</span>}
              {st.usedHint ? <span className={styles.tag}> Подсказка</span> : null}
              {o ? (
                <ul className={styles.points}>
                  {o.requiredPoints.map((p) => {
                    const hit = st.matchedPointIds.includes(`${o.id}:${p.id}`);
                    return (
                      <li key={p.id} className={hit ? styles.pointOk : styles.pointMiss}>
                        <span className={styles.mark2} aria-hidden="true">{hit ? '✔' : '✖'}</span>
                        <span>{hit ? 'Названо' : 'Не названо'}: {p.text}</span>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
              {o ? (
                <details className={styles.checkSelf}>
                  <summary>Эталон</summary>
                  <p className={styles.refAnswer}>{o.referenceAnswer}</p>
                  {s.steps.find((x) => x.id === st.stepId)?.beats === 2 ? <p className={styles.refAnswer}>{o.pushbackReferenceAnswer}</p> : null}
                </details>
              ) : null}
            </div>
          );
        })}
        <h4>Что нарушено</h4>
        <Flags flags={evaluation.flags} content={t.content} />
        <h4>Закрытие разговора</h4>
        <p className={styles.hint}>Примеры хорошего завершения:</p>
        <ul>
          {s.closing.goodExamples.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      </section>
      {attempt ? (
        <section className={styles.result} aria-label="Итог разговора" aria-live="polite">
          <p className={styles.bigScore}>
            <Score value={attempt.total} /> <span>из 5</span>
          </p>
          <p className={attempt.passed ? styles.okLine : styles.failLine}>{attempt.passed ? '✔ Разговор засчитан' : '✖ Разговор не засчитан'}</p>
          <p className={styles.hint}>Предварительная оценка и ваша сохранены отдельно.</p>
          <div className={styles.actions}>
            <button type="button" className={styles.primary} onClick={() => { setSession(null); go({ page: 'scenario', id, step: 'situation' }); }}>
              Пройти ещё раз
            </button>
            <button type="button" className={styles.secondary} onClick={() => { setSession(null); go({ page: 'scenarios' }); }}>
              К списку разговоров
            </button>
          </div>
        </section>
      ) : (
        <SelfAssess criteria={ROLEPLAY_CRITERIA} content={t.content} auto={evaluation.autoScores} busy={busy} onSubmit={(sc, n) => void save(sc, n)} />
      )}
    </Page>
  );
}
