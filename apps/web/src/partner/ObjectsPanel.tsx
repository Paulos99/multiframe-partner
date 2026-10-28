import { roomCountLabel } from './kanban';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  JOB_OBJECT_STATUS_LABELS,
  ROLE_LABELS,
  canAssignObjects,
  canCreateObjects,
  canDeleteObjects,
  canMoveObjects,
  documentDisplayKind,
  documentLabel,
  visibleDocuments,
  type JobObject,
  type JobObjectDocument,
  type JobObjectStatus,
  type UserRole,
} from '../../../../packages/shared/partner';
import { apiFetchObjectDocument } from './apiClient';
import { buildDemoPdfBlob, openPdfBlob } from './demoDocuments';
import { documentOpenPolicy } from './roomDocuments';
import { answersFromStoredRoom, roomStubFromLabel } from './roomLink';
import { createInitialSession, withDerived } from '../state/session';
import { renderAcousticProfilePdf } from '../state/reportPdf';
import { formatRub } from './estimate';
import { loadLocalDocBytes } from './localStore';
import { StatusSwap } from './motionBits';
import { usePartner } from './PartnerContext';
import { formatDocStamp } from './historyFormatting';
import { ObjectHistory } from './ObjectHistory';
import listStyles from './ProjectList.module.css';
import { buildProjectCards, cardMatches, visibleRooms } from './projectGroups';
import { ProjectDesk } from './ProjectDesk';
import { deleteProjectWarning, roomTitle } from './projectDesk';
import { navigateProject, parseProjectHash, PROJECT_TABS, type ProjectRoute } from './projectRoute';
import { groupOrphanRooms } from '../../../../packages/shared/groupProjects.js';
import styles from './partner.module.css';

const STATUSES: JobObjectStatus[] = ['draft', 'measured', 'quote_sent', 'install', 'closed'];

function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

function formatDocWhen(iso: string): string {
  return formatDocStamp(iso);
}

/** Профиль проблемомера без блока сметы. Если ответов комнаты нет — схема и количества. */
async function plainProfileBlob(obj: JobObject, doc: JobObjectDocument): Promise<Blob> {
  const answers = answersFromStoredRoom(obj.room);
  if (answers?.roomType && answers.ceilingAreaM2) {
    try {
      const base = createInitialSession();
      const session = withDerived({
        ...base,
        answers: {
          ...base.answers,
          room: { ...base.answers.room, ...answers, plannedCeiling: 'stretch' },
        },
      });
      if (session.derived) {
        const { blob } = await renderAcousticProfilePdf(session, { compact: true, hidePrices: true });
        return blob;
      }
    } catch {
      /* ниже — схема без цен */
    }
  }
  return buildDemoPdfBlob(obj, doc, { hidePrices: true });
}

function ObjectDocuments({
  obj,
  busyId,
  hidePrices,
  onOpen,
  onShare,
}: {
  obj: JobObject;
  busyId: string | null;
  hidePrices: boolean;
  onOpen: (doc: JobObjectDocument, download: boolean) => void;
  onShare: (doc: JobObjectDocument) => void;
}) {
  const docs = visibleDocuments(obj.documents);
  return (
    <details className={styles.docBlock}>
      <summary>Документы</summary>
      <span className={styles.hint}>
        {docs.length
          ? hidePrices
            ? 'Схема, материалы и количества. Цен в этих файлах нет. Клиенту файл уходит только по кнопке «Клиенту».'
            : '«Смета» — цены, количество и схема. «Профиль» — акустика комнаты. Само никому не отправляется: «Клиенту» — только по нажатию.'
          : '«Смета» появится после PDF в калькуляторе, «Профиль» — после PDF в проблемомере. В комнате файл лежит до нажатия.'}
      </span>
      {docs.length ? (
        <ul className={styles.docList}>
          {docs.map((doc, index) => {
            const kind = documentDisplayKind(doc.kind);
            const latest = docs.findIndex((item) => documentDisplayKind(item.kind) === kind) === index;
            return (
              <li key={doc.id} className={styles.docRow} data-doc-kind={kind}>
                <div className={styles.docMeta}>
                  <strong>{documentLabel(doc.kind)}</strong>
                  <span className={styles.hint}>
                    {latest ? 'Последняя версия' : 'Предыдущая версия'}
                    {formatDocWhen(doc.createdAt) ? ` · ${formatDocWhen(doc.createdAt)}` : ''}
                    {doc.areaM2 ? ` · ${doc.areaM2} м²` : ''}
                    {doc.areaM2 != null && obj.room?.areaM2 != null && Math.abs(doc.areaM2 - obj.room.areaM2) > 0.049
                      ? ' · устарел, пересобрать'
                      : ''}
                    {kind === 'estimate' && doc.panels ? ` · ${doc.panels} пан.` : ''}
                    {kind === 'estimate' ? (doc.hasScheme ? ' · схема раскладки' : ' · без схемы') : ''}
                    {doc.kind === 'spec' ? ' · старый файл без цен' : ''}
                  </span>
                </div>
                <div className={styles.docActions}>
                  <button
                    type="button"
                    className={styles.ghost}
                    disabled={busyId === doc.id}
                    onClick={() => onOpen(doc, false)}
                  >
                    {busyId === doc.id ? 'Открываем…' : 'Открыть'}
                  </button>
                  <button
                    type="button"
                    className={styles.ghost}
                    disabled={busyId === doc.id}
                    onClick={() => onOpen(doc, true)}
                  >
                    Скачать
                  </button>
                  <button
                    type="button"
                    className={styles.ghost}
                    disabled={busyId === doc.id}
                    onClick={() => onShare(doc)}
                  >
                    Клиенту
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </details>
  );
}

function StatusBadge({ status }: { status: JobObjectStatus }) {
  return (
    <StatusSwap statusKey={status} className={styles.badge}>
      {JOB_OBJECT_STATUS_LABELS[status]}
    </StatusSwap>
  );
}

type RoomDraft = { clientName: string; clientPhone: string; address: string; city: string; roomName: string };

const emptyDraft = (city = ''): RoomDraft => ({
  clientName: '',
  clientPhone: '',
  address: '',
  city,
  roomName: '',
});

export function ObjectsPanel({
  onCreate,
  openCreateToken = 0,
}: {
  compact?: boolean;
  onCreate?: () => void;
  openCreateToken?: number;
}) {
  const api = usePartner();
  const user = api.user!;
  const canAssign = canAssignObjects(user.role);
  const canDelete = canDeleteObjects(user.role);
  const canCreate = canCreateObjects(user.role);
  const canMove = canMoveObjects(user.role);
  const hideMoney = user.role === 'crew';
  const staff = api.partnerListStaff();
  const [toDelete, setToDelete] = useState<JobObject | null>(null);
  const [projectToDelete, setProjectToDelete] = useState<{ id: string; name: string; rooms: number } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [route, setRoute] = useState<ProjectRoute>(() =>
    parseProjectHash(typeof window === 'undefined' ? '' : window.location.hash),
  );
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const roomFilter = 'all' as const;
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [docBusy, setDocBusy] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<RoomDraft>(() => emptyDraft(user.org?.city || ''));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const sync = () => setRoute(parseProjectHash(window.location.hash));
    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);
    return () => {
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('popstate', sync);
    };
  }, []);

  useEffect(() => {
    if (route.kind !== 'project') return;
    const tab = window.location.hash.split('/')[2];
    if ((PROJECT_TABS as readonly string[]).includes(tab || '')) return;
    navigateProject(route, 'replace');
  }, [route]);

  useEffect(() => {
    if (!api.openedObjectId) return;
    const room = api.objects.find((obj) => obj.id === api.openedObjectId);
    if (!room?.projectId) return;
    setQuery('');
    navigateProject({ kind: 'room', projectId: room.projectId, roomId: room.id }, 'replace');
    api.openObject(null);
  }, [api.openedObjectId, api.objects, api]);

  const counts = useMemo(() => {
    const map = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<JobObjectStatus, number>;
    for (const obj of api.objects) map[obj.status] += 1;
    return map;
  }, [api.objects]);

  const grouped = useMemo(() => {
    const doc = {
      projects: api.projects.map((project) => ({ ...project })),
      objects: api.objects.map((object) => ({ ...object })),
    };
    groupOrphanRooms(doc);
    return doc;
  }, [api.projects, api.objects]);
  const cards = useMemo(
    () => buildProjectCards(grouped.projects, grouped.objects).filter((card) => cardMatches(card, query, roomFilter)),
    [grouped, query, roomFilter],
  );
  const selectedId = route.kind === 'room' ? route.roomId : null;
  const selectedKey = route.kind === 'desk' ? null : route.projectId;
  const selectedCard = useMemo(
    () => buildProjectCards(grouped.projects, grouped.objects).find((card) => card.key === selectedKey) || null,
    [grouped, selectedKey],
  );
  const selectedRooms = useMemo(
    () => (selectedCard ? visibleRooms(selectedCard.rooms, roomFilter) : []),
    [selectedCard, roomFilter],
  );
  const selected = useMemo(
    () => grouped.objects.find((object) => object.id === selectedId) || null,
    [grouped, selectedId],
  );
  useEffect(() => {
    if (!openCreateToken || !canCreate) return;
    setCreating(true);
  }, [openCreateToken, canCreate]);

  useEffect(() => {
    if (!msg && !err) return;
    const t = window.setTimeout(() => {
      setMsg(null);
      setErr(null);
    }, 3200);
    return () => window.clearTimeout(t);
  }, [msg, err]);

  async function patch(obj: JobObject, next: Partial<JobObject>) {
    setMsg(null);
    setErr(null);
    setPendingId(obj.id);
    try {
      const saved = await api.saveObject({ ...obj, ...next, id: obj.id });
      if (saved.projectId && saved.projectId !== obj.projectId) {
        navigateProject({ kind: 'room', projectId: saved.projectId, roomId: saved.id }, 'replace');
      }
      if (next.assignedTo) await fillProjectAssignee(saved, next.assignedTo);
      setMsg('Сохранено');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setPendingId(null);
    }
  }

  /** Исполнитель комнаты становится исполнителем проекта, если поле проекта пустое. */
  async function fillProjectAssignee(room: JobObject, personId: string) {
    const project = api.projects.find((item) => item.id === room.projectId);
    const person = staff.find((item) => item.id === personId);
    if (!project || !person) return;
    try {
      if (person.role === 'measurer' && !project.measurerUserId) {
        await api.updateProject(project.id, { measurerUserId: person.id });
      } else if (person.role === 'crew' && !project.crewUserId) {
        await api.updateProject(project.id, { crewUserId: person.id });
      }
    } catch {
      /* комната уже сохранена; поле проекта подтянется из назначений комнат */
    }
  }

  async function blobForDocument(obj: JobObject, doc: JobObjectDocument): Promise<Blob> {
    if (documentOpenPolicy(user.role) === 'without-prices') {
      if (documentDisplayKind(doc.kind) === 'profile') return plainProfileBlob(obj, doc);
      return buildDemoPdfBlob(obj, doc, { hidePrices: true });
    }
    if (doc.demo) return buildDemoPdfBlob(obj, doc, { hidePrices: false });
    const local = doc.dataBase64 || loadLocalDocBytes(doc.id);
    const pdfBase64 = local || (await apiFetchObjectDocument(obj.id, doc.id)).pdfBase64;
    const bin = Uint8Array.from(atob(pdfBase64), (c) => c.charCodeAt(0));
    return new Blob([bin], { type: 'application/pdf' });
  }

  async function openDocument(obj: JobObject, doc: JobObjectDocument, download: boolean) {
    setDocBusy(doc.id);
    setErr(null);
    try {
      openPdfBlob(await blobForDocument(obj, doc), doc.filename, download);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Не удалось открыть PDF');
    } finally {
      setDocBusy(null);
    }
  }

  async function shareDocument(obj: JobObject, doc: JobObjectDocument) {
    setDocBusy(doc.id);
    setErr(null);
    try {
      const blob = await blobForDocument(obj, doc);
      const file = new File([blob], doc.filename || 'документ.pdf', { type: 'application/pdf' });
      if (typeof navigator.share === 'function') {
        const withFile = typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
        await navigator.share(
          withFile
            ? { files: [file], title: doc.filename }
            : { title: documentLabel(doc.kind), text: doc.filename },
        );
        setMsg('Окно «Поделиться» открыто. Само по себе ничего не отправлено.');
      } else {
        await navigator.clipboard.writeText(doc.filename);
        setMsg('Имя файла скопировано. Отправка клиенту — только из этого окна.');
      }
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return;
      setErr(e instanceof Error ? e.message : 'Не удалось поделиться');
    } finally {
      setDocBusy(null);
    }
  }

  const objectLabel = (obj: JobObject) =>
    [obj.clientName, obj.roomName].filter(Boolean).join(' · ') || obj.address || 'Комната';

  // Confirmed in ConfirmDialog; the server checks the role again (admin/owner only).
  async function remove(obj: JobObject) {
    setMsg(null);
    setErr(null);
    setDeleting(true);
    try {
      await api.deleteObject(obj.id);
      if (selectedId === obj.id && obj.projectId) {
        navigateProject({ kind: 'project', projectId: obj.projectId, tab: 'work' }, 'replace');
      }
      setMsg('Комната удалена');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Не удалось удалить');
    } finally {
      setDeleting(false);
      setToDelete(null);
    }
  }

  async function createProjectWithRoom(event: FormEvent) {
    event.preventDefault();
    if (!canCreate) return;
    setSaving(true);
    setErr(null);
    const roomLabel = draft.roomName.trim();
    const fields = {
      status: 'draft' as const,
      clientName: draft.clientName.trim(),
      clientPhone: draft.clientPhone.trim(),
      address: draft.address.trim(),
      city: draft.city.trim() || user.org?.city || '',
      roomName: roomLabel,
      room: roomStubFromLabel(roomLabel),
    };
    try {
      let saved: JobObject;
      if (!api.remote && (user.role === 'owner' || user.role === 'sales')) {
        const project = await api.createProject({
          name: fields.clientName || fields.address || roomLabel,
          clientName: fields.clientName,
          clientPhone: fields.clientPhone,
          address: fields.address,
          city: fields.city,
        });
        saved = await api.saveObject({ ...fields, projectId: project.id });
      } else {
        saved = await api.saveObject(fields);
      }
      setCreating(false);
      setDraft(emptyDraft(user.org?.city || ''));
      if (saved.projectId) navigateProject({ kind: 'project', projectId: saved.projectId, tab: 'overview' });
      setMsg('Проект и первая комната сохранены');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Не удалось создать проект');
    } finally {
      setSaving(false);
    }
  }

  async function addRoom(projectId: string, name: string) {
    const label = name.trim();
    const project = api.projects.find((item) => item.id === projectId);
    if (!project || !label) return;
    setErr(null);
    try {
      const saved = await api.saveObject({
        status: 'draft',
        projectId: project.id,
        roomName: label,
        clientName: project.clientName || '',
        clientPhone: project.clientPhone || '',
        address: project.address || '',
        city: project.city || '',
        room: roomStubFromLabel(label),
      });
      navigateProject({ kind: 'room', projectId: project.id, roomId: saved.id });
      setMsg('Комната добавлена');
    } catch (e) {
      throw e instanceof Error ? e : new Error('Не удалось добавить комнату');
    }
  }

  const reminder = canMove
    ? counts.quote_sent
      ? `${counts.quote_sent} КП ждут следующего шага`
      : counts.draft
        ? `${roomCountLabel(counts.draft)} ещё в черновике`
        : counts.install
          ? `${roomCountLabel(counts.install)} в монтаже`
          : null
    : counts.install
      ? `${roomCountLabel(counts.install)} в монтаже`
      : null;

  const emptyHint =
    user.role === 'crew' || user.role === 'measurer'
      ? 'Пока нет назначенных комнат. Назначение приходит от менеджера или владельца.'
      : 'Пока нет проектов. Создайте проект с первой комнатой — она откроется на странице проекта.';

  async function removeProject(id: string) {
    setDeleting(true);
    setErr(null);
    try {
      await api.deleteProject(id);
      navigateProject({ kind: 'desk' }, 'replace');
      setMsg('Проект удалён');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Не удалось удалить проект');
    } finally {
      setDeleting(false);
      setProjectToDelete(null);
    }
  }

  function closeRoom() {
    if (route.kind === 'room') navigateProject({ kind: 'project', projectId: route.projectId, tab: 'work' });
    else navigateProject({ kind: 'desk' }, 'replace');
  }

  const showDesk = route.kind === 'desk';

  return (
    <div className={`${styles.card} ${styles.panelCard}`}>
      {showDesk ? (
      <div className={listStyles.toolbar}>
        <div>
          <h2>Проекты</h2>
          <p className={styles.lead}>Проект — это клиент и адрес. Комната открывается со страницы проекта.</p>
        </div>
        {canCreate ? (
          <button
            type="button"
            className={styles.primary}
            onClick={() => setCreating((value) => !value)}
            aria-expanded={creating}
          >
            {creating ? 'Закрыть' : 'Новый проект'}
          </button>
        ) : null}
      </div>
      ) : null}
      {reminder ? (
        <p className={styles.reminder} role="status">
          {reminder}
        </p>
      ) : null}
      {!api.online ? (
        <p className={styles.flash} role="status">
          Нет сети — показаны комнаты, сохранённые на устройстве.
        </p>
      ) : null}

      {showDesk ? (
      <label className={styles.searchField}>
        <span className={styles.srOnly}>Поиск проекта</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Клиент, адрес или комната"
          inputMode="search"
          enterKeyHint="search"
        />
      </label>
      ) : null}

      {route.kind === 'room' ? null : (
      <ProjectDesk
        projects={grouped.projects}
        rooms={grouped.objects}
        role={user.role}
        staff={staff}
        actor={{ id: user.id, role: user.role, displayName: user.displayName }}
        query={query}
        page={route.kind === 'project' ? { projectId: route.projectId, tab: route.tab } : null}
        onOpenProject={(id) => navigateProject({ kind: 'project', projectId: id, tab: 'overview' })}
        onDesk={() => navigateProject({ kind: 'desk' }, 'replace')}
        onTab={(tab) => {
          if (route.kind !== 'project') return;
          navigateProject({ kind: 'project', projectId: route.projectId, tab }, 'replace');
        }}
        onSave={(id, input) => api.updateProject(id, input)}
        onMoveStatus={
          canMove
            ? async (id, status) => {
                await api.updateProject(id, { status });
              }
            : undefined
        }
        onOpenRoom={(room) => {
          const projectId = room.projectId || (route.kind === 'project' ? route.projectId : '');
          if (projectId) navigateProject({ kind: 'room', projectId, roomId: room.id });
        }}
        onAddRoom={canCreate ? addRoom : undefined}
        onDeleteProject={canDelete ? (project) => setProjectToDelete({ id: project.id, name: project.name, rooms: api.objects.filter((room) => room.projectId === project.id).length }) : undefined}
      />
      )}

      {showDesk && !api.objectsLoading && !cards.length ? (
        <div className={styles.emptyState}>
          <p className={styles.lead}>
            {api.objects.length || api.projects.length ? 'Ничего не нашлось. Сбросьте поиск.' : emptyHint}
          </p>
          {api.objects.length || api.projects.length ? (
            <button type="button" className={styles.ghost} onClick={() => setQuery('')}>
              Сбросить поиск
            </button>
          ) : canCreate ? (
            <button type="button" className={styles.primary} onClick={() => setCreating(true)}>
              Новый проект
            </button>
          ) : onCreate ? (
            <button type="button" className={styles.ghost} onClick={onCreate}>
              Проблемомер
            </button>
          ) : null}
        </div>
      ) : null}

      {creating && canCreate
        ? createPortal(
            <div className={styles.modalBackdrop}>
              <div className={styles.modal} role="dialog" aria-modal="true" aria-label="Новый проект">
                <div className={styles.blockHead}>
                  <h3>Новый проект</h3>
                  <button type="button" className={styles.ghost} onClick={() => setCreating(false)}>
                    Закрыть
                  </button>
                </div>
                <form className={listStyles.form} onSubmit={(event) => void createProjectWithRoom(event)}>
                  <label className={styles.field}>
                    Клиент
                    <input value={draft.clientName} onChange={(event) => setDraft((value) => ({ ...value, clientName: event.target.value }))} />
                  </label>
                  <label className={styles.field}>
                    Адрес
                    <input value={draft.address} onChange={(event) => setDraft((value) => ({ ...value, address: event.target.value }))} />
                  </label>
                  <label className={styles.field}>
                    Город
                    <input value={draft.city} onChange={(event) => setDraft((value) => ({ ...value, city: event.target.value }))} />
                  </label>
                  <label className={styles.field}>
                    Первая комната
                    <input
                      value={draft.roomName}
                      placeholder="Название"
                      onChange={(event) => setDraft((value) => ({ ...value, roomName: event.target.value }))}
                    />
                  </label>
                  <div className={styles.field}>
                    <button type="submit" className={styles.primary} disabled={saving}>
                      {saving ? 'Сохраняем…' : 'Создать проект'}
                    </button>
                  </div>
                </form>
              </div>
            </div>,
            document.body,
          )
        : null}

      {route.kind === 'room' && selected && selectedCard
        ? (
        <section className={styles.roomPage} aria-label="Комната">
          <nav className={styles.crumbs} aria-label="Путь">
            <button type="button" onClick={() => navigateProject({ kind: 'desk' }, 'replace')}>
              Проекты
            </button>
            <span aria-hidden="true">/</span>
            <button type="button" onClick={closeRoom}>
              {selectedCard.project?.name || selectedCard.title}
            </button>
            <span aria-hidden="true">/</span>
            <span>{roomTitle(selected)}</span>
          </nav>
            <div className={styles.blockHead}>
              <div>
                <p className={styles.eyebrow}>Комната</p>
                <h1>{roomTitle(selected)}</h1>
                <p className={styles.lead}>
                  {[
                    [selected.address, selected.city].filter(Boolean).join(', ') || 'Адрес не заполнен',
                    JOB_OBJECT_STATUS_LABELS[selected.status],
                  ].join(' · ')}
                </p>
              </div>
              <button type="button" className={styles.ghost} onClick={closeRoom}>
                К проекту
              </button>
            </div>
            {selectedRooms.length > 1 ? (
            <div className={listStyles.rooms}>
              {selectedRooms.map((room) => (
                <button
                  key={room.id}
                  type="button"
                  className={`${listStyles.room} ${selectedId === room.id ? listStyles.roomOn : ''}`}
                  onClick={() => {
                    if (room.projectId) navigateProject({ kind: 'room', projectId: room.projectId, roomId: room.id }, 'replace');
                  }}
                >
                  <span>
                    <strong>{room.roomName || room.clientName || 'Комната'}</strong>
                    <span className={listStyles.meta}>
                      {room.room.areaM2 != null ? `${room.room.areaM2} м²` : 'Площадь не указана'} · {JOB_OBJECT_STATUS_LABELS[room.status]}
                    </span>
                  </span>
                  <StatusBadge status={room.status} />
                </button>
              ))}
            </div>
            ) : null}

            {selectedRooms.length > 1 ? (
              <>
                <h3>
                  {selected.roomName || selected.clientName || 'Комната'} · {JOB_OBJECT_STATUS_LABELS[selected.status]}
                </h3>
                <p className={styles.lead}>
                  {[selected.address, selected.city].filter(Boolean).join(' · ') || 'Добавить адрес'}
                </p>
              </>
            ) : (
              <p className={styles.hint}>{JOB_OBJECT_STATUS_LABELS[selected.status]}</p>
            )}
            {selected.room.areaM2 == null ? (
              <div className={styles.areaCallout}>
                <p>
                  Площадь комнаты не указана. Задайте её в Проблемомере — значение сохранится в эту комнату и попадёт в калькулятор.
                </p>
                <button type="button" className={styles.primary} onClick={() => api.requestDiagnosis(selected.id)}>
                  Указать площадь в Проблемомере
                </button>
              </div>
            ) : null}
            {selected.clientPhone ? (
              <a className={styles.callLink} href={telHref(selected.clientPhone)}>
                Позвонить {selected.clientPhone}
              </a>
            ) : null}
            {selected.estimate ? (
              <div className={styles.grid2}>
                <div className={styles.field}>
                  <span>Панели</span>
                  <strong>{selected.estimate.panels} шт.</strong>
                </div>
                <div className={styles.field}>
                  <span>Дюбели</span>
                  <strong>{selected.estimate.dowels} шт.</strong>
                </div>
                {!hideMoney && selected.estimate.totalCost != null ? (
                  <div className={styles.field}>
                    <span>Итого комнаты</span>
                    <strong>{formatRub(selected.estimate.totalCost)}</strong>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className={styles.hint}>Смета ещё не посчитана</p>
            )}

            <ObjectDocuments
              obj={selected}
              busyId={docBusy}
              hidePrices={hideMoney}
              onOpen={(doc, download) => void openDocument(selected, doc, download)}
              onShare={(doc) => void shareDocument(selected, doc)}
            />

            <div className={styles.navRow}>
              <button type="button" className={styles.ghost} onClick={() => api.requestDiagnosis(selected.id)}>
                Проблемомер
              </button>
              <button type="button" className={styles.ghost} onClick={() => api.requestCalculator(selected.id)}>
                Калькулятор
              </button>
            </div>

            {canCreate && (api.projects.length || selected.clientName || selectedCard.project) ? (
              <label className={styles.field}>
                Проект
                <span className={styles.hint}>Комнату можно перенести в другой проект своей компании.</span>
                <select
                  aria-label="Проект"
                  value={
                    selected.projectId && api.projects.some((project) => project.id === selected.projectId)
                      ? selected.projectId
                      : selected.projectId || '__current'
                  }
                  disabled={pendingId === selected.id}
                  onChange={(event) => {
                    if (event.target.value && event.target.value !== '__current') {
                      void patch(selected, { projectId: event.target.value });
                    }
                  }}
                >
                  {selected.projectId && api.projects.some((project) => project.id === selected.projectId) ? null : (
                    <option value={selected.projectId || '__current'}>
                      {selectedCard.project?.name || selected.clientName || selectedCard.title || 'Этот проект'}
                    </option>
                  )}
                  {api.projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name || project.clientName}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {canMove ? (
              <div className={styles.field}>
                Статус
                <div className={styles.chipRow} role="group" aria-label="Сменить статус">
                  {STATUSES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={selected.status === s ? styles.chipOn : styles.chip}
                      aria-pressed={selected.status === s}
                      disabled={pendingId === selected.id}
                      onClick={() => {
                        if (s !== selected.status) void patch(selected, { status: s });
                      }}
                    >
                      {JOB_OBJECT_STATUS_LABELS[s]}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <p className={styles.hint}>Статус меняет менеджер или владелец.</p>
            )}

            {canAssign && staff.length ? (
              <label className={styles.field}>
                Исполнитель
                <span className={styles.hint}>Замерщик и бригада видят только назначенные им комнаты.</span>
                <select
                  value={selected.assignedTo || ''}
                  disabled={pendingId === selected.id}
                  onChange={(e) => void patch(selected, { assignedTo: e.target.value || null })}
                >
                  <option value="">Не назначен</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.displayName} · {ROLE_LABELS[s.role as UserRole] || s.role}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {selected.clientSummary && !hideMoney ? (
              <div className={styles.field}>
                Сводка для клиента
                <pre className={styles.summaryBox}>{selected.clientSummary}</pre>
              </div>
            ) : null}

            {(selected.history || []).length ? (
              <details className={styles.docBlock}>
                <summary>История</summary>
                <ObjectHistory key={selected.id} entries={selected.history || []} people={[user, ...staff]} />
              </details>
            ) : null}

            {canDelete ? (
              <div className={styles.navRow}>
                <button type="button" className={styles.danger} onClick={() => setToDelete(selected)}>
                  Удалить комнату
                </button>
              </div>
            ) : null}
        </section>
      )
        : route.kind === 'room' ? (
          <section className={styles.roomPage} aria-label="Комната">
            <p className={styles.lead}>{api.objectsLoading ? 'Открываем комнату…' : 'Комната не найдена.'}</p>
            <button type="button" className={styles.ghost} onClick={() => navigateProject({ kind: 'desk' }, 'replace')}>
              К проектам
            </button>
          </section>
        ) : null}

      {msg ? (
        <p className={styles.toast} role="status">
          {msg}
        </p>
      ) : null}
      {err ? (
        <p className={`${styles.toast} ${styles.toastErr}`} role="alert">
          {err}
        </p>
      ) : null}
      <ConfirmDialog
        open={!!toDelete}
        title={toDelete ? `Удалить комнату «${objectLabel(toDelete)}»?` : ''}
        message="Действие нельзя отменить."
        confirmLabel="Удалить"
        busy={deleting}
        onCancel={() => setToDelete(null)}
        onConfirm={() => {
          if (toDelete) void remove(toDelete);
        }}
      />
      <ConfirmDialog
        open={!!projectToDelete}
        title={projectToDelete ? `Удалить проект «${projectToDelete.name}»?` : ''}
        message={projectToDelete ? deleteProjectWarning(projectToDelete.rooms) : undefined}
        confirmLabel="Удалить проект"
        busy={deleting}
        onCancel={() => setProjectToDelete(null)}
        onConfirm={() => {
          if (projectToDelete) void removeProject(projectToDelete.id);
        }}
      />
    </div>
  );
}
