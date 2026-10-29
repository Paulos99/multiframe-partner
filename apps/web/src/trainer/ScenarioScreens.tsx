import { useEffect, useMemo, useRef } from 'react';
import { buildScenarioAttempt, scenarioCriteria, scenarioPlayed } from './attempts';
import { errorLabel, makePick, scenarioSlots, slotChoice, slotClientLine, scoreChoices } from './choice';
import { buildTranscript, clientSays, reactionAfterPicks } from './dialog';
import { ChoiceBlock } from './ChoiceParts';
import { scenariosForRole } from './engine';
import { CriteriaList, ResultHead } from './Results';
import { draftKey } from './store';
import { useTrainer } from './TrainerContext';
import { Fold, Page, StepBar, go } from './ui';
import type { LearningAttempt, Pick, Scenario } from './types';
import styles from './Trainer.module.css';

export type ScenarioSession = {
  scenarioId: string;
  /** Завершённые выборы по порядку реплик; позиция в разговоре = их число. */
  picks: Pick[];
  hintsUsed: string[];
  startedAt: number;
  /** Реплика клиента после шага (показывается один раз, в черновик не пишется). */
  reaction: string | null;
  attempt: LearningAttempt | null;
  id: number;
};

const stars = (n: number) => '●'.repeat(n) + '○'.repeat(Math.max(0, 5 - n));
const DIFFICULTY = ['', 'очень лёгкий', 'лёгкий', 'средний', 'сложный', 'очень сложный'];
export function ScenarioList() {
  const t = useTrainer();
  const list = scenariosForRole(t.content, t.role, t.settings.showAllRoles);
  const done = new Map<string, LearningAttempt>();
  for (const a of t.attempts) if (a.itemType === 'scenario' && a.passed) done.set(a.itemIds[0], a);
  return (
    <Page title="Ролевые разговоры" back={{ label: 'Тренажёр продаж', to: { page: 'home' } }} lead="Телефонный разговор с клиентом по шагам. Выберите ситуацию, прочитайте вводные и начните.">
      {list.length === 0 ? <p className={styles.notice}>Для вашей роли пока нет сценариев. Включите «Показывать материалы всех ролей» в настройках тренажёра.</p> : null}
      <ul className={styles.cards}>
        {list.map((s) => {
          const draft = t.drafts.find((d) => d.scenarioId === s.id);
          return (
            <li key={s.id}>
              <button type="button" className={styles.cardBtn} onClick={() => go({ page: 'scenario', id: s.id, step: 'situation' })}>
                <strong>{s.title}</strong>
                <span className={styles.meta}>{s.callType}</span>
                <span className={styles.chips}>
                  <span className={styles.chip} role="img" aria-label={`Сложность: ${DIFFICULTY[s.difficulty] ?? s.difficulty}`}>
                    {stars(s.difficulty)}
                  </span>
                  <span className={styles.chip}>около {s.estimatedMinutes} мин</span>
                  {draft ? <span className={styles.tag}>Есть незавершённый разговор</span> : null}
                  {done.has(s.id) ? <span className={styles.tagOk}>Засчитан</span> : null}
                </span>
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
      picks: fromDraft && draft ? draft.picks : [],
      hintsUsed: fromDraft && draft ? draft.hintsUsed : [],
      startedAt: fromDraft && draft ? new Date(draft.startedAt).getTime() : Date.now(),
      reaction: null,
      attempt: null,
      id: Date.now(),
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
        <p className={styles.chips}>
          <span className={styles.chip}>{s.callType}</span>
          <span className={styles.chip}>около {s.estimatedMinutes} мин</span>
          <span className={styles.chip}>возражений: {s.steps.length}, затем следующий шаг</span>
        </p>
      </section>
      <section className={styles.block} aria-label="Что считается успехом">
        <h4>Что будет считаться успехом</h4>
        <p className={styles.hint}>Клиент говорит, вы выбираете ответ из четырёх. В зачёт идёт первый выбор.</p>
        <ul>
          {s.successCriteria.map((c) => (
            <li key={c.id}>{c.text}</li>
          ))}
        </ul>
      </section>
      <div className={`${styles.stickyBar} ${styles.actions}`}>
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

export function ScenarioTalk({ id, session, setSession }: { id: string; session: ScenarioSession | null; setSession: (s: ScenarioSession | null) => void }) {
  const t = useTrainer();
  const s = t.content.scenarios.scenarios.find((x) => x.id === id);
  const valid = Boolean(session && s && session.scenarioId === id);
  const slots = useMemo(() => (s ? scenarioSlots(s) : []), [s]);
  const finished = valid && session!.picks.length >= slots.length;
  useEffect(() => {
    if (!valid) go({ page: 'scenario', id, step: 'situation' }, 'replace');
    else if (finished && !session!.reaction) go({ page: 'scenario', id, step: 'result' }, 'replace');
  }, [valid, finished, id]);

  const shown = useRef(false);
  const progress = valid ? `${session!.picks.length}:${session!.reaction ? 1 : 0}` : '';
  useEffect(() => {
    // каждая новая реплика или ответ клиента начинается с верха страницы
    if (!shown.current) {
      shown.current = true;
      return;
    }
    window.scrollTo?.({ top: 0 });
  }, [progress]);

  if (!valid || !s || !session) return null;
  const objById = new Map(t.content.objections.objections.map((o) => [o.id, o]));
  const stepsTotal = s.steps.length + 1;
  const slot = slots[Math.min(session.picks.length, slots.length - 1)];
  const stepNo = slot.beat === 'closing' ? stepsTotal : s.steps.findIndex((x) => x.id === slot.stepId) + 1;
  const stepDone = finished ? stepsTotal : stepNo - 1;

  async function persist(next: ScenarioSession) {
    setSession(next);
    if (next.picks.length < slots.length) {
      await t.store.putDraft({
        key: draftKey(t.who.userId, id),
        userId: t.who.userId,
        scenarioId: id,
        savedAt: new Date().toISOString(),
        picks: next.picks,
        hintsUsed: next.hintsUsed,
        startedAt: new Date(next.startedAt).toISOString(),
      });
      await t.refresh();
    }
  }

  const transcript = buildTranscript(s, session.picks, Boolean(session.reaction));
  const who = s.persona.name;
  const label = finished ? `Шаг ${stepsTotal} из ${stepsTotal}` : `Шаг ${stepNo} из ${stepsTotal}`;

  return (
    <Page title={s.title} back={{ label: 'Выйти (разговор сохранится)', to: { page: 'scenario', id, step: 'situation' } }}>
      <StepBar current={session.reaction && !finished ? stepDone + 1 : stepDone} total={stepsTotal} label={label} />
      {transcript.length ? (
        <ol className={styles.chat} aria-label="Разговор">
          {transcript.map((entry, i) => (
            <li key={i}>
              <p className={styles.client}>{entry.client}</p>
              <p className={styles.mine}>Вы: {entry.mine}</p>
              {entry.reaction ? <p className={styles.client}>{entry.reaction}</p> : null}
            </li>
          ))}
        </ol>
      ) : null}
      {session.reaction ? (
        <div className={styles.block} aria-live="polite">
          <p className={styles.client}>{clientSays(session.reaction, who)}</p>
          <div className={styles.stickyBar}>
            <button
              type="button"
              className={styles.primary}
              onClick={() => (finished ? go({ page: 'scenario', id, step: 'result' }) : setSession({ ...session, reaction: null }))}
            >
              {finished ? 'К итогу разговора' : 'Дальше'}
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.talk}>
          {slot.beat === 'closing' ? <p className={styles.beat}>Заключительная реплика · выберите следующий шаг</p> : <p className={styles.beat}>{slot.beat === 1 ? 'Реплика клиента' : 'Клиент не согласен и повторяет'}</p>}
          <blockquote className={styles.client}>{clientSays(slotClientLine(s, slot), who)}</blockquote>
          <ChoiceBlock
            key={`${session.id}-${slot.key}`}
            choice={slotChoice(s, slot)}
            seed={`${session.id}:${slot.key}`}
            quotes={slot.objectionId ? (objById.get(slot.objectionId)?.sourceQuotes ?? []) : []}
            videos={t.content.objections.videos}
            copyable={t.role === 'stp_admin'}
            coachHint={slot.beat === 'closing' ? undefined : s.steps.find((x) => x.id === slot.stepId)?.coachHint}
            wrongNote={slot.beat === 'closing' ? clientSays(s.closing.afterWrong, who) : undefined}
            onHint={() => {
              if (slot.stepId && !session.hintsUsed.includes(slot.stepId)) setSession({ ...session, hintsUsed: [...session.hintsUsed, slot.stepId] });
            }}
            nextLabel={slot.beat === 'closing' ? 'Закончить разговор' : slot.beat === 1 ? 'Дальше: клиент отвечает' : 'Дальше'}
            onDone={(tries, usedHint) => {
              const pick = makePick({
                stepId: slot.stepId,
                objectionId: slot.objectionId,
                beat: slot.beat,
                clientLine: slotClientLine(s, slot),
                tries,
                choice: slotChoice(s, slot),
                usedHint,
              });
              const picks = [...session.picks, pick];
              void persist({ ...session, picks, reaction: reactionAfterPicks(s!, slots, picks) });
            }}
          />
        </div>
      )}
    </Page>
  );
}

export function ScenarioResult({ id, session, setSession }: { id: string; session: ScenarioSession | null; setSession: (s: ScenarioSession | null) => void }) {
  const t = useTrainer();
  const s = t.content.scenarios.scenarios.find((x) => x.id === id) as Scenario | undefined;
  const slotsLen = s ? scenarioSlots(s).length : 0;
  const ok = Boolean(session && s && session.scenarioId === id && session.picks.length >= slotsLen);
  const saving = useRef(false);
  useEffect(() => {
    if (!ok) {
      go({ page: 'scenario', id, step: 'situation' }, 'replace');
      return;
    }
    if (session!.attempt || saving.current) return;
    saving.current = true;
    const built = buildScenarioAttempt({
      who: t.who,
      content: t.content,
      startedAt: new Date(session!.startedAt),
      now: new Date(),
      cards: new Map(t.cards.map((c) => [c.key, c])),
      scenario: s!,
      picks: session!.picks,
    });
    void (async () => {
      await t.commit(built);
      await t.store.deleteDraft(t.who.userId, id);
      await t.refresh();
      setSession({ ...session!, attempt: built.attempt });
    })();
  }, [ok]);
  if (!ok || !s || !session) return null;
  const attempt = session.attempt;
  if (!attempt) return <Page title={`Итог: ${s.title}`}><p className={styles.hint} role="status">Сохраняем разговор…</p></Page>;
  const picks = attempt.picks ?? [];
  const criteria = scenarioCriteria(s, picks);
  const score = scoreChoices(picks, scenarioPlayed(s), t.content.scoring);
  const objById = new Map(t.content.objections.objections.map((o) => [o.id, o]));
  const slots = scenarioSlots(s);
  const optionOf = (_pick: Pick, i: number, optionId: string) => slotChoice(s, slots[i]).options.find((o) => o.id === optionId);
  const closingPick = picks.find((p) => p.beat === 'closing');

  return (
    <Page title={`Итог: ${s.title}`} back={{ label: 'Ролевые разговоры', to: { page: 'scenarios' } }}>
      <section className={styles.result} aria-label="Итог разговора" aria-live="polite">
        <ResultHead count={picks.length} firstTry={score.firstTryCount} passed={attempt.passed} kind="scenario" />
      </section>
      <section className={styles.block} aria-label="Критерии успеха">
        <h4>Достигли ли цели</h4>
        <ul className={styles.points}>
          {criteria.map((c) => (
            <li key={c.id} className={c.ok ? styles.pointOk : styles.pointMiss}>
              <span className={styles.mark2} aria-hidden="true">{c.ok ? '✔' : '✖'}</span>
              <span>{c.text}</span>
            </li>
          ))}
        </ul>
      </section>
      <CriteriaList scores={score.criteria} content={t.content} />
      <Fold title="Разбор по шагам" hint={`возражений: ${s.steps.length}`} label="Разбор шагов">
        {s.steps.map((step) => {
          const o = objById.get(step.objectionId);
          const stepPicks = picks.map((p, i) => ({ p, i })).filter(({ p }) => p.stepId === step.id);
          const clean = stepPicks.every(({ p }) => p.firstTry);
          return (
            <div key={step.id} className={styles.stepResult}>
              <strong>{o?.panel.title ?? step.id}</strong> {clean ? <span className={styles.tagOk}>Верно с первой попытки</span> : <span className={styles.tag}>Были ошибки</span>}
              {stepPicks.some(({ p }) => p.usedHint) ? <span className={styles.tag}> Подсказка</span> : null}
              <ul className={styles.plainList}>
                {stepPicks.map(({ p, i }) => {
                  const right = optionOf(p, i, p.optionId);
                  return (
                    <li key={i}>
                      <span>{p.firstTry ? '✔' : '✖'} Реплика {p.beat}: </span>
                      «{right?.text}»
                      {p.tries
                        .filter((tr) => !optionOf(p, i, tr.optionId)?.correct)
                        .map((tr) => {
                          const w = optionOf(p, i, tr.optionId);
                          return (
                            <span key={tr.optionId} className={styles.fbInline}>
                              <br />
                              <strong>Вы выбрали ошибочный ответ ({errorLabel(w?.errorType).toLowerCase()}):</strong> «{w?.text}» {w?.explanation}
                            </span>
                          );
                        })}
                    </li>
                  );
                })}
              </ul>
              {o ? (
                <details className={styles.checkSelf}>
                  <summary>Эталон</summary>
                  <p className={styles.refAnswer}>{o.referenceAnswer}</p>
                  <p className={styles.refAnswer}>{o.pushbackReferenceAnswer}</p>
                </details>
              ) : null}
            </div>
          );
        })}
        <h4>Закрытие разговора</h4>
        {closingPick ? <p>{closingPick.firstTry ? '✔' : '✖'} Выбранный следующий шаг: «{optionOf(closingPick, slots.length - 1, closingPick.optionId)?.text}»</p> : null}
        <p className={styles.hint}>Примеры хорошего завершения:</p>
        <ul>
          {s.closing.goodExamples.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      </Fold>
      {s.practiceFocus.length ? (
        <Fold title="Для свободной практики" hint="по желанию, без оценки" label="Свободная практика">
          <p className={styles.hint}>Проговорите этот разговор вслух своими словами. Оценку это не меняет.</p>
          <ul className={styles.plainList}>
            {s.practiceFocus.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </Fold>
      ) : null}
      <div className={`${styles.stickyBar} ${styles.actions}`}>
        <button type="button" className={styles.primary} onClick={() => { setSession(null); go({ page: 'scenario', id, step: 'situation' }); }}>
          Пройти ещё раз
        </button>
        <button type="button" className={styles.secondary} onClick={() => { setSession(null); go({ page: 'scenarios' }); }}>
          К списку разговоров
        </button>
      </div>
    </Page>
  );
}
