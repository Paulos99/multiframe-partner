import { useMemo, useState } from 'react';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { DECK_SIZES, ROLE_TITLES, computeProgress, dueCards, objectionsForRole, questionsForRole, scenariosForRole } from './engine';
import { useTrainer } from './TrainerContext';
import { ChecklistIcon, GaugeIcon, PartnersIcon, SettingsIcon } from '../icons';
import { errorLabel } from './choice';
import { SearchPanel } from './SearchPanel';
import { Dialog, Fold, Page, Quotes, go } from './ui';
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
  return (
    <Dialog title="Настройки подхода" onClose={onClose}>
      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          void t.saveSettings({ deckSize: deck, showAllRoles: all }).then(onClose);
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

export function Home({
  onStartDrill,
  onResumeDrill,
  resume,
  onOpenSettings,
}: {
  onStartDrill: () => void;
  onResumeDrill: () => void;
  resume: { index: number; total: number } | null;
  onOpenSettings: () => void;
}) {
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
  const deck = t.settings.deckSize;
  return (
    <section className={styles.page} aria-label="Тренажёр продаж">
      <div className={styles.homeHead}>
        <div className={styles.homeTitle}>
          <h3 className={styles.pageTitle}>Тренажёр продаж</h3>
          <p className={styles.lead}>
            Учитесь отвечать клиентам на возражения: выбираете лучший из четырёх ответов, сразу видите, почему другие не подходят, и опираетесь на проверенные факты. Ваша роль: {ROLE_TITLES[t.role]}. Результаты хранятся на этом устройстве.
          </p>
        </div>
        <button type="button" className={styles.secondary} onClick={onOpenSettings}>
          <SettingsIcon size={18} />
          <span>Настройки подхода</span>
        </button>
      </div>

      <SearchPanel />

      <section className={styles.today} aria-label="Сегодня">
        <div className={styles.todayText}>
          <h4>Сегодня</h4>
          <p>
            {resume
              ? `Подход не закончен: возражение ${resume.index} из ${resume.total}. Можно продолжить с того же места.`
              : due > 0
                ? `Пора повторить возражений: ${due}.`
                : t.attempts.length
                  ? 'Повторять по расписанию пока нечего. Можно взять новый подход.'
                  : 'Вы ещё не начинали. Хватит пяти минут.'}
            {dueQuiz > 0 ? ` Вопросов для повторения: ${dueQuiz}.` : ''}
          </p>
        </div>
        <div className={styles.todayActions}>
          {resume ? (
            <>
              <button type="button" className={styles.primary} onClick={onResumeDrill}>
                Продолжить подход
              </button>
              <button type="button" className={styles.secondary} onClick={onStartDrill}>
                Подход на 5 минут
              </button>
            </>
          ) : (
            <button type="button" className={styles.primary} onClick={onStartDrill}>
              Подход на 5 минут
            </button>
          )}
        </div>
      </section>

      <h4 className={styles.sectionTitle}>Выберите, как тренироваться</h4>
      <ul className={styles.tiles} aria-label="Режимы">
        <li>
          <button type="button" className={styles.tile} onClick={onStartDrill}>
            <span className={styles.tileIcon}>
              <GaugeIcon size={26} />
            </span>
            <strong>Быстрая отработка</strong>
            <span className={styles.tileText}>Клиент возражает, вы выбираете ответ из четырёх, затем разбор с эталоном.</span>
            <span className={styles.chips}>
              <span className={styles.chip}>Возражений для вас: {objs}</span>
              <span className={styles.chip}>{deck} в подходе</span>
            </span>
          </button>
        </li>
        <li>
          <button type="button" className={styles.tile} onClick={() => go({ page: 'scenarios' })}>
            <span className={styles.tileIcon}>
              <PartnersIcon size={26} />
            </span>
            <strong>Ролевые разговоры</strong>
            <span className={styles.tileText}>Телефонный разговор с клиентом по шагам: на каждой реплике выбираете ответ.</span>
            <span className={styles.chips}>
              <span className={styles.chip}>Сценариев: {scs}</span>
              <span className={styles.chip}>6–8 минут</span>
            </span>
          </button>
        </li>
        <li>
          <button type="button" className={styles.tile} onClick={() => go({ page: 'quiz', step: 'start' })}>
            <span className={styles.tileIcon}>
              <ChecklistIcon size={26} />
            </span>
            <strong>Проверка знаний</strong>
            <span className={styles.tileText}>Вопросы по продукту: сразу виден верный ответ и источник.</span>
            <span className={styles.chips}>
              <span className={styles.chip}>Вопросов: {qs}</span>
              <span className={styles.chip}>10 за раз</span>
            </span>
          </button>
        </li>
      </ul>

      <section className={styles.block} aria-label="Мой прогресс">
        <h4>Мой прогресс</h4>
        <dl className={`${styles.stats} ${styles.statsLevel}`}>
          <div>
            <dt>Уровень</dt>
            <dd>{prog.level.title}</dd>
          </div>
          <div>
            <dt>Верно с первой попытки</dt>
            <dd>{prog.levelShare === null ? '—' : `${Math.round(prog.levelShare * 100)} %`}</dd>
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
            Каждый эталон и вопрос подтверждён цитатой: она лежит в блоке «Источник». Факты с сайтов производителей показаны со ссылкой и словами «производитель указывает».
          </p>
          {t.content.hidden.length ? (
            <p className={styles.notice}>
              Скрыто до решения открытого вопроса: {t.content.hidden.map((h) => `«${h.title}»`).join(', ')}.
            </p>
          ) : null}
        </section>
      ) : null}
      {t.pending > 0 && t.who.partnerId ? <p className={styles.hint}>Ждут отправки: {t.pending}. Они уйдут сами, когда появится связь, ничего не потеряется.</p> : null}
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
  const picks = a.picks ?? [];
  const result =
    a.mode === 'quiz'
      ? `${Math.round((a.total / 5) * 100)} %`
      : `${picks.filter((p) => p.firstTry).length} из ${picks.length} с первой попытки`;
  return (
    <li>
      <span>
        {dateLabel(a.finishedAt)} · {MODE_TITLE[a.mode]}: {title}
      </span>
      <span>
        {result} {a.passed ? '✔' : '✖'}
      </span>
    </li>
  );
}

export function ProgressScreen() {
  const t = useTrainer();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState(false);
  const prog = computeProgress(t.content, t.role, t.settings.showAllRoles, t.attempts, t.cards, new Date());
  const history = prog.attempts.slice(0, 30);
  const shown = more ? history : history.slice(0, 8);
  const sum = (rows: { mastered: number; total: number }[]) => `освоено ${rows.reduce((n, r) => n + r.mastered, 0)} из ${rows.reduce((n, r) => n + r.total, 0)}`;
  return (
    <Page title="Мой прогресс" back={{ label: 'Тренажёр продаж', to: { page: 'home' } }}>
      {t.attempts.length === 0 ? <p className={styles.notice}>Пока нет ни одной попытки. Начните с быстрой отработки.</p> : null}
      {t.legacyCount > 0 ? (
        <p className={styles.notice}>
          Старых попыток с набором ответа текстом: {t.legacyCount}. Оценка изменилась: теперь считается, сколько ответов верно с первой попытки, поэтому старые попытки в итоги не входят. Они сохранены на устройстве.
        </p>
      ) : null}
      <section className={styles.block} aria-label="Уровень">
        <p className={styles.levelLine}>
          Уровень: <strong>{prog.level.title}</strong>
        </p>
        {prog.levelShare !== null ? (
          <p className={styles.hint}>
            Верно с первой попытки в последних попытках: {Math.round(prog.levelShare * 100)} %. «Уверенный» с 75 %, «Мастер» с 90 %.
          </p>
        ) : (
          <p className={styles.hint}>Уровень появится после первой попытки в режиме выбора.</p>
        )}
        <dl className={styles.stats}>
          <div>
            <dt>Попыток</dt>
            <dd>{t.attempts.length}</dd>
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
      </section>
      <section className={styles.block} aria-label="По критериям">
        <h4>По критериям</h4>
        <ul className={styles.bars}>
          {prog.criteriaAvg.map((c) => (
            <li key={c.id}>
              <span className={styles.barName}>{c.title}</span>
              <span className={styles.barTrack} aria-hidden="true">
                <span className={c.weak ? styles.barWeak : styles.barFill} style={{ width: `${((c.avg ?? 0) / 5) * 100}%` }} />
              </span>
              <span className={c.weak ? styles.barValueWeak : styles.barValue}>{c.avg === null ? 'не оценивалось' : `${String(c.avg).replace('.', ',')}${c.weak ? ' · слабое место' : ''}`}</span>
            </li>
          ))}
        </ul>
      </section>
      {prog.errorTypes.length ? (
        <section className={styles.block} aria-label="Частые ошибки">
          <h4>Какие ошибки вы выбираете чаще</h4>
          <ul className={styles.list}>
            {prog.errorTypes.map((e) => (
              <li key={e.type}>
                <span>{errorLabel(e.type)}</span>
                <span className={styles.hint}>раз: {e.count}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {prog.weakObjections.length ? (
        <section className={styles.block} aria-label="Что повторить">
          <h4>Где чаще ошибаетесь с первого раза</h4>
          <ul className={styles.list}>
            {prog.weakObjections.map((w) => (
              <li key={w.objectionId}>
                <span>{w.title}</span>
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
        {history.length ? (
          <>
            <ul className={styles.list}>
              {shown.map((a) => (
                <AttemptRow key={a.id} a={a} />
              ))}
            </ul>
            {history.length > shown.length ? (
              <button type="button" className={styles.secondary} onClick={() => setMore(true)}>
                Показать все попытки ({history.length})
              </button>
            ) : null}
          </>
        ) : (
          <p className={styles.hint}>Здесь появятся ваши попытки.</p>
        )}
      </section>
      <Fold title="По причинам отказа" hint={sum(prog.reasons)}>
        <MasteryList rows={prog.reasons} />
      </Fold>
      <Fold title="По темам проверки знаний" hint={sum(prog.topics)} label="По темам">
        <MasteryList rows={prog.topics} />
      </Fold>
      <div className={styles.actions}>
        <button type="button" className={styles.danger} onClick={() => setConfirm(true)} disabled={!t.attempts.length && !t.cards.length && !t.legacyCount}>
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
        <section className={styles.block} aria-label="Типичная ошибка">
          <h4>Типичная ошибка</h4>
          <p>{o.commonMistake}</p>
        </section>
        <Fold title="Источники" hint={`источников: ${o.sourceQuotes.length}`}>
          <Quotes quotes={o.sourceQuotes} videos={t.content.objections.videos} copyable={t.role === 'stp_admin'} />
        </Fold>
        <div className={`${styles.stickyBar} ${styles.actions}`}>
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
    <Page title="Банк возражений" back={{ label: 'Тренажёр продаж', to: { page: 'home' } }} lead="Справочник: что ответить, что показать и чем это подтверждено.">
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
      <p className={styles.hint}>Карточек: {list.length}. Нажмите на карточку, чтобы открыть ответ целиком.</p>
      {list.length === 0 ? <p className={styles.notice}>По этой причине для вашей роли возражений нет. Выберите другую или включите «Показывать материалы всех ролей».</p> : null}
      <ul className={styles.cards}>
        {list.map((o) => (
          <li key={o.id}>
            <button type="button" className={styles.cardBtn} onClick={() => go({ page: 'bank', id: o.id })}>
              <strong>{o.panel.title}</strong>
              <span className={`${styles.meta} ${styles.clamp}`}>{o.panel.shortAnswer}</span>
              <span className={styles.tag}>{reasons.find((r) => r.key === o.refusalReasonKey)?.title}</span>
            </button>
          </li>
        ))}
      </ul>
    </Page>
  );
}
