import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  JOB_OBJECT_STATUS_LABELS,
  PROJECT_STATUSES,
  canCreateObjects,
  documentLabel,
  roleSeesProjectMoney,
  visibleDocuments,
  type JobObject,
  type JobObjectStatus,
  type Project,
  type ProjectInput,
  type ProjectStatus,
  type UserRole,
} from '../../../../packages/shared/partner';
import { formatRub } from './estimate';
import {
  areaSum,
  effectiveProjectStatus,
  formatArea,
  formatProjectDay,
  nextSteps,
  personName,
  problemomerLine,
  projectAssigneeId,
  projectMatches,
  projectRooms,
  panelLabel,
  projectStatusLabel,
  roomTitle,
  readProjectView,
  writeProjectView,
  crewProjectLists,
  type CrewProjectGroup,
  type ProjectDeskView,
} from './projectDesk';
import type { ProjectTab } from './projectRoute';
import { preliminaryRoomTotal } from './projectSummary';
import styles from './ProjectDesk.module.css';

type Person = { id: string; role: UserRole; displayName: string };

const TABS = [
  ['overview', 'Обзор'],
  ['work', 'Рабочая информация'],
  ['team', 'Команда'],
  ['tasks', 'Задачи'],
  ['reports', 'Отчёты'],
  ['documents', 'Документы'],
  ['settings', 'Настройки'],
] as const;

type TabId = (typeof TABS)[number][0];

type Row = {
  project: Project;
  rooms: JobObject[];
  status: ProjectStatus;
  archived: boolean;
};

export function ProjectDesk({
  projects,
  rooms,
  role,
  staff,
  actor,
  query,
  page,
  onOpenProject,
  onDesk,
  onTab,
  onSave,
  onOpenRoom,
  onAddRoom,
  onDeleteProject,
}: {
  projects: Project[];
  rooms: JobObject[];
  role: UserRole;
  staff: Person[];
  actor?: Person;
  query: string;
  page: { projectId: string; tab: ProjectTab } | null;
  onOpenProject: (id: string) => void;
  onDesk: () => void;
  onTab: (tab: ProjectTab) => void;
  onSave: (id: string, input: ProjectInput) => Promise<Project>;
  onOpenRoom: (room: JobObject) => void;
  onAddRoom?: (projectId: string, roomName: string) => Promise<void>;
  onDeleteProject?: (project: Project) => void;
}) {
  const [view, setView] = useState<ProjectDeskView>(() =>
    readProjectView(typeof localStorage === 'undefined' ? null : localStorage),
  );
  const [archive, setArchive] = useState(false);
  const seesMoney = roleSeesProjectMoney(role);
  const canEdit = canCreateObjects(role);
  const archiveCount = projects.filter((project) => project.archivedAt).length;

  const rows = useMemo<Row[]>(
    () =>
      projects
        .map((project) => {
          const own = projectRooms(project, rooms);
          return {
            project,
            rooms: own,
            status: effectiveProjectStatus(project, own),
            archived: Boolean(project.archivedAt),
          };
        })
        .filter((row) => row.archived === archive)
        .filter((row) => projectMatches(row.project, row.rooms, query)),
    [projects, rooms, archive, query],
  );

  const open = useMemo(() => {
    if (!page) return null;
    const visible = rows.find((row) => row.project.id === page.projectId);
    if (visible) return visible;
    const project = projects.find((item) => item.id === page.projectId);
    if (!project) return null;
    const own = projectRooms(project, rooms);
    return {
      project,
      rooms: own,
      status: effectiveProjectStatus(project, own),
      archived: Boolean(project.archivedAt),
    };
  }, [page, rows, projects, rooms]);

  function choose(next: ProjectDeskView) {
    setView(next);
    writeProjectView(typeof localStorage === 'undefined' ? null : localStorage, next);
  }

  if (page) {
    if (!open) {
      return (
        <section className={styles.page} aria-label="Проект">
          <p className={styles.empty}>Проект не найден или вам его не назначили.</p>
          <button type="button" className={styles.ghost} onClick={onDesk}>
            К проектам
          </button>
        </section>
      );
    }
    return (
      <ProjectPage
        row={open}
        staff={staff}
        actor={actor}
        seesMoney={seesMoney}
        canEdit={canEdit}
        tab={page.tab}
        onTab={onTab}
        onDesk={onDesk}
        onSave={onSave}
        onOpenRoom={onOpenRoom}
        onAddRoom={onAddRoom}
        onDeleteProject={onDeleteProject}
      />
    );
  }

  if (role === 'crew') {
    return <CrewJobs projects={projects} rooms={rooms} query={query} onOpenRoom={onOpenRoom} />;
  }

  return (
    <section className={styles.desk} aria-label="Список проектов">
      <div className={styles.bar}>
        <p className={styles.lead}>Клиент, адрес и стадия. Комнаты открываются внутри карточки.</p>
        <div className={styles.tools}>
          <div className={styles.switch} role="group" aria-label="Вид проектов">
            <button type="button" aria-pressed={view === 'list'} onClick={() => choose('list')}>
              Список
            </button>
            <button type="button" aria-pressed={view === 'kanban'} onClick={() => choose('kanban')}>
              Канбан
            </button>
          </div>
          <button type="button" className={styles.quiet} aria-pressed={archive} onClick={() => setArchive((value) => !value)}>
            Архив{archiveCount ? `: ${archiveCount}` : ''}
          </button>
        </div>
      </div>
      {!rows.length ? (
        <p className={styles.empty}>
          {query ? 'По этому запросу проектов нет.' : archive ? 'В архиве пусто.' : 'Пока нет проектов. Новый проект создаётся вместе с первой комнатой.'}
        </p>
      ) : view === 'list' ? (
        <ProjectTable rows={rows} seesMoney={seesMoney} onOpen={onOpenProject} />
      ) : (
        <ProjectBoard rows={rows} seesMoney={seesMoney} onOpen={onOpenProject} />
      )}
    </section>
  );
}

function CrewJobs({
  projects,
  rooms,
  query,
  onOpenRoom,
}: {
  projects: Project[];
  rooms: JobObject[];
  query: string;
  onOpenRoom: (room: JobObject) => void;
}) {
  const { active, done } = useMemo(() => crewProjectLists(projects, rooms, query), [projects, rooms, query]);
  return (
    <section className={styles.desk} aria-label="Список проектов">
      <p className={styles.lead}>Ваши комнаты: адрес, площадь, панели и статус.</p>
      {!active.length && !done.length ? (
        <p className={styles.empty}>
          {query ? 'По этому запросу проектов нет.' : 'Пока нет назначенных комнат.'}
        </p>
      ) : (
        <>
          {active.length ? (
            <div className={styles.crewList}>
              {active.map((group) => (
                <CrewProject key={group.project.id} group={group} onOpenRoom={onOpenRoom} />
              ))}
            </div>
          ) : (
            <p className={styles.empty}>Незакрытых комнат нет.</p>
          )}
          {done.length ? (
            <details className={styles.done}>
              <summary>Готовые · {done.length}</summary>
              <div className={styles.crewList}>
                {done.map((group) => (
                  <CrewProject key={group.project.id} group={group} onOpenRoom={onOpenRoom} />
                ))}
              </div>
            </details>
          ) : null}
        </>
      )}
    </section>
  );
}

function roomPlace(project: Project, room: JobObject): string {
  const address = room.address?.trim() || project.address?.trim();
  const city = room.city?.trim() || project.city?.trim();
  return [address, city].filter(Boolean).join(', ') || 'Адрес не заполнен';
}

function CrewProject({
  group,
  onOpenRoom,
}: {
  group: CrewProjectGroup;
  onOpenRoom: (room: JobObject) => void;
}) {
  const { project, rooms } = group;
  return (
    <article className={styles.crewProject} data-project-id={project.id}>
      <h3>{project.name || project.clientName || 'Проект'}</h3>
      <div className={styles.rooms}>
        {rooms.map((room) => {
          const title = roomTitle(room);
          const place = roomPlace(project, room);
          const facts = [
            room.room?.areaM2 != null ? formatArea(room.room.areaM2) : 'Площадь не указана',
            panelLabel(room.estimate?.panels),
            JOB_OBJECT_STATUS_LABELS[room.status as JobObjectStatus] || room.status,
          ].join(' · ');
          return (
            <button
              key={room.id}
              type="button"
              className={styles.roomBtn}
              aria-label={`${title}, ${place}, ${facts}`}
              onClick={() => onOpenRoom(room)}
            >
              <span>
                <strong>{title}</strong>
                <span>{place}</span>
                <span>{facts}</span>
              </span>
            </button>
          );
        })}
      </div>
    </article>
  );
}

function ProjectTable({
  rows,
  seesMoney,
  onOpen,
}: {
  rows: Row[];
  seesMoney: boolean;
  onOpen: (id: string) => void;
}) {
  return (
    <div className={styles.scroller}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Проект</th>
            <th>Клиент</th>
            <th>Адрес</th>
            <th>Статус</th>
            <th>Комнаты</th>
            <th>Площадь</th>
            {seesMoney ? <th>Сумма</th> : null}
            <th>Срок</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const area = areaSum(row.rooms);
            const money = preliminaryRoomTotal(row.rooms);
            return (
              <tr key={row.project.id} data-project-id={row.project.id} onClick={() => onOpen(row.project.id)}>
                <td>
                  <button type="button" className={styles.row} onClick={() => onOpen(row.project.id)}>
                    {row.project.name}
                  </button>
                </td>
                <td className={styles.cell}>{row.project.clientName || '—'}</td>
                <td className={styles.cell}>{row.project.address || 'Адрес не заполнен'}</td>
                <td className={styles.cell}>{projectStatusLabel(row.status)}</td>
                <td className={styles.cell}>{row.rooms.length}</td>
                <td className={styles.cell}>{area.known ? formatArea(area.total) : '—'}</td>
                {seesMoney ? (
                  <td className={styles.cell}>{money.calculated ? formatRub(money.total) : 'Нет расчёта'}</td>
                ) : null}
                <td className={styles.cell}>{formatProjectDay(row.project.dueAt)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ProjectBoard({
  rows,
  seesMoney,
  onOpen,
}: {
  rows: Row[];
  seesMoney: boolean;
  onOpen: (id: string) => void;
}) {
  return (
    <div className={styles.board}>
      {PROJECT_STATUSES.map((status) => {
        const column = rows.filter((row) => row.status === status);
        return (
          <section key={status} className={styles.column} data-project-stage={status} aria-label={projectStatusLabel(status)}>
            <div className={styles.columnHead}>
              <h3>{projectStatusLabel(status)}</h3>
              <span className={styles.count}>{column.length}</span>
            </div>
            <div className={styles.cards}>
              {column.map((row) => {
                const area = areaSum(row.rooms);
                const money = preliminaryRoomTotal(row.rooms);
                return (
                  <button
                    key={row.project.id}
                    type="button"
                    className={styles.card}
                    data-project-id={row.project.id}
                    onClick={() => onOpen(row.project.id)}
                  >
                    <strong>{row.project.name}</strong>
                    <span>{[row.project.clientName, row.project.address].filter(Boolean).join(' · ') || 'Адрес не заполнен'}</span>
                    <span>
                      {row.rooms.length} пом.
                      {area.known ? ` · ${formatArea(area.total)}` : ''}
                      {seesMoney && money.calculated ? ` · ${formatRub(money.total)}` : ''}
                    </span>
                  </button>
                );
              })}
              {!column.length ? <p className={styles.empty}>Пока пусто</p> : null}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function ProjectPage({
  row,
  staff,
  actor,
  seesMoney,
  canEdit,
  tab,
  onTab,
  onDesk,
  onSave,
  onOpenRoom,
  onAddRoom,
  onDeleteProject,
}: {
  row: Row;
  staff: Person[];
  actor?: Person;
  seesMoney: boolean;
  canEdit: boolean;
  tab: TabId;
  onTab: (tab: TabId) => void;
  onDesk: () => void;
  onSave: (id: string, input: ProjectInput) => Promise<Project>;
  onOpenRoom: (room: JobObject) => void;
  onAddRoom?: (projectId: string, roomName: string) => Promise<void>;
  onDeleteProject?: (project: Project) => void;
}) {
  const people = actor && !staff.some((person) => person.id === actor.id) ? [actor, ...staff] : staff;
  const { project, rooms, status } = row;
  const area = areaSum(rooms);
  const money = preliminaryRoomTotal(rooms);
  const steps = nextSteps(rooms);
  const subtitle =
    [project.clientName, [project.address, project.city].filter(Boolean).join(', '), projectStatusLabel(status)]
      .filter(Boolean)
      .join(' · ') || 'Контакт и адрес пока не заполнены';

  return (
    <section className={styles.page} aria-label="Проект">
      <nav className={styles.crumbs} aria-label="Путь">
        <button type="button" onClick={onDesk}>
          Проекты
        </button>
        <span aria-hidden="true">/</span>
        <span>{project.name}</span>
      </nav>
      <header className={styles.pageHead}>
        <div>
          <p className={styles.eyebrow}>Проекты</p>
          <h1>{project.name}</h1>
          <p className={styles.lead}>{subtitle}</p>
        </div>
        {canEdit ? (
          <button type="button" className={styles.ghost} aria-pressed={tab === 'settings'} onClick={() => onTab('settings')}>
            Настройки проекта
          </button>
        ) : null}
      </header>
      <div className={styles.tabs} role="tablist" aria-label="Разделы проекта">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={styles.tab}
            role="tab"
            aria-selected={tab === id}
            onClick={() => onTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className={styles.pageBody}>
        {tab === 'overview' ? (
          <Overview
            project={project}
            status={status}
            rooms={rooms}
            area={area}
            money={money}
            seesMoney={seesMoney}
            steps={steps}
            canEdit={canEdit}
            onOpenRoom={onOpenRoom}
            onSettings={() => onTab('settings')}
          />
        ) : null}
        {tab === 'work' ? (
          <Work
            rooms={rooms}
            seesMoney={seesMoney}
            onOpenRoom={onOpenRoom}
            onAddRoom={canEdit && onAddRoom ? (name) => onAddRoom(project.id, name) : undefined}
          />
        ) : null}
        {tab === 'team' ? <Team project={project} rooms={rooms} staff={people} /> : null}
        {tab === 'tasks' ? <Tasks steps={steps} rooms={rooms} onOpenRoom={onOpenRoom} /> : null}
        {tab === 'reports' ? <Reports rooms={rooms} onOpenRoom={onOpenRoom} /> : null}
        {tab === 'documents' ? <Documents rooms={rooms} onOpenRoom={onOpenRoom} /> : null}
        {tab === 'settings' ? (
          <Settings project={project} rooms={rooms} status={status} staff={people} actor={actor} canEdit={canEdit} onSave={onSave} onDelete={onDeleteProject} />
        ) : null}
      </div>
    </section>
  );
}

function Overview({
  project,
  status,
  rooms,
  area,
  money,
  seesMoney,
  steps,
  canEdit,
  onOpenRoom,
  onSettings,
}: {
  project: Project;
  status: ProjectStatus;
  rooms: JobObject[];
  area: ReturnType<typeof areaSum>;
  money: ReturnType<typeof preliminaryRoomTotal>;
  seesMoney: boolean;
  steps: ReturnType<typeof nextSteps>;
  canEdit: boolean;
  onOpenRoom: (room: JobObject) => void;
  onSettings: () => void;
}) {
  return (
    <div className={styles.stack}>
      <span className={styles.badge}>{projectStatusLabel(status)}</span>
      <dl className={styles.facts}>
        <div>
          <dt>Клиент</dt>
          <dd>{project.clientName || 'Не указан'}</dd>
        </div>
        <div>
          <dt>Адрес</dt>
          <dd>{[project.address, project.city].filter(Boolean).join(', ') || 'Не указан'}</dd>
        </div>
        <div>
          <dt>Комнаты</dt>
          <dd>{rooms.length}</dd>
        </div>
        <div>
          <dt>Площадь</dt>
          <dd>{area.known ? formatArea(area.total) : 'Не указана'}</dd>
        </div>
        {seesMoney ? (
          <div>
            <dt>Сумма</dt>
            <dd>{money.calculated ? formatRub(money.total) : 'Нет расчёта'}</dd>
          </div>
        ) : null}
        <div>
          <dt>Срок</dt>
          <dd>{formatProjectDay(project.dueAt)}</dd>
        </div>
      </dl>
      {seesMoney && money.calculated && money.calculated < money.rooms ? (
        <p className={styles.lead}>Рассчитано {money.calculated} из {money.rooms}. Сумма неполная и меняется вместе с комнатами.</p>
      ) : null}
      <div className={styles.note}>
        <strong>Описание</strong>
        {project.description?.trim() ? (
          <p className={styles.prose}>{project.description}</p>
        ) : (
          <p className={styles.lead}>Описания пока нет.</p>
        )}
        {!project.description?.trim() && canEdit ? (
          <button type="button" className={styles.ghost} onClick={onSettings}>
            Заполнить в настройках
          </button>
        ) : null}
      </div>
      <div>
        <h4>Ближайшие шаги</h4>
        {steps.length ? (
          <div className={styles.steps}>
            {steps.map((step) => (
              <button key={step.roomId + step.text} type="button" className={styles.step} onClick={() => {
                const room = rooms.find((item) => item.id === step.roomId);
                if (room) onOpenRoom(room);
              }}>
                {step.text}
              </button>
            ))}
          </div>
        ) : (
          <p className={styles.lead}>{rooms.length ? 'Открытых шагов нет.' : 'В проекте пока нет доступных комнат.'}</p>
        )}
      </div>
    </div>
  );
}

function AddRoomForm({ onAdd }: { onAdd: (roomName: string) => Promise<void> }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    const label = name.trim();
    if (!label) return;
    setBusy(true);
    setError('');
    try {
      await onAdd(label);
      setName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось добавить комнату');
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className={`${styles.form} ${styles.addRoom}`} onSubmit={(event) => void submit(event)}>
      <label>
        Новая комната
        <input value={name} placeholder="Спальня" maxLength={120} onChange={(event) => setName(event.target.value)} />
      </label>
      <button type="submit" className={styles.primary} disabled={busy || !name.trim()}>
        {busy ? 'Сохраняем…' : 'Добавить комнату'}
      </button>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
    </form>
  );
}

function Work({
  rooms,
  seesMoney,
  onOpenRoom,
  onAddRoom,
}: {
  rooms: JobObject[];
  seesMoney: boolean;
  onOpenRoom: (room: JobObject) => void;
  onAddRoom?: (roomName: string) => Promise<void>;
}) {
  if (!rooms.length && !onAddRoom) return <p className={styles.lead}>В проекте пока нет доступных вам комнат.</p>;
  return (
    <>
    {onAddRoom ? <AddRoomForm onAdd={onAddRoom} /> : null}
    {!rooms.length ? <p className={styles.lead}>В проекте пока нет комнат.</p> : null}
    <div className={styles.rooms}>
      {rooms.map((room) => (
        <button key={room.id} type="button" className={styles.roomBtn} onClick={() => onOpenRoom(room)}>
          <span>
            <strong>{roomTitle(room)}</strong>
            <span>
              {room.room?.areaM2 != null ? formatArea(room.room.areaM2) : 'Площадь не указана'}
              {' · '}
              {JOB_OBJECT_STATUS_LABELS[room.status as JobObjectStatus] || room.status}
              {seesMoney && typeof room.estimate?.totalCost === 'number' ? ` · ${formatRub(room.estimate.totalCost)}` : ''}
            </span>
            <span>Проблемомер: {problemomerLine(room)}</span>
            <span>
              Расчёт:{' '}
              {room.estimate
                ? seesMoney && typeof room.estimate.totalCost === 'number'
                  ? `${room.estimate.panels} пан.`
                  : room.estimate.panels
                    ? `${room.estimate.panels} пан.`
                    : 'есть'
                : 'ещё нет'}
            </span>
          </span>
        </button>
      ))}
    </div>
    </>
  );
}

function Team({ project, rooms, staff }: { project: Project; rooms: JobObject[]; staff: Person[] }) {
  return (
    <div className={styles.stack}>
      <dl className={styles.team}>
        <div>
          <dt>Менеджер</dt>
          <dd>{personName(staff, projectAssigneeId(project, rooms, staff, 'manager'))}</dd>
        </div>
        <div>
          <dt>Замерщик</dt>
          <dd>{personName(staff, projectAssigneeId(project, rooms, staff, 'measurer'))}</dd>
        </div>
        <div>
          <dt>Бригада</dt>
          <dd>{personName(staff, projectAssigneeId(project, rooms, staff, 'crew'))}</dd>
        </div>
      </dl>
      {rooms.some((room) => room.assignedTo) ? (
        <div>
          <h4>Назначения по комнатам</h4>
          <ul className={styles.steps}>
            {rooms.filter((room) => room.assignedTo).map((room) => (
              <li key={room.id}>
                {roomTitle(room)}: {personName(staff, room.assignedTo)}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className={styles.lead}>По комнатам исполнители пока не назначены.</p>
      )}
    </div>
  );
}

function Tasks({
  steps,
  rooms,
  onOpenRoom,
}: {
  steps: ReturnType<typeof nextSteps>;
  rooms: JobObject[];
  onOpenRoom: (room: JobObject) => void;
}) {
  if (!steps.length) {
    return <p className={styles.lead}>{rooms.length ? 'Открытых задач нет. Закрытые комнаты сюда не попадают.' : 'Задачи появятся вместе с комнатами.'}</p>;
  }
  return (
    <div className={styles.steps}>
      {steps.map((step) => (
        <button
          key={step.roomId + step.text}
          type="button"
          className={styles.step}
          onClick={() => {
            const room = rooms.find((item) => item.id === step.roomId);
            if (room) onOpenRoom(room);
          }}
        >
          {step.text}
        </button>
      ))}
    </div>
  );
}

function Reports({ rooms, onOpenRoom }: { rooms: JobObject[]; onOpenRoom: (room: JobObject) => void }) {
  const measured = rooms.filter((room) => room.status !== 'draft' || room.room?.areaM2 != null);
  const installed = rooms.filter((room) => room.status === 'install' || room.status === 'closed');
  return (
    <div>
      <section className={styles.group}>
        <h4>Замеры</h4>
        {measured.length ? (
          <div className={styles.rooms}>
            {measured.map((room) => (
              <button key={room.id} type="button" className={styles.roomBtn} onClick={() => onOpenRoom(room)}>
                <span>
                  <strong>{roomTitle(room)}</strong>
                  <span>
                    {room.room?.areaM2 != null ? formatArea(room.room.areaM2) : 'Площадь не указана'}
                    {' · '}
                    {problemomerLine(room)}
                  </span>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className={styles.lead}>Замеров пока нет.</p>
        )}
      </section>
      <section className={styles.group}>
        <h4>Монтаж</h4>
        {installed.length ? (
          <div className={styles.rooms}>
            {installed.map((room) => (
              <button key={room.id} type="button" className={styles.roomBtn} onClick={() => onOpenRoom(room)}>
                <span>
                  <strong>{roomTitle(room)}</strong>
                  <span>{JOB_OBJECT_STATUS_LABELS[room.status as JobObjectStatus] || room.status}</span>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className={styles.lead}>Монтаж ещё не начат.</p>
        )}
      </section>
      <section className={styles.group}>
        <h4>Фото</h4>
        <p className={styles.lead}>Снимков замера и монтажа в карточках пока нет.</p>
      </section>
    </div>
  );
}

function Documents({ rooms, onOpenRoom }: { rooms: JobObject[]; onOpenRoom: (room: JobObject) => void }) {
  const docs = rooms.flatMap((room) => visibleDocuments(room.documents).map((doc) => ({ room, doc })));
  if (!docs.length) {
    return (
      <p className={styles.lead}>
        Профиль проблемомера появится после сохранения профиля, смета калькулятора и коммерческое предложение — после расчёта комнаты.
      </p>
    );
  }
  return (
    <div className={styles.docs}>
      {docs.map(({ room, doc }) => (
        <button key={doc.id} type="button" className={styles.doc} onClick={() => onOpenRoom(room)}>
          <span>
            <strong>{doc.kind === 'profile' ? 'Профиль проблемомера' : 'Смета калькулятора'}</strong>
            <span>
              {doc.kind === 'profile' ? documentLabel(doc.kind) : 'Коммерческое предложение'}
              {' · '}
              {roomTitle(room)}
              {doc.areaM2 ? ` · ${formatArea(doc.areaM2)}` : ''}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

function Settings({
  project,
  rooms,
  status,
  staff,
  actor,
  canEdit,
  onSave,
  onDelete,
}: {
  project: Project;
  rooms: JobObject[];
  status: ProjectStatus;
  staff: Person[];
  actor?: Person;
  canEdit: boolean;
  onSave: (id: string, input: ProjectInput) => Promise<Project>;
  onDelete?: (project: Project) => void;
}) {
  const [form, setForm] = useState(() => draftFrom(project, status, rooms, staff));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [savedTick, setSavedTick] = useState(0);
  useEffect(() => {
    setForm(draftFrom(project, status, rooms, staff));
  }, [project.id, project.updatedAt, status]);
  useEffect(() => {
    if (!savedTick) return;
    const timer = window.setTimeout(() => setSavedTick(0), 3200);
    return () => window.clearTimeout(timer);
  }, [savedTick]);

  if (!canEdit) {
    return (
      <div className={styles.stack}>
        <p className={styles.lead}>Описание и состав проекта. Менять их может владелец или менеджер.</p>
        <dl className={styles.team}>
          <div>
            <dt>Название</dt>
            <dd>{project.name}</dd>
          </div>
          <div>
            <dt>Описание</dt>
            <dd>{project.description?.trim() || 'Описания пока нет'}</dd>
          </div>
          <div>
            <dt>Клиент</dt>
            <dd>{project.clientName || 'Не указан'}</dd>
          </div>
          <div>
            <dt>Адрес</dt>
            <dd>{[project.address, project.city].filter(Boolean).join(', ') || 'Не указан'}</dd>
          </div>
          <div>
            <dt>Статус</dt>
            <dd>{projectStatusLabel(project.status || status)}</dd>
          </div>
          <div>
            <dt>Менеджер</dt>
            <dd>{personName(staff, projectAssigneeId(project, rooms, staff, 'manager'))}</dd>
          </div>
          <div>
            <dt>Замерщик</dt>
            <dd>{personName(staff, projectAssigneeId(project, rooms, staff, 'measurer'))}</dd>
          </div>
          <div>
            <dt>Бригада</dt>
            <dd>{personName(staff, projectAssigneeId(project, rooms, staff, 'crew'))}</dd>
          </div>
          <div>
            <dt>Начало</dt>
            <dd>{formatProjectDay(project.startsAt)}</dd>
          </div>
          <div>
            <dt>Срок</dt>
            <dd>{formatProjectDay(project.dueAt)}</dd>
          </div>
          <div>
            <dt>Архив</dt>
            <dd>{project.archivedAt ? 'В архиве' : 'В работе'}</dd>
          </div>
        </dl>
      </div>
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!form.name.trim()) return;
    setBusy(true);
    setError('');
    try {
      await onSave(project.id, {
        name: form.name.trim(),
        description: form.description,
        clientName: form.clientName,
        clientPhone: form.clientPhone,
        address: form.address,
        city: form.city,
        status: form.status,
        managerUserId: form.managerUserId || null,
        measurerUserId: form.measurerUserId || null,
        crewUserId: form.crewUserId || null,
        startsAt: form.startsAt || null,
        dueAt: form.dueAt || null,
        archived: form.archived,
      });
      setSavedTick((tick) => tick + 1);
    } catch (err) {
      setSavedTick(0);
      setError(err instanceof Error ? err.message : 'Не удалось сохранить');
    } finally {
      setBusy(false);
    }
  }

  const managers = peopleByRole(staff, actor, (person) => person.role === 'owner' || person.role === 'sales');
  const measurers = peopleByRole(staff, actor, (person) => person.role === 'measurer');
  const crews = peopleByRole(staff, actor, (person) => person.role === 'crew');

  return (
    <>
    <form className={styles.form} onSubmit={(event) => void submit(event)}>
      <label>
        Название
        <input value={form.name} required maxLength={250} onChange={(event) => setForm({ ...form, name: event.target.value })} />
      </label>
      <label>
        Описание
        <textarea
          value={form.description}
          maxLength={4000}
          onChange={(event) => setForm({ ...form, description: event.target.value })}
        />
      </label>
      <div className={styles.pair}>
        <label>
          Клиент
          <input value={form.clientName} maxLength={250} onChange={(event) => setForm({ ...form, clientName: event.target.value })} />
        </label>
        <label>
          Телефон
          <input value={form.clientPhone} maxLength={80} onChange={(event) => setForm({ ...form, clientPhone: event.target.value })} />
        </label>
      </div>
      <div className={styles.pair}>
        <label>
          Адрес
          <input value={form.address} maxLength={250} onChange={(event) => setForm({ ...form, address: event.target.value })} />
        </label>
        <label>
          Город
          <input value={form.city} maxLength={120} onChange={(event) => setForm({ ...form, city: event.target.value })} />
        </label>
      </div>
      <label>
        Статус
        <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as ProjectStatus })}>
          {PROJECT_STATUSES.map((status) => (
            <option key={status} value={status}>
              {projectStatusLabel(status)}
            </option>
          ))}
        </select>
      </label>
      <PeopleField label="Ответственный менеджер" people={managers} value={form.managerUserId} onChange={(managerUserId) => setForm({ ...form, managerUserId })} />
      <PeopleField label="Замерщик" people={measurers} value={form.measurerUserId} onChange={(measurerUserId) => setForm({ ...form, measurerUserId })} />
      <PeopleField label="Бригада" people={crews} value={form.crewUserId} onChange={(crewUserId) => setForm({ ...form, crewUserId })} />
      <div className={styles.pair}>
        <label>
          Начало
          <input type="date" value={form.startsAt} onChange={(event) => setForm({ ...form, startsAt: event.target.value })} />
        </label>
        <label>
          Срок
          <input type="date" value={form.dueAt} onChange={(event) => setForm({ ...form, dueAt: event.target.value })} />
        </label>
      </div>
      <label className={styles.check}>
        <input type="checkbox" checked={form.archived} onChange={(event) => setForm({ ...form, archived: event.target.checked })} />
        В архиве
      </label>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      <button type="submit" className={styles.primary} disabled={busy || !form.name.trim()}>
        {busy ? 'Сохраняем…' : 'Сохранить'}
      </button>
    </form>
    {onDelete ? (
      <div className={styles.dangerZone}>
        <p className={styles.lead}>Проект удаляется вместе со всеми его комнатами.</p>
        <button type="button" className={styles.danger} onClick={() => onDelete(project)}>
          Удалить проект
        </button>
      </div>
    ) : null}
    {savedTick
      ? createPortal(
          <p className={styles.toast} role="status">
            Сохранено
          </p>,
          document.body,
        )
      : null}
    </>
  );
}

function peopleByRole(staff: Person[], actor: Person | undefined, match: (person: Person) => boolean) {
  const people = staff.filter(match);
  if (actor && match(actor) && !people.some((person) => person.id === actor.id)) people.unshift(actor);
  return people;
}

function PeopleField({
  label,
  people,
  value,
  onChange,
}: {
  label: string;
  people: Person[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <label>
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Не назначен</option>
        {people.map((person) => (
          <option key={person.id} value={person.id}>
            {person.displayName}
          </option>
        ))}
      </select>
    </label>
  );
}

function draftFrom(project: Project, status: ProjectStatus, rooms: JobObject[], staff: Person[]) {
  return {
    name: project.name,
    description: project.description || '',
    clientName: project.clientName || '',
    clientPhone: project.clientPhone || '',
    address: project.address || '',
    city: project.city || '',
    status: project.status || status,
    managerUserId: projectAssigneeId(project, rooms, staff, 'manager') || '',
    measurerUserId: projectAssigneeId(project, rooms, staff, 'measurer') || '',
    crewUserId: projectAssigneeId(project, rooms, staff, 'crew') || '',
    startsAt: project.startsAt || '',
    dueAt: project.dueAt || '',
    archived: Boolean(project.archivedAt),
  };
}
