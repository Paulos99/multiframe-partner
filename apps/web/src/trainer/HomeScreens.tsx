import { useMemo, useState } from 'react';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { DECK_SIZES, ROLE_TITLES, computeProgress, dueCards, objectionsForRole, questionsForRole, scenariosForRole } from './engine';
import { useTrainer } from './TrainerContext';
import { Dialog, Page, Quotes, Score, go } from './ui';
import type { LearningAttempt } from './types';
import styles from './Trainer.module.css';

const MODE_TITLE: Record<string, string> = { objection: 'Быстрая отработка', roleplay: 'Ролевой разговор', quiz: 'Проверка знаний' };

function dateLabel(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const t = useTrainer();
  const [deck, setDeck] = useState(t.settings.deckSize);
  const [all, setAll] = useState(t.settings.showAllRoles);
  const [auto, setAuto] = useState(t.settings.autoScoring);
  return (
    <Dialog title="Настройки подхода" onClose={onClose}>
      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          void t.saveSettings({ deckSize: deck, showAllRoles: all, autoScoring: auto }).then(onClose);
        }}
      >
        <label className={styles.fieldLine}>
          Возражений в подходе
          <select value={deck} onChange={(e) => setDeck(Number(e.target.value))}>
            {DECK_SIZES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.checkLine}>
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
          <span>Автоматическая подсказка оценки. Если выключить, ответ даёте устно и оцениваете себя сами.</span>
        </label>
        <label className={styles.checkLine}>
          <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
          <span>Показывать материалы всех ролей. Прогресс всё равно считается по вашей роли.</span>
        </label>
        <div className={styles.actions}>
          <button type="submit" className={styles.primary}>
            Сохранить
          </button>
          <button type="button" className={styles.secondary} onClick={onClose}>
            Отмена
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export function Home({ onStartDrill, onOpenSettings }: { onStartDrill: () => void; onOpenSettings: () => void }) {
  const t = useTrainer();
  const now = useMemo(() => new Date(), []);
  const showAll = t.settings.showAllRoles;
  const objs = objectionsForRole(t.content, t.role, showAll).length;
  const scs = scenariosForRole(t.content, t.role, showAll).length;
  const qs = questionsForRole(t.content, t.role, showAll).length;
  const due = dueCards(t.cards, 'objection', now, t.content.scoring.srs.dailyLimit).length;
  const dueQuiz = dueCards(t.cards, 'quiz', now, t.content.scoring.srs.dailyLimit).length;
  const prog = computeProgress(t.content, t.role, showAll, t.attempts, t.cards, now);
  const isAdmin = t.role === 'stp_admin';
  return (
    <section className={styles.page} aria-label="Тренажёр продаж">
      <div className={styles.homeHead}>
        <div>
          <h3 className={styles.pageTitle}>Тренажёр продаж</h3>
          <p className={styles.lead}>Ваша роль: {ROLE_TITLES[t.role]}. Тренируйтесь на реальных ответах клиентам, всё сохраняется на этом устройстве.</p>
        </div>
        <button type="button" className={styles.secondary} onClick={onOpenSettings}>
          Настройки подхода
        </button>
      </div>

      <section className={styles.today} aria-label="Сегодня">
        <h4>Сегодня</h4>
        <p>
          {due > 0 ? `Пора повторить возражений: ${due}.` : t.attempts.length ? 'Повторять по расписанию пока нечего.' : 'Вы ещё не начинали. Хватит пяти минут.'}
          {dueQuiz > 0 ? ` Вопросов для повторения: ${dueQuiz}.` : ''}
        </p>
        <button type="button" className={styles.primary} onClick={onStartDrill}>
          Подход на 5 минут
        </button>
      </section>

      <ul className={styles.tiles} aria-label="Режимы">
        <li>
          <button type="button" className={styles.tile} onClick={onStartDrill}>
            <strong>Быстрая отработка</strong>
            <span>Клиент возражает, вы отвечаете, затем разбор с эталоном. Возражений для вас: {objs}.</span>
          </button>
        </li>
        <li>
          <button type="button" className={styles.tile} onClick={() => go({ page: 'scenarios' })}>
            <strong>Ролевые разговоры</strong>
            <span>Телефонный разговор по шагам, 6–8 минут. Сценариев: {scs}.</span>
          </button>
        </li>
        <li>
          <button type="button" className={styles.tile} onClick={() => go({ page: 'quiz', step: 'start' })}>
            <strong>Проверка знаний</strong>
            <span>Вопросы по видео, сразу видно верный ответ. Вопросов: {qs}.</span>
          </button>
        </li>
      </ul>

      <section className={styles.block} aria-label="Мой прогресс">
        <h4>Мой прогресс</h4>
        <dl className={styles.stats}>
          <div>
            <dt>Уровень</dt>
            <dd>{prog.level.title}</dd>
          </div>
          <div>
            <dt>Засчитано</dt>
            <dd>{prog.passedCount}</dd>
          </div>
          <div>
            <dt>Дней подряд</dt>
            <dd>{prog.streakDays}</dd>
          </div>
        </dl>
        <div className={styles.actions}>
          <button type="button" className={styles.secondary} onClick={() => go({ page: 'progress' })}>
            Весь прогресс
          </button>
          <button type="button" className={styles.secondary} onClick={() => go({ page: 'bank' })}>
            Банк возражений
          </button>
        </div>
      </section>

      {isAdmin ? (
        <section className={styles.block} aria-label="Содержимое">
          <h4>Содержимое тренажёра</h4>
          <p className={styles.hint}>
            Версия: {t.content.contentVersion}. Возражений: {t.content.objections.objections.length}, сценариев: {t.content.scenarios.scenarios.length}, вопросов: {t.content.quiz.questions.length}.
            Каждый эталон и вопрос подтверждён дословной цитатой из видео.
          </p>
        </section>
      ) : null}
      {t.pending > 0 ? <p className={styles.hint}>Результатов на этом устройстве: {t.pending}. Отправка на сервер пока не подключена, данные не потеряются.</p> : null}
    </section>
  );
}

function AttemptRow({ a }: { a: LearningAttempt }) {
  const t = useTrainer();
  const title =
    a.itemType === 'objection'
      ? (t.content.objections.objections.find((o) => o.id === a.itemIds[0])?.panel.title ?? a.itemIds[0])
      : a.itemType === 'scenario'
        ? (t.content.scenarios.scenarios.find((s) => s.id === a.itemIds[0])?.title ?? a.itemIds[0])
        : `${a.itemIds.length} вопросов`;
  return (
    <li>
      <span>
        {dateLabel(a.finishedAt)} · {MODE_TITLE[a.mode]}: {title}
        {a.skipped ? ' · «Не знаю»' : ''}
      </span>
      <span>
        {a.mode === 'quiz' ? `${Math.round((a.total / 5) * 100)} %` : <Score value={a.total} />} {a.passed ? '✔' : '✖'}
        {a.selfScores && a.mode !== 'quiz' ? <span className={styles.hint}> (подсказка системы: {autoTotal(a)})</span> : null}
      </span>
    </li>
  );
}

function autoTotal(a: LearningAttempt): string {
  const vals = Object.values(a.autoScores).filter((v): v is number => typeof v === 'number');
  if (!vals.length) return '—';
  return (Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10).toString().replace('.', ',');
}

export function ProgressScreen() {
  const t = useTrainer();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const prog = computeProgress(t.content, t.role, t.settings.showAllRoles, t.attempts, t.cards, new Date());
  return (
    <Page title="Мой прогресс" back={{ label: 'Тренажёр продаж', to: { page: 'home' } }}>
      {t.attempts.length === 0 ? <p className={styles.notice}>Пока нет ни одной попытки. Начните с быстрой отработки.</p> : null}
      <p>
        Уровень: <strong>{prog.level.title}</strong>
        {prog.levelAvg !== null ? <span className={styles.hint}> · средний балл последних попыток {String(prog.levelAvg).replace('.', ',')}</span> : null}
      </p>
      <section className={styles.block} aria-label="По критериям">
        <h4>По критериям</h4>
        <ul className={styles.bars}>
          {prog.criteriaAvg.map((c) => (
            <li key={c.id}>
              <span>{c.title}</span>
              <span className={styles.barTrack} aria-hidden="true">
                <span className={c.weak ? styles.barWeak : styles.barFill} style={{ width: `${((c.avg ?? 0) / 5) * 100}%` }} />
              </span>
              <span>{c.avg === null ? 'нет данных' : `${String(c.avg).replace('.', ',')}${c.weak ? ' · слабое место' : ''}`}</span>
            </li>
          ))}
        </ul>
      </section>
      <section className={styles.block} aria-label="По причинам отказа">
        <h4>По причинам отказа</h4>
        <MasteryList rows={prog.reasons} />
      </section>
      <section className={styles.block} aria-label="По темам">
        <h4>По темам проверки знаний</h4>
        <MasteryList rows={prog.topics} />
      </section>
      {prog.weakPoints.length ? (
        <section className={styles.block} aria-label="Что чаще пропускаете">
          <h4>Что вы чаще пропускаете</h4>
          <ul className={styles.list}>
            {prog.weakPoints.map((w) => (
              <li key={w.key}>
                <span>{w.text}</span>
                <button type="button" className={styles.linkBtn} onClick={() => go({ page: 'drill', objectionId: w.objectionId })}>
                  Потренировать ({w.count})
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section className={styles.block} aria-label="История">
        <h4>История</h4>
        {prog.attempts.length ? (
          <ul className={styles.list}>
            {prog.attempts.slice(0, 30).map((a) => (
              <AttemptRow key={a.id} a={a} />
            ))}
          </ul>
        ) : (
          <p className={styles.hint}>Здесь появятся ваши попытки.</p>
        )}
      </section>
      <div className={styles.actions}>
        <button type="button" className={styles.danger} onClick={() => setConfirm(true)} disabled={!t.attempts.length && !t.cards.length}>
          Сбросить мой прогресс
        </button>
      </div>
      <ConfirmDialog
        open={confirm}
        title="Сбросить прогресс?"
        message="Попытки, оценки и расписание повторений на этом устройстве будут удалены. Прогресс других пользователей не затрагивается."
        confirmLabel="Сбросить"
        busy={busy}
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          setBusy(true);
          void t.resetAll().finally(() => {
            setBusy(false);
            setConfirm(false);
          });
        }}
      />
    </Page>
  );
}

function MasteryList({ rows }: { rows: { id: string; title: string; mastered: number; inWork: number; notStarted: number; total: number }[] }) {
  if (!rows.length) return <p className={styles.hint}>Нет данных.</p>;
  return (
    <ul className={styles.list}>
      {rows.map((r) => (
        <li key={r.id}>
          <span>{r.title}</span>
          <span className={styles.hint}>
            освоено {r.mastered}, в работе {r.inWork}, не начато {r.notStarted}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function BankScreen({ id, onTrain }: { id?: string; onTrain: (objectionId: string) => void }) {
  const t = useTrainer();
  const [reason, setReason] = useState('');
  const list = objectionsForRole(t.content, t.role, t.settings.showAllRoles).filter((o) => !reason || o.refusalReasonKey === reason);
  const reasons = t.content.objections.refusalReasons;
  if (id) {
    const o = t.content.objections.objections.find((x) => x.id === id);
    if (!o) {
      return (
        <Page title="Не найдено" back={{ label: 'Банк возражений', to: { page: 'bank' } }}>
          <p>Такой карточки нет.</p>
        </Page>
      );
    }
    return (
      <Page title={o.panel.title} back={{ label: 'Банк возражений', to: { page: 'bank' } }}>
        <p className={styles.hint}>Причина отказа: {reasons.find((r) => r.key === o.refusalReasonKey)?.title}</p>
        <section className={styles.block} aria-label="Коротко">
          <h4>Коротко</h4>
          <p>{o.panel.shortAnswer}</p>
          <p>
            <strong>Главный факт:</strong> {o.panel.keyFact}
          </p>
        </section>
        <section className={styles.block} aria-label="Клиент говорит">
          <h4>Клиент говорит</h4>
          <ul>
            {o.clientPhrasing.map((c) => (
              <li key={c}>{c}</li>
            ))}
            <li>{o.pushback}</li>
          </ul>
        </section>
        <section className={styles.block} aria-label="Эталон">
          <h4>Эталон ответа</h4>
          <p className={styles.refAnswer}>{o.referenceAnswer}</p>
          <p className={styles.beat}>Если клиент повторяет</p>
          <p className={styles.refAnswer}>{o.pushbackReferenceAnswer}</p>
        </section>
        {o.panel.showMaterial.length ? (
          <section className={styles.block} aria-label="Что показать">
            <h4>Что показать клиенту</h4>
            <ul>
              {o.panel.showMaterial.map((m) => (
                <li key={m.videoCode + m.title}>
                  {m.title}. {m.hint}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <section className={styles.block} aria-label="Из видео">
          <h4>Из видео</h4>
          <Quotes quotes={o.sourceQuotes} videos={t.content.objections.videos} copyable={t.role === 'stp_admin'} />
        </section>
        <section className={styles.block} aria-label="Типичная ошибка">
          <h4>Типичная ошибка</h4>
          <p>{o.commonMistake}</p>
        </section>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.primary}
            onClick={() => {
              onTrain(o.id);
              go({ page: 'drill', objectionId: o.id });
            }}
          >
            Потренировать
          </button>
        </div>
      </Page>
    );
  }
  return (
    <Page title="Банк возражений" back={{ label: 'Тренажёр продаж', to: { page: 'home' } }} lead="Справочник: что ответить, что показать и откуда это в видео.">
      <label className={styles.fieldLine}>
        Причина отказа
        <select value={reason} onChange={(e) => setReason(e.target.value)}>
          <option value="">Все причины</option>
          {reasons.map((r) => (
            <option key={r.key} value={r.key}>
              {r.title}
            </option>
          ))}
        </select>
      </label>
      {list.length === 0 ? <p className={styles.notice}>По этой причине для вашей роли возражений нет. Выберите другую или включите «Показывать материалы всех ролей».</p> : null}
      <ul className={styles.cards}>
        {list.map((o) => (
          <li key={o.id}>
            <button type="button" className={styles.cardBtn} onClick={() => go({ page: 'bank', id: o.id })}>
              <strong>{o.panel.title}</strong>
              <span className={styles.meta}>{o.panel.shortAnswer}</span>
              <span className={styles.tag}>{reasons.find((r) => r.key === o.refusalReasonKey)?.title}</span>
            </button>
          </li>
        ))}
      </ul>
    </Page>
  );
}
