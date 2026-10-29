import { useEffect, useMemo, useRef } from 'react';
import { buildDrillAttempt, drillPhrasing } from './attempts';
import { drillChoice, drillLines, errorLabel, makePick, scoreChoices } from './choice';
import { ChoiceBlock, PracticeBox } from './ChoiceParts';
import { buildDeck } from './engine';
import { Fold, HintPoints, Page, Quotes, StepBar, go, useWideScreen } from './ui';
import { CriteriaList, ResultHead } from './Results';
import { SettingsIcon } from '../icons';
import { useTrainer } from './TrainerContext';
import type { AttemptAnswer, LearningAttempt, Objection, Pick } from './types';
import styles from './Trainer.module.css';

export type DrillSession = {
  deck: string[];
  phrasings: number[];
  index: number;
  phase: 'beat1' | 'beat2' | 'review' | 'summary';
  /** Выборы по текущему возражению (после первой реплики один, после второй два). */
  picks: Pick[];
  startedAt: number;
  cardStartedAt: number;
  results: { objectionId: string; attempt: LearningAttempt }[];
  /** Только одна карточка (из банка или после ошибки в викторине). */
  single: boolean;
  id: number;
};

export function useStartDrill() {
  const t = useTrainer();
  return (objectionId?: string): DrillSession => {
    const now = new Date();
    const cardsMap = new Map(t.cards.map((c) => [c.key, c]));
    const deck = objectionId
      ? [t.content.objections.objections.find((o) => o.id === objectionId)].filter((o): o is Objection => Boolean(o))
      : buildDeck(t.content, t.role, t.settings.showAllRoles, t.cards, now, t.settings.deckSize);
    return {
      deck: deck.map((o) => o.id),
      phrasings: deck.map((o) => drillPhrasing(o, cardsMap, t.who.userId)),
      index: 0,
      phase: 'beat1',
      picks: [],
      startedAt: now.getTime(),
      cardStartedAt: now.getTime(),
      results: [],
      single: Boolean(objectionId),
      id: now.getTime(),
    };
  };
}

export function DrillScreen({
  session,
  setSession,
  objectionId,
  onOpenSettings,
}: {
  session: DrillSession | null;
  setSession: (s: DrillSession | null) => void;
  objectionId?: string;
  onOpenSettings: () => void;
}) {
  const t = useTrainer();
  const start = useStartDrill();

  // Нет подхода или открыта другая карточка: начинаем заново.
  useEffect(() => {
    if (objectionId && (!session || !session.single || session.deck[0] !== objectionId)) setSession(start(objectionId));
    else if (!session) setSession(start());
  }, [objectionId, session === null]);

  if (!session) return null;
  if (session.phase === 'summary') return <Summary session={session} setSession={setSession} />;
  const o = t.content.objections.objections.find((x) => x.id === session.deck[session.index]);
  if (!o) return <EmptyDeck />;
  return <Card key={`${session.id}-${session.index}-${session.cardStartedAt}`} session={session} setSession={setSession} objection={o} onOpenSettings={onOpenSettings} />;
}

function EmptyDeck() {
  return (
    <Page title="Быстрая отработка" back={{ label: 'Тренажёр продаж', to: { page: 'home' } }}>
      <p className={styles.notice}>Для вашей роли пока нет возражений. Включите «Показывать материалы всех ролей» в настройках подхода.</p>
    </Page>
  );
}

function Card({
  session,
  setSession,
  objection: o,
  onOpenSettings,
}: {
  session: DrillSession;
  setSession: (s: DrillSession | null) => void;
  objection: Objection;
  onOpenSettings: () => void;
}) {
  const t = useTrainer();
  const phrasing = session.phrasings[session.index] ?? 0;
  const lines = drillLines(o, phrasing);
  const total = session.deck.length;
  const phase = session.phase;
  const saving = useRef(false);
  const firstPhase = useRef(true);
  useEffect(() => {
    // новый экран подхода (вторая реплика, разбор, итог) показываем с начала страницы
    if (firstPhase.current) {
      firstPhase.current = false;
      return;
    }
    window.scrollTo?.({ top: 0 });
  }, [session.phase, session.index]);
  const last = session.index + 1 >= total;
  const attempt = phase === 'review' ? (session.results[session.results.length - 1]?.attempt ?? null) : null;

  const header = (
    <StepBar
      current={phase === 'review' ? session.index + 1 : session.index}
      total={total}
      label={`Возражение ${session.index + 1} из ${total}`}
      extra={
        <button type="button" className={styles.linkBtn} onClick={onOpenSettings}>
          <SettingsIcon size={16} />
          <span>Настройки подхода</span>
        </button>
      }
    />
  );

  async function finish(picks: Pick[]) {
    if (saving.current) return;
    saving.current = true;
    try {
      const built = buildDrillAttempt({
        who: t.who,
        content: t.content,
        startedAt: new Date(session.cardStartedAt),
        now: new Date(),
        cards: new Map(t.cards.map((c) => [c.key, c])),
        objection: o,
        picks: [picks[0], picks[1]],
      });
      await t.commit(built);
      setSession({ ...session, phase: 'review', picks, results: [...session.results, { objectionId: o.id, attempt: built.attempt }] });
    } finally {
      saving.current = false;
    }
  }

  function next() {
    if (last) setSession({ ...session, phase: 'summary' });
    else setSession({ ...session, index: session.index + 1, phase: 'beat1', picks: [], cardStartedAt: Date.now() });
  }
  function repeat() {
    setSession({ ...session, phase: 'beat1', picks: [], cardStartedAt: Date.now(), results: session.results.slice(0, -1) });
  }

  if (phase === 'beat1' || phase === 'beat2') {
    const beat: 1 | 2 = phase === 'beat1' ? 1 : 2;
    return (
      <Page title="Быстрая отработка" back={{ label: 'Тренажёр продаж', to: { page: 'home' } }} lead="Клиент возражает. Выберите ответ из четырёх: сначала на возражение, потом на повтор. Затем разбор.">
        {header}
        <div className={styles.twoCols}>
          <div className={styles.talk}>
            <p className={styles.beat}>{beat === 1 ? 'Реплика 1 из 2 · Клиент возражает' : 'Реплика 2 из 2 · Клиент не согласен и повторяет'}</p>
            <blockquote className={styles.client}>{lines[beat - 1]}</blockquote>
            <ChoiceBlock
              key={`${session.cardStartedAt}-${beat}`}
              choice={drillChoice(o, beat)}
              seed={`${session.id}:${session.cardStartedAt}:${o.id}:${beat}`}
              quotes={o.sourceQuotes}
              videos={t.content.objections.videos}
              copyable={t.role === 'stp_admin'}
              nextLabel={beat === 1 ? 'Дальше: клиент повторяет' : 'К разбору'}
              onDone={(tries) => {
                const pick = makePick({ stepId: o.id, objectionId: o.id, beat, clientLine: lines[beat - 1], tries, choice: drillChoice(o, beat) });
                if (beat === 1) setSession({ ...session, phase: 'beat2', picks: [pick] });
                else void finish([...session.picks, pick]);
              }}
            />
          </div>
          <aside className={styles.side} aria-label="Подсказки">
            <HelpAside o={o} />
          </aside>
        </div>
      </Page>
    );
  }

  return (
    <Page title="Разбор ответа" back={{ label: 'Тренажёр продаж', to: { page: 'home' } }}>
      {header}
      <Review session={session} objection={o} attempt={attempt} lines={lines} last={last} next={next} repeat={repeat} setSession={setSession} />
    </Page>
  );
}

function HelpAside({ o }: { o: Objection }) {
  const t = useTrainer();
  const wide = useWideScreen();
  return (
    <details key={wide ? 'wide' : 'narrow'} open={wide}>
      <summary>Как это работает</summary>
      <ul>
        <li>В зачёт идёт первый выбор в каждой реплике.</li>
        <li>Если ошиблись, покажем, почему вариант не подходит, и дадим выбрать снова.</li>
        <li>Порядок вариантов каждый раз разный: смотрите на смысл, а не на положение.</li>
      </ul>
      <p className={styles.hint}>Тема: {t.content.objections.refusalReasons.find((r) => r.key === o.refusalReasonKey)?.title}</p>
    </details>
  );
}

function Review({
  session,
  objection: o,
  attempt,
  lines,
  last,
  next,
  repeat,
  setSession,
}: {
  session: DrillSession;
  objection: Objection;
  attempt: LearningAttempt | null;
  lines: [string, string];
  last: boolean;
  next: () => void;
  repeat: () => void;
  setSession: (s: DrillSession | null) => void;
}) {
  const t = useTrainer();
  const picks = attempt?.picks ?? session.picks;
  const options = useMemo(() => new Map([...o.choices.beat1.options, ...o.choices.beat2.options].map((x) => [x.id, x])), [o]);
  const firstCount = picks.filter((p) => p.firstTry).length;
  const mistakes = picks.flatMap((p, i) => (p.tries.length > 1 || !p.firstTry ? [{ p, i }] : []));
  const saveAnswers = async (answers: AttemptAnswer[]) => {
    if (!attempt) return;
    const updated = { ...attempt, answers, synced: false };
    await t.commit({ attempt: updated, cards: [] });
    setSession({ ...session, results: session.results.map((r) => (r.attempt.id === attempt.id ? { ...r, attempt: updated } : r)) });
  };
  return (
    <div className={`${styles.twoCols} ${styles.twoColsRev}`}>
      <div className={styles.reviewSide}>
        <section className={styles.result} aria-label="Итог карточки" aria-live="polite">
          <ResultHead count={picks.length} firstTry={firstCount} passed={Boolean(attempt?.passed)} kind="objection" />
          <div className={`${styles.actions} ${styles.stickyBar}`}>
            <button type="button" className={styles.primary} onClick={next}>
              {last ? 'Закончить подход' : 'Следующее возражение'}
            </button>
            <button type="button" className={styles.secondary} onClick={repeat}>
              Повторить это
            </button>
            {!last ? (
              <button type="button" className={styles.secondary} onClick={() => setSession({ ...session, phase: 'summary' })}>
                Закончить
              </button>
            ) : null}
          </div>
        </section>
      </div>
      <div className={styles.review}>
        <section aria-label="Верные ответы" className={styles.block}>
          <h4>Верные ответы</h4>
          {picks.map((p, i) => (
            <div key={i} className={styles.dialogPair}>
              <p className={styles.client}>Клиент: {lines[i]}</p>
              <p className={styles.mine}>
                <strong>{p.firstTry ? '✔ С первой попытки: ' : `✖ С ${p.tries.length}-й попытки: `}</strong>
                {options.get(p.optionId)?.text}
              </p>
            </div>
          ))}
        </section>
        {mistakes.length ? (
          <section aria-label="Ошибки" className={styles.block}>
            <h4>Какие ошибки выбраны</h4>
            <ul className={styles.plainList}>
              {mistakes.flatMap(({ p, i }) =>
                p.tries
                  .filter((tr) => !options.get(tr.optionId)?.correct)
                  .map((tr) => {
                    const op = options.get(tr.optionId);
                    return (
                      <li key={`${i}-${tr.optionId}`}>
                        <strong>{errorLabel(op?.errorType)}.</strong> «{op?.text}» {op?.explanation}
                      </li>
                    );
                  }),
              )}
            </ul>
          </section>
        ) : null}
        <section aria-label="Эталон" className={styles.block}>
          <h4>Эталон ответа</h4>
          <p className={styles.beat}>На первую реплику</p>
          <p className={styles.refAnswer}>{o.referenceAnswer}</p>
          <p className={styles.beat}>На повтор клиента</p>
          <p className={styles.refAnswer}>{o.pushbackReferenceAnswer}</p>
        </section>
        <Fold title="Что содержит хороший ответ" hint="подсказки, не оценка">
          <HintPoints points={o.requiredPoints} />
        </Fold>
        <Fold title="Источники" hint={`источников: ${o.sourceQuotes.length}`}>
          <Quotes quotes={o.sourceQuotes} videos={t.content.objections.videos} copyable={t.role === 'stp_admin'} />
          <p className={styles.hint}>Обучающие видео лежат в разделе «Материалы». Цитаты выше доступны и без сети.</p>
        </Fold>
        <Fold title="Типичная ошибка">
          <p className={styles.plain}>{o.commonMistake}</p>
        </Fold>
        <PracticeBox lines={lines} points={o.requiredPoints} onSave={saveAnswers} />
      </div>
    </div>
  );
}

function Summary({ session, setSession }: { session: DrillSession; setSession: (s: DrillSession | null) => void }) {
  const t = useTrainer();
  const results = session.results;
  const picks = results.flatMap((r) => r.attempt.picks ?? []);
  const played = results.flatMap((r) => {
    const o = t.content.objections.objections.find((x) => x.id === r.objectionId);
    return o ? [...o.choices.beat1.options, ...o.choices.beat2.options] : [];
  });
  const score = scoreChoices(picks, played, t.content.scoring);
  const passed = results.filter((r) => r.attempt.passed).length;
  const repeatList = results.filter((r) => !r.attempt.passed);
  const start = useStartDrill();
  return (
    <Page title="Итог подхода" back={{ label: 'Тренажёр продаж', to: { page: 'home' } }}>
      <div className={styles.summary}>
        {results.length ? (
          <>
            <p className={styles.bigScore}>
              <span className={styles.scoreNum}>{Math.round(score.share * 100)} %</span> <span>верно с первой попытки</span>
            </p>
            <p>
              Верно с первого раза: <strong>{score.firstTryCount}</strong> из {score.count} реплик. Засчитано возражений: <strong>{passed}</strong> из {results.length}.
            </p>
            <CriteriaList scores={score.criteria} content={t.content} />
          </>
        ) : (
          <p className={styles.notice}>В этом подходе вы не прошли ни одного возражения.</p>
        )}
        {repeatList.length ? (
          <>
            <h4>Что повторить</h4>
            <ul className={styles.list}>
              {repeatList.map((r) => {
                const o = t.content.objections.objections.find((x) => x.id === r.objectionId);
                return (
                  <li key={r.attempt.id}>
                    <span>{o?.panel.title ?? r.objectionId}</span>
                    <button type="button" className={styles.linkBtn} onClick={() => { setSession(start(r.objectionId)); go({ page: 'drill', objectionId: r.objectionId }, 'replace'); }}>
                      Потренировать
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        ) : results.length ? (
          <p className={styles.okLine}>✔ Все возражения подхода засчитаны.</p>
        ) : null}
        <div className={styles.actions}>
          <button type="button" className={styles.primary} onClick={() => { setSession(start()); go({ page: 'drill' }, 'replace'); }}>
            Ещё один подход
          </button>
          <button type="button" className={styles.secondary} onClick={() => { setSession(null); go({ page: 'home' }); }}>
            В тренажёр
          </button>
        </div>
      </div>
    </Page>
  );
}
