/**
 * Обучение в аналитике. Вкладка «Обучение»: у владельца — таблица сотрудников своей компании, у администратора
 * СтП — сводка по компаниям. Сотрудник и компания открываются отдельными страницами (не боковыми панелями).
 */
import { useEffect, useState } from 'react';
import type { CompanyTrainingSummary, WeakTopic } from '../../../../packages/shared/trainingStats.js';
import styles from './partner.module.css';
import ui from './TrainingAnalytics.module.css';
import { goAnalytics } from './analyticsRoute';
import {
  fetchTrainingCompanies,
  fetchTrainingOrg,
  fetchTrainingUser,
  type TrainingCompanyRow,
  type TrainingOrgView,
  type TrainingUserView,
} from './trainingApi';
import {
  MODE_LABELS,
  ROLE_TITLES,
  dateLabel,
  employeesWord,
  percent,
  sinceLabel,
  topicLabel,
} from './trainingLabels';

type Loaded<T> = { data: T | null; error: string | null; loading: boolean; reload: () => void };

function useLoaded<T>(load: () => Promise<T>, key: string): Loaded<T> {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({
    data: null,
    error: null,
    loading: true,
  });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    load()
      .then((data) => alive && setState({ data, error: null, loading: false }))
      .catch((error: unknown) =>
        alive &&
        setState({
          data: null,
          error: error instanceof Error && error.message ? error.message : 'Не удалось загрузить обучение',
          loading: false,
        }),
      );
    return () => {
      alive = false;
    };
  }, [key, tick]);
  return { ...state, reload: () => setTick((n) => n + 1) };
}

function Status<T>({ state, children }: { state: Loaded<T>; children: (data: T) => React.ReactNode }) {
  if (state.loading && !state.data) {
    return (
      <p className={`${styles.hint} ${ui.state}`} role="status">
        Загружаем обучение…
      </p>
    );
  }
  if (state.error) {
    return (
      <>
        <p className={styles.error} role="alert">
          {state.error}
        </p>
        <button type="button" className={`${styles.ghost} ${ui.retry}`} onClick={state.reload}>
          Повторить
        </button>
      </>
    );
  }
  return state.data ? <>{children(state.data)}</> : null;
}

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <li className={ui.tile}>
      <span className={ui.tileLabel}>{label}</span>
      <strong className={ui.tileValue}>{value}</strong>
      {note ? <span className={ui.tileNote}>{note}</span> : null}
    </li>
  );
}

function LevelChip({ id, title }: { id: string; title: string }) {
  const cls = id === 'pro' ? ui.levelPro : id === 'basic' ? ui.levelBasic : '';
  return (
    <span className={`${ui.level} ${cls}`} data-level={id}>
      {title}
    </span>
  );
}

function Tags({ topics, empty = '—' }: { topics: WeakTopic[]; empty?: string }) {
  if (!topics.length) return <span className={ui.muted}>{empty}</span>;
  return (
    <ul className={ui.tags}>
      {topics.slice(0, 3).map((topic) => (
        <li key={`${topic.kind}:${topic.key}`} className={ui.tag}>
          {topicLabel(topic)}
        </li>
      ))}
    </ul>
  );
}

function CompanyTiles({ summary }: { summary: CompanyTrainingSummary }) {
  return (
    <ul className={ui.tiles} aria-label="Итоги обучения">
      <Tile label="Прошли обучение" value={`${summary.trained} из ${summary.staffTotal}`} note="хотя бы один подход" />
      <Tile label="Верно с первой попытки" value={percent(summary.avgShare)} note="в среднем по сотрудникам" />
      <Tile label="Занимались за 7 дней" value={String(summary.active7)} note={employeesWord(summary.active7)} />
      <Tile label="Занимались за 30 дней" value={String(summary.active30)} note={employeesWord(summary.active30)} />
    </ul>
  );
}

function openEmployee(userId: string) {
  goAnalytics({ page: 'training-user', metric: null, role: null, userId, period: null, orgId: null }, 'push');
}

function EmployeesTable({ rows }: { rows: TrainingOrgView['employees'] }) {
  if (!rows.length) return <p className={styles.hint}>В компании пока нет сотрудников.</p>;
  return (
    <div className={styles.dashTableScroll}>
      <table className={styles.dashTable} data-testid="training-employees">
        <thead>
          <tr>
            <th scope="col">Сотрудник</th>
            <th scope="col">Уровень</th>
            <th scope="col">Верно с первой попытки</th>
            <th scope="col">Подходов</th>
            <th scope="col">Последнее занятие</th>
            <th scope="col">Слабые места</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className={ui.row} onClick={() => openEmployee(row.id)} data-testid="training-row">
              <td data-label="Сотрудник">
                <button
                  type="button"
                  className={ui.rowButton}
                  aria-label={`Обучение: ${row.displayName}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    openEmployee(row.id);
                  }}
                >
                  {row.displayName}
                </button>
                <span className={ui.muted}> {ROLE_TITLES[row.role] ?? ''}</span>
              </td>
              <td data-label="Уровень">
                <LevelChip id={row.level.id} title={row.level.title} />
              </td>
              <td data-label="Верно с первой попытки">{percent(row.levelShare)}</td>
              <td data-label="Подходов">{row.sets}</td>
              <td data-label="Последнее занятие" title={dateLabel(row.lastActivityAt)}>
                {sinceLabel(row.lastActivityAt)}
              </td>
              <td data-label="Слабые места">
                <Tags topics={row.weakTopics} empty={row.sets ? 'нет' : '—'} />
                {row.weakCriteria.length ? (
                  <span className={ui.muted}> {row.weakCriteria.map((c) => c.title).join(', ')}</span>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CompaniesTable({ rows }: { rows: TrainingCompanyRow[] }) {
  if (!rows.length) return <p className={styles.hint}>Компаний пока нет.</p>;
  const open = (id: string) =>
    goAnalytics({ page: 'training-company', metric: null, role: null, userId: null, period: null, orgId: id }, 'push');
  return (
    <div className={styles.dashTableScroll}>
      <table className={styles.dashTable} data-testid="training-companies">
        <thead>
          <tr>
            <th scope="col">Компания</th>
            <th scope="col">Обучено сотрудников</th>
            <th scope="col">Средний результат</th>
            <th scope="col">Занимались за 7 дней</th>
            <th scope="col">Занимались за 30 дней</th>
            <th scope="col">Слабые места</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className={ui.row} onClick={() => open(row.id)} data-testid="training-company-row">
              <td data-label="Компания">
                <button
                  type="button"
                  className={ui.rowButton}
                  aria-label={`Обучение компании ${row.name}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    open(row.id);
                  }}
                >
                  {row.name}
                </button>
              </td>
              <td data-label="Обучено сотрудников">
                {row.summary.trained} из {row.summary.staffTotal}
              </td>
              <td data-label="Средний результат">{percent(row.summary.avgShare)}</td>
              <td data-label="За 7 дней">{row.summary.active7}</td>
              <td data-label="За 30 дней">{row.summary.active30}</td>
              <td data-label="Слабые места">
                <Tags topics={row.summary.weakTopics} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Вкладка «Обучение» внутри аналитики. */
export function TrainingTab({ mode }: { mode: 'partner' | 'admin' }) {
  const orgState = useLoaded(() => (mode === 'partner' ? fetchTrainingOrg(null) : Promise.resolve(null)), `org:${mode}`);
  const companiesState = useLoaded(
    () => (mode === 'admin' ? fetchTrainingCompanies() : Promise.resolve([] as TrainingCompanyRow[])),
    `companies:${mode}`,
  );
  if (mode === 'admin') {
    return (
      <section className={ui.section} aria-label="Обучение по компаниям" data-testid="training-tab">
        <p className={styles.lead}>Как компании проходят тренажёр возражений. Нажмите на компанию, чтобы увидеть сотрудников.</p>
        <Status state={companiesState}>{(rows) => <CompaniesTable rows={rows} />}</Status>
      </section>
    );
  }
  return (
    <section className={ui.section} aria-label="Обучение сотрудников" data-testid="training-tab">
      <p className={styles.lead}>Как сотрудники проходят тренажёр возражений. Нажмите на сотрудника, чтобы увидеть подробности.</p>
      <Status state={orgState}>
        {(view) =>
          view ? (
            <>
              <CompanyTiles summary={view.summary} />
              <EmployeesTable rows={view.employees} />
            </>
          ) : null
        }
      </Status>
    </section>
  );
}

function PageHead({
  crumbs,
  title,
  lead,
}: {
  crumbs: { label: string; back?: boolean }[];
  title: string;
  lead: string;
}) {
  return (
    <div className={ui.head}>
      <div>
        <nav className={styles.crumbs} aria-label="Путь">
          {crumbs.map((crumb, index) => (
            <span key={`${crumb.label}-${index}`} className={styles.crumb}>
              {index ? <span aria-hidden>/</span> : null}
              {crumb.back ? (
                <button type="button" className={styles.crumbBtn} onClick={() => window.history.back()}>
                  {crumb.label}
                </button>
              ) : (
                <span>{crumb.label}</span>
              )}
            </span>
          ))}
        </nav>
        <h3>{title}</h3>
        <p className={styles.lead}>{lead}</p>
      </div>
      <button type="button" className={styles.ghost} onClick={() => window.history.back()}>
        Назад
      </button>
    </div>
  );
}

/** Названия возражений грузим только на странице сотрудника: файл тренажёра большой. */
function useObjectionTitles(ids: string[]): Record<string, string> {
  const [titles, setTitles] = useState<Record<string, string>>({});
  const key = ids.join('|');
  useEffect(() => {
    if (!ids.length) return;
    let alive = true;
    void import('../trainer/content')
      .then((mod) => mod.loadTrainerContent())
      .then((content) => {
        if (!alive) return;
        const map: Record<string, string> = {};
        for (const id of ids) {
          const found = content.objections.objections.find((o) => o.id === id);
          if (found) map[id] = found.panel.title.replace(/[«»]/g, '');
        }
        setTitles(map);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [key]);
  return titles;
}

function UserBody({ view }: { view: TrainingUserView }) {
  const { summary } = view;
  const titles = useObjectionTitles(summary.weakObjections.map((o) => o.objectionId));
  return (
    <>
      <ul className={ui.tiles} aria-label="Итоги сотрудника">
        <li className={ui.tile}>
          <span className={ui.tileLabel}>Уровень</span>
          <LevelChip id={summary.level.id} title={summary.level.title} />
          <span className={ui.tileNote}>по последним ответам</span>
        </li>
        <Tile label="Верно с первой попытки" value={percent(summary.levelShare)} note="последние ответы" />
        <Tile label="Подходов" value={String(summary.sets)} note={`засчитано: ${summary.passedSets}`} />
        <Tile label="Викторина" value={percent(summary.quizShare)} note={`подходов: ${summary.quizSets}`} />
        <Tile label="Открыл материалов" value={String(summary.materialsOpened)} note={`открытий: ${summary.materialOpens}`} />
        <Tile label="Последнее занятие" value={sinceLabel(summary.lastActivityAt)} note={dateLabel(summary.lastActivityAt)} />
      </ul>

      <div className={ui.section}>
        <h4 className={ui.sectionTitle}>Критерии ответа</h4>
        {summary.criteria.every((c) => c.avg === null) ? (
          <p className={styles.hint}>Оценок по критериям пока нет.</p>
        ) : (
          <ul className={ui.bars} data-testid="training-criteria">
            {summary.criteria.map((c) => (
              <li key={c.id} className={ui.bar}>
                <span>
                  {c.title}
                  {c.weak ? ' — слабое место' : ''}
                </span>
                <strong>{c.avg === null ? '—' : `${c.avg.toFixed(1).replace('.', ',')} из 5`}</strong>
                <span className={ui.barTrack} aria-hidden>
                  <span
                    className={`${ui.barFill} ${c.weak ? ui.barWeak : ''}`}
                    style={{ display: 'block', width: `${Math.round(((c.avg ?? 0) / 5) * 100)}%` }}
                  />
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={ui.section}>
        <h4 className={ui.sectionTitle}>Слабые темы</h4>
        {summary.weakTopics.length ? (
          <ul className={ui.list} data-testid="training-weak-topics">
            {summary.weakTopics.map((topic) => (
              <li key={`${topic.kind}:${topic.key}`} className={ui.listItem}>
                <span>
                  {topic.kind === 'quiz' ? 'Викторина: ' : 'Возражение: '}
                  {topicLabel(topic)}
                </span>
                <strong>ошибок: {topic.count}</strong>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.hint}>Явных слабых тем нет.</p>
        )}
        {summary.weakObjections.length ? (
          <>
            <h4 className={ui.sectionTitle}>Где чаще всего ошибается</h4>
            <ul className={ui.list}>
              {summary.weakObjections.map((o) => (
                <li key={o.objectionId} className={ui.listItem}>
                  <span>{titles[o.objectionId] ?? 'Возражение'}</span>
                  <strong>ошибок: {o.count}</strong>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>

      <div className={ui.section}>
        <h4 className={ui.sectionTitle}>Последние подходы</h4>
        {view.attempts.length ? (
          <div className={styles.dashTableScroll}>
            <table className={styles.dashTable} data-testid="training-attempts">
              <thead>
                <tr>
                  <th scope="col">Когда</th>
                  <th scope="col">Режим</th>
                  <th scope="col">Результат</th>
                  <th scope="col">Вопросов</th>
                  <th scope="col">Итог</th>
                </tr>
              </thead>
              <tbody>
                {view.attempts.map((a) => (
                  <tr key={a.id}>
                    <td data-label="Когда">{dateLabel(a.finishedAt)}</td>
                    <td data-label="Режим">{MODE_LABELS[a.mode] ?? a.mode}</td>
                    <td data-label="Результат">{percent(a.share)}</td>
                    <td data-label="Вопросов">{a.count}</td>
                    <td data-label="Итог">{a.passed ? 'засчитан' : 'не засчитан'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className={styles.hint}>Подходов пока не было.</p>
        )}
      </div>

      <div className={ui.section}>
        <h4 className={ui.sectionTitle}>Открытые материалы</h4>
        {summary.recentMaterials.length ? (
          <ul className={ui.list} data-testid="training-materials">
            {summary.recentMaterials.map((m) => (
              <li key={`${m.materialId}:${m.at}`} className={ui.listItem}>
                <span>{m.title}</span>
                <span className={ui.muted}>{sinceLabel(m.at)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.hint}>Материалы пока не открывал.</p>
        )}
      </div>
    </>
  );
}

/** Страница сотрудника: `#analytics/training/<id>`. */
export function TrainingUserPage({ userId }: { userId: string }) {
  const state = useLoaded(() => fetchTrainingUser(userId), `user:${userId}`);
  const view = state.data;
  const name = view?.employee.displayName ?? 'Сотрудник';
  const lead = view
    ? `${ROLE_TITLES[view.employee.role] ?? 'Сотрудник'}${view.org ? ` · ${view.org.name}` : ''}`
    : 'Обучение сотрудника';
  return (
    <section className={styles.sheet} role="region" aria-label="Обучение сотрудника" data-testid="training-user-page">
      <PageHead
        crumbs={[{ label: 'Аналитика', back: true }, ...(view ? [{ label: name }] : [])]}
        title={name}
        lead={lead}
      />
      <Status state={state}>{(data) => <UserBody view={data} />}</Status>
    </section>
  );
}

/** Страница компании: `#analytics/training-company/<id>` (для администратора). */
export function TrainingCompanyPage({ orgId }: { orgId: string }) {
  const state = useLoaded(() => fetchTrainingOrg(orgId), `company:${orgId}`);
  const view = state.data;
  const title = view?.org.name ?? 'Компания';
  return (
    <section className={styles.sheet} role="region" aria-label="Обучение компании" data-testid="training-company-page">
      <PageHead
        crumbs={[{ label: 'Аналитика', back: true }, { label: 'Обучение', back: true }, ...(view ? [{ label: title }] : [])]}
        title={title}
        lead={view ? `Сотрудников: ${view.summary.staffTotal}` : 'Обучение компании'}
      />
      <Status state={state}>
        {(data) => (
          <>
            <CompanyTiles summary={data.summary} />
            <div className={ui.section}>
              <h4 className={ui.sectionTitle}>Слабые места компании</h4>
              <Tags topics={data.summary.weakTopics} empty="Явных слабых мест нет" />
              <h4 className={ui.sectionTitle}>Сотрудники</h4>
              <EmployeesTable rows={data.employees} />
            </div>
          </>
        )}
      </Status>
    </section>
  );
}
