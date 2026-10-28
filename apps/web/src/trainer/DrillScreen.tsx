import { useEffect, useMemo, useRef, useState } from 'react';
import { buildDrillAttempt, drillPhrasing } from './attempts';
import { DRILL_CRITERIA, answerError, buildDeck, evaluateDrill, wordCount, MIN_WORDS } from './engine';
import { Flags, Highlighted, Page, Points, Quotes, Score, SelfAssess, go } from './ui';
import { useTrainer } from './TrainerContext';
import type { CriterionId, LearningAttempt, Objection, Scores } from './types';
import styles from './Trainer.module.css';

export type DrillSession = {
  deck: string[];
  phrasings: number[];
  index: number;
  phase: 'beat1' | 'beat2' | 'review' | 'saved' | 'summary';
  beat1: string;
  beat2: string;
  skipped: boolean;
  manual: boolean;
  startedAt: number;
  results: { objectionId: string; total: number; passed: boolean; skipped: boolean }[];
  /** Только одна карточка (из банка или после ошибки в викторине). */
  single: boolean;
  lastAttempt: LearningAttempt | null;
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
      phase: t.settings.autoScoring ? 'beat1' : 'review',
      beat1: '',
      beat2: '',
      skipped: false,
      manual: !t.settings.autoScoring,
      startedAt: now.getTime(),
      results: [],
      single: Boolean(objectionId),
      lastAttempt: null,
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
  if (!o) return null;
  return <Card key={`${session.id}-${session.index}-${session.startedAt}`} session={session} setSession={setSession} objection={o} onOpenSettings={onOpenSettings} />;
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
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const beatStart = useRef(Date.now());
  const msRef = useRef<[number, number]>([0, 0]);
  const area = useRef<HTMLTextAreaElement>(null);
  const total = session.deck.length;
  const phase = session.phase;

  useEffect(() => {
    if (phase === 'beat1' || phase === 'beat2') {
      beatStart.current = Date.now();
      area.current?.focus();
    }
  }, [phase]);

  const cardsMap = useMemo(() => new Map(t.cards.map((c) => [c.key, c])), [t.cards]);
  const evalResult = useMemo(
    () => (phase === 'review' || phase === 'saved' ? evaluateDrill(o, phrasing, session.beat1, session.beat2, t.content, session.skipped) : null),
    [phase, o, phrasing, session.beat1, session.beat2, session.skipped, t.content],
  );

  async function save(selfScores: Scores | null, selfNotes: Partial<Record<CriterionId, string>>, skipped: boolean) {
    setBusy(true);
    try {
      const built = buildDrillAttempt({
        who: t.who,
        content: t.content,
        startedAt: new Date(session.startedAt),
        now: new Date(),
        cards: cardsMap,
        objection: o,
        phrasing,
        beat1: session.beat1,
        beat2: session.beat2,
        ms: msRef.current,
        skipped,
        manual: session.manual,
        selfScores,
        selfNotes,
      });
      await t.commit(built);
      setSession({
        ...session,
        phase: 'saved',
        lastAttempt: built.attempt,
        results: [...session.results, { objectionId: o.id, total: built.attempt.total, passed: built.attempt.passed, skipped }],
      });
    } finally {
      setBusy(false);
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
    const ms = Date.now() - beatStart.current;
    if (phase === 'beat1') {
      msRef.current[0] = ms;
      setSession({ ...session, phase: 'beat2', beat1: text.trim() });
      setText('');
    } else {
      msRef.current[1] = ms;
      setSession({ ...session, phase: 'review', beat2: text.trim() });
    }
  }

  function dontKnow() {
    setError(null);
    setSession({ ...session, phase: 'review', skipped: true, beat1: '', beat2: '' });
  }

  // «Не знаю»: сразу пишем попытку с одним баллом и показываем эталон.
  const savedSkip = useRef(false);
  useEffect(() => {
    if (phase === 'review' && session.skipped && !savedSkip.current) {
      savedSkip.current = true;
      void save(null, {}, true);
    }
  }, [phase, session.skipped]);

  const clientLine = phase === 'beat2' ? o.pushback : o.clientPhrasing[phrasing];
  const words = wordCount(text);
  const last = session.index + 1 >= total;

  function next() {
    if (last) setSession({ ...session, phase: 'summary' });
    else setSession({ ...session, index: session.index + 1, phase: t.settings.autoScoring ? 'beat1' : 'review', beat1: '', beat2: '', skipped: false, lastAttempt: null, startedAt: Date.now() });
  }
  function repeat() {
    setSession({ ...session, phase: t.settings.autoScoring ? 'beat1' : 'review', beat1: '', beat2: '', skipped: false, lastAttempt: null, startedAt: Date.now(), results: session.results.slice(0, -1) });
  }

  const header = (
    <div className={styles.cardHead}>
      <span className={styles.step}>
        Возражение {session.index + 1} из {total}
      </span>
      <button type="button" className={styles.linkBtn} onClick={onOpenSettings}>
        Настройки подхода
      </button>
    </div>
  );

  if (phase === 'beat1' || phase === 'beat2') {
    return (
      <Page title="Быстрая отработка" back={{ label: 'Тренажёр продаж', to: { page: 'home' } }} lead="Ответьте клиенту так, как сказали бы по телефону: два шага, затем разбор.">
        {header}
        <div className={styles.twoCols}>
          <div className={styles.talk}>
            <p className={styles.beat}>{phase === 'beat1' ? 'Реплика клиента' : 'Клиент не согласен и повторяет'}</p>
            <blockquote className={styles.client}>{clientLine}</blockquote>
            <label className={styles.answerLabel} htmlFor="drill-answer">
              Ваш ответ клиенту
            </label>
            <textarea
              id="drill-answer"
              ref={area}
              className={styles.answer}
              rows={6}
              value={text}
              placeholder="Напишите своими словами, не меньше восьми слов"
              onChange={(e) => {
                setText(e.target.value);
                if (error) setError(null);
              }}
              aria-describedby="drill-count"
              aria-invalid={error ? true : undefined}
            />
            <p id="drill-count" className={styles.count}>
              Слов: {words} из {MIN_WORDS}
            </p>
            {error ? (
              <p className={styles.error} role="alert">
                {error}
              </p>
            ) : null}
            <div className={styles.stickyBar}>
              <button type="button" className={styles.primary} onClick={submit}>
                Ответить
              </button>
              <button type="button" className={styles.secondary} onClick={dontKnow}>
                Не знаю
              </button>
            </div>
          </div>
          <aside className={styles.side} aria-label="Подсказки">
            <h4>На что смотрим</h4>
            <ul>
              <li>Вы признали позицию клиента и повторили его слова.</li>
              <li>Назвали факты из обучающих видео, а не общие слова.</li>
              <li>Не пообещали тишину и не назвали чужие цифры.</li>
              <li>Показали выгоду для клиента.</li>
            </ul>
            <p className={styles.hint}>Тема: {t.content.objections.refusalReasons.find((r) => r.key === o.refusalReasonKey)?.title}</p>
          </aside>
        </div>
      </Page>
    );
  }

  // разбор
  const answered = !session.skipped && !session.manual;
  const patterns = (beat: 1 | 2) => o.requiredPoints.filter((p) => p.beat === beat).flatMap((p) => p.anyOf);
  const attempt = session.lastAttempt;
  return (
    <Page title="Разбор ответа" back={{ label: 'Тренажёр продаж', to: { page: 'home' } }}>
      {header}
      <div className={styles.twoCols}>
        <div className={styles.review}>
          {answered ? (
            <section aria-label="Ваш ответ" className={styles.block}>
              <h4>Ваш ответ</h4>
              <p className={styles.client}>Клиент: {o.clientPhrasing[phrasing]}</p>
              <p className={styles.mine}>
                <Highlighted text={session.beat1} patterns={patterns(1)} />
              </p>
              <p className={styles.client}>Клиент: {o.pushback}</p>
              <p className={styles.mine}>
                <Highlighted text={session.beat2} patterns={patterns(2)} />
              </p>
            </section>
          ) : (
            <p className={styles.notice}>
              {session.skipped ? 'Вы ответили «Не знаю». Это один балл. Изучите эталон ниже и повторите карточку позже.' : 'Ответ даёте устно. Сравните его с эталоном и оцените себя по описаниям.'}
            </p>
          )}
          {answered && evalResult ? (
            <>
              <section aria-label="Пункты ответа" className={styles.block}>
                <h4>Что названо</h4>
                <Points objection={o} matched={evalResult.matchedPointIds} content={t.content} />
              </section>
              <section aria-label="Нарушения" className={styles.block}>
                <h4>Что нарушено</h4>
                <Flags flags={evalResult.flags} content={t.content} objection={o} />
              </section>
            </>
          ) : null}
          <section aria-label="Эталон" className={styles.block}>
            <h4>Эталон ответа</h4>
            <p className={styles.beat}>На первую реплику</p>
            <p className={styles.refAnswer}>{o.referenceAnswer}</p>
            <p className={styles.beat}>На повтор клиента</p>
            <p className={styles.refAnswer}>{o.pushbackReferenceAnswer}</p>
          </section>
          <section aria-label="Из видео" className={styles.block}>
            <h4>Из видео</h4>
            <Quotes quotes={o.sourceQuotes} videos={t.content.objections.videos} copyable={t.role === 'stp_admin'} />
            <p className={styles.hint}>Видео лежат в разделе «Материалы». Если ролик не открывается без сети, цитаты выше остаются доступны.</p>
          </section>
          <section aria-label="Типичная ошибка" className={styles.block}>
            <h4>Типичная ошибка</h4>
            <p>{o.commonMistake}</p>
          </section>
        </div>
        <div className={styles.reviewSide}>
          {phase === 'review' && !session.skipped ? (
            <SelfAssess
              criteria={DRILL_CRITERIA}
              content={t.content}
              auto={session.manual ? {} : (evalResult?.autoScores ?? {})}
              busy={busy}
              onSubmit={(scores, notes) => void save(scores, notes, false)}
            />
          ) : null}
          {phase === 'saved' && attempt ? (
            <section className={styles.result} aria-label="Итог карточки" aria-live="polite">
              <h4>Итог по карточке</h4>
              <p className={styles.bigScore}>
                <Score value={attempt.total} /> <span>из 5</span>
              </p>
              <p className={attempt.passed ? styles.okLine : styles.failLine}>{attempt.passed ? '✔ Засчитано' : '✖ Не засчитано'}</p>
              {attempt.autoScores.objection !== undefined && attempt.selfScores ? (
                <p className={styles.hint}>Предварительная оценка и ваша сохранены отдельно.</p>
              ) : null}
              <div className={styles.actions}>
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
          ) : null}
        </div>
      </div>
    </Page>
  );
}

function Summary({ session, setSession }: { session: DrillSession; setSession: (s: DrillSession | null) => void }) {
  const t = useTrainer();
  const results = session.results;
  const avg = results.length ? results.reduce((s, r) => s + r.total, 0) / results.length : 0;
  const passed = results.filter((r) => r.passed).length;
  const repeatList = results.filter((r) => !r.passed);
  const start = useStartDrill();
  return (
    <Page title="Итог подхода" back={{ label: 'Тренажёр продаж', to: { page: 'home' } }}>
      <div className={styles.summary}>
        <p className={styles.bigScore}>
          <Score value={Math.round(avg * 100) / 100} /> <span>средний балл из 5</span>
        </p>
        <p>
          Засчитано: <strong>{passed}</strong> из {results.length}
        </p>
        {repeatList.length ? (
          <>
            <h4>Что повторить</h4>
            <ul className={styles.list}>
              {repeatList.map((r) => {
                const o = t.content.objections.objections.find((x) => x.id === r.objectionId);
                return (
                  <li key={r.objectionId}>
                    <span>{o?.panel.title ?? r.objectionId}{r.skipped ? ' · «Не знаю»' : ''}</span>
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
