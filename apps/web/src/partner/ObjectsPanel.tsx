import { roomCountLabel } from './kanban';
import { trackPartnerAnalytics } from './analytics';
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
import { ensureClientLinkUrl } from './clientLink';
import { isDocStale } from './docStale';
import { formatRub } from './estimate';
import { loadLocalDocBytes } from './localStore';
import { StatusSwap } from './motionBits';
import { CityField } from './CityField';
import { loadCities, resolveCity } from './cityCatalog';
import { usePartner } from './PartnerContext';
import { useProfileAttach } from './profileAttach';
import { formatDocStamp } from './historyFormatting';
import { ObjectHistory } from './ObjectHistory';
import { SavedResultPage } from './SavedResultPage';
import listStyles from './ProjectList.module.css';
import { buildProjectCards, cardMatches, visibleRooms } from './projectGroups';
import { ProjectDesk } from './ProjectDesk';
import { CloseDialog } from './CloseDialog';
import { refusalLine, roomStageLabel } from './closeOutcome';
import { assigneeCandidates, assigneeRoleLabel, deleteProjectWarning, problemomerLine, roomTitle } from './projectDesk';
import { navigateProject, parseProjectHash, PROJECT_TABS, type ProjectRoute } from './projectRoute';
import { groupOrphanRooms } from '../../../../packages/shared/groupProjects.js';
import { RoomPhotoReport } from './photos/RoomPhotoReport';
import { buildKpModel, kpRooms } from './kp/kpModel';
import { renderKpPdf } from './kp/kpPdf';
import { projectManagerContact } from '../../../../packages/shared/clientPhone.js';
import { isDemoModeEnabled } from './demoMode';
import { roleSeesProjectMoney, type Project } from '../../../../packages/shared/partner';
import styles from './partner.module.css';
import { CardSection, FactGrid, NextStep, StageTrack, cardStyles as card, type Fact } from './CardParts';
import { ROOM_STAGES, roomNextStep, stageStates } from './cardView';

const STATUSES: JobObjectStatus[] = ['draft', 'measured', 'quote_sent', 'install', 'closed'];

function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

function formatDocWhen(iso: string): string {
  return formatDocStamp(iso);
}

/** Профиль проблемомера без блока сметы. Если ответов комнаты нет — схема и количества. */
async function plainProfileBlob(
  obj: JobObject,
  doc: JobObjectDocument,
  role: UserRole,
): Promise<Blob> {
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
        const shareUrl = await ensureClientLinkUrl(
          obj.id,
          role,
          session.answers.room as unknown as Record<string, unknown>,
        );
        const { blob } = await renderAcousticProfilePdf(session, {
          compact: true,
          hidePrices: true,
          shareUrl,
        });
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
  onResults,
  onShare,
  onRebuild,
}: {
  obj: JobObject;
  busyId: string | null;
  hidePrices: boolean;
  onOpen: (doc: JobObjectDocument, download: boolean) => void;
  onResults: (doc: JobObjectDocument) => void;
  onShare: (doc: JobObjectDocument) => void;
  onRebuild: (doc: JobObjectDocument) => void;
}) {
  // КП собирается на весь проект и живёт во вкладке «Документы» проекта.
  const docs = visibleDocuments(obj.documents).filter((doc) => doc.kind !== 'offer');
  return (
    <section className={`${card.section} ${styles.docBlock}`} aria-label="Документы" data-doc-block>
      <div className={card.sectionHead}>
        <h2 className={card.sectionTitle}>Документы</h2>
        {docs.length ? <span className={styles.hint}>{docs.length === 1 ? '1 файл' : `${docs.length} ${docs.length < 5 ? 'файла' : 'файлов'}`}</span> : null}
      </div>
      <p className={card.sectionHint}>
        {docs.length
          ? hidePrices
            ? 'Схема, материалы и количества, без цен. Клиенту файл уходит только по кнопке «Клиенту».'
            : 'Сами файлы никому не уходят: клиенту — только по кнопке «Клиенту».'
          : 'Смета и схема монтажа появится после PDF в калькуляторе, акустический профиль — после PDF в Проблемомере. Файл лежит в комнате, пока вы его не отправите.'}
      </p>
      {docs.length ? (
        <ul className={styles.docList}>
          {docs.map((doc, index) => {
            const kind = documentDisplayKind(doc.kind);
            const latest = docs.findIndex((item) => documentDisplayKind(item.kind) === kind) === index;
            const stale = latest && isDocStale(doc, obj);
            return (
              <li
                key={doc.id}
                className={stale ? `${styles.docRow} ${styles.docRowStale}` : styles.docRow}
                data-doc-kind={kind}
                data-stale={stale ? 'true' : undefined}
              >
                <div className={styles.docMeta}>
                  <strong>
                    {documentLabel(doc.kind)}
                    {stale ? <span className={styles.staleBadge}>Устарел</span> : null}
                  </strong>
                  <span className={styles.hint}>
                    {latest ? 'Последняя версия' : 'Предыдущая версия'}
                    {formatDocWhen(doc.createdAt) ? ` · ${formatDocWhen(doc.createdAt)}` : ''}
                    {doc.areaM2 ? ` · ${doc.areaM2} м²` : ''}
                    {stale ? ` · площадь комнаты теперь ${obj.room?.areaM2} м²` : ''}
                    {kind === 'estimate' && doc.panels ? ` · ${doc.panels} пан.` : ''}
                    {kind === 'estimate' ? (doc.hasScheme ? ' · схема раскладки' : ' · без схемы') : ''}
                    {doc.kind === 'spec' ? ' · старый файл без цен' : ''}
                  </span>
                </div>
                <div className={styles.docActions}>
                  {stale ? (
                    <button type="button" className={styles.rebuildBtn} data-doc-action="rebuild" onClick={() => onRebuild(doc)}>
                      Пересобрать
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className={styles.ghost}
                    data-testid="doc-open-results"
                    onClick={() => onResults(doc)}
                  >
                    Открыть результаты
                  </button>
                  <button
                    type="button"
                    className={styles.ghost}
                    disabled={busyId === doc.id}
                    onClick={() => onOpen(doc, false)}
                  >
                    {busyId === doc.id ? 'Открываем…' : 'Открыть PDF'}
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
    </section>
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
  const hideMoney = !roleSeesProjectMoney(user.role);
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
  const [closingRoom, setClosingRoom] = useState<JobObject | null>(null);
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
  const roomPhone = useMemo(() => {
    if (!selected) return '';
    const project = api.projects.find((item) => item.id === selected.projectId);
    return (project?.clientPhone || selected.clientPhone || '').trim();
  }, [selected, api.projects]);
  const profileAttach = useProfileAttach(selected?.id);
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

  function kpManager(project: Project) {
    const people = [
      { id: user.id, role: user.role, orgId: user.orgId, displayName: user.displayName, login: user.login, phone: user.phone || '' },
      ...staff.filter((s) => s.id !== user.id),
    ];
    // Ответственного менеджера нет — в КП контакт того, кто его собирает.
    const contact = projectManagerContact(project.managerUserId ? project : { ...project, managerUserId: user.id }, people);
    return contact ? { name: contact.name, phone: contact.phone } : null;
  }

  function kpInput(projectId: string | null | undefined) {
    const project = api.projects.find((item) => item.id === projectId);
    if (!project) throw new Error('Проект не найден');
    const rooms = api.objects.filter((room) => room.projectId === project.id);
    return { project, rooms };
  }

  async function renderKp(project: Project, rooms: JobObject[], demo: boolean) {
    const model = buildKpModel({ project, rooms, org: user.org, manager: kpManager(project), demo });
    const anchor = kpRooms(rooms)[0]!;
    const clientLink = await ensureClientLinkUrl(
      model.effectRoomId,
      user.role,
      (answersFromStoredRoom(rooms.find((r) => r.id === model.effectRoomId)?.room) || {}) as unknown as Record<string, unknown>,
    );
    const file = await renderKpPdf(model, { clientLink, compact: true });
    return { model, anchor, file };
  }

  async function buildKp(project: Project, rooms: JobObject[]) {
    setErr(null);
    setMsg(null);
    try {
      const { model, anchor, file } = await renderKp(project, rooms, isDemoModeEnabled());
      const bytes = new Uint8Array(await file.blob.arrayBuffer());
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      await api.attachOffer(anchor, {
        pdfBase64: btoa(bin),
        filename: file.filename,
        stamp: model.stamp,
        panels: model.totals.panels,
        areaM2: model.areaM2,
      });
      setMsg('Коммерческое предложение собрано. Клиенту уходит только по кнопке «Поделиться».');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Не удалось собрать КП');
    }
  }

  /** КП ушло клиенту: комнаты до этапа «Отправил КП» переходят на него. */
  async function markKpSent(projectId: string | null | undefined) {
    if (!canMove || !projectId) return;
    const rooms = api.objects.filter((room) => room.projectId === projectId && (room.status === 'draft' || room.status === 'measured'));
    for (const room of rooms) await api.saveObject({ ...room, status: 'quote_sent', id: room.id });
  }

  async function blobForDocument(obj: JobObject, doc: JobObjectDocument): Promise<Blob> {
    if (doc.kind === 'offer') {
      if (documentOpenPolicy(user.role) === 'without-prices') throw new Error('КП доступно ролям, которые видят цены');
      if (doc.demo) {
        const { project, rooms } = kpInput(doc.projectId || obj.projectId);
        return (await renderKp(project, rooms, true)).file.blob;
      }
    }
    if (documentOpenPolicy(user.role) === 'without-prices') {
      if (documentDisplayKind(doc.kind) === 'profile') return plainProfileBlob(obj, doc, user.role);
      return buildDemoPdfBlob(obj, doc, { hidePrices: true });
    }
    if (doc.demo) return buildDemoPdfBlob(obj, doc, { hidePrices: false });
    const local = doc.dataBase64 || loadLocalDocBytes(doc.id);
    const pdfBase64 = local || (await apiFetchObjectDocument(obj.id, doc.id)).pdfBase64;
    const bin = Uint8Array.from(atob(pdfBase64), (c) => c.charCodeAt(0));
    return new Blob([bin], { type: 'application/pdf' });
  }

  /**
   * «Пересобрать»: профиль — Проблемомер заново с первого вопроса, смета — калькулятор, чтобы начертить схему заново.
   * После сохранения в комнате появляется новая версия документа. КП собирается из комнат проекта.
   */
  async function rebuildDocument(obj: JobObject, doc: JobObjectDocument) {
    setErr(null);
    setMsg(null);
    if (doc.kind === 'offer') {
      const { project, rooms } = kpInput(doc.projectId || obj.projectId);
      if (!kpRooms(rooms).length) {
        setErr('Коммерческое предложение не собрать: ни в одной комнате проекта нет расчёта калькулятора.');
        return;
      }
      await buildKp(project, rooms);
      return;
    }
    if (documentDisplayKind(doc.kind) === 'profile') api.requestDiagnosis(obj.id, { fresh: true });
    else api.requestCalculator(obj.id);
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
        // Без Web Share: ссылка клиента (та же, что в QR); без неё — скачиваем файл.
        const url = await ensureClientLinkUrl(
          obj.id,
          user.role,
          (answersFromStoredRoom(obj.room) || {}) as unknown as Record<string, unknown>,
        );
        if (url && navigator.clipboard) {
          await navigator.clipboard.writeText(url);
          setMsg('Ссылка для клиента скопирована.');
        } else {
          openPdfBlob(blob, doc.filename, true);
          setMsg('Ссылка для клиента недоступна — файл скачан, отправьте его сами.');
        }
      }
      // КП ушло клиенту (окно «Поделиться», ссылка или файл) — комнаты переходят на «Отправил КП».
      if (doc.kind === 'offer') await markKpSent(doc.projectId || obj.projectId);
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
    try {
      await loadCities();
      const cityRaw = draft.city.trim() || user.org?.city || '';
      const resolved = resolveCity(cityRaw, null);
      if (!resolved.ok) {
        setErr(resolved.message);
        setSaving(false);
        return;
      }
      const fields = {
        status: 'draft' as const,
        clientName: draft.clientName.trim(),
        clientPhone: '',
        address: draft.address.trim(),
        city: resolved.city,
        roomName: roomLabel,
        room: roomStubFromLabel(roomLabel),
      };
      let saved: JobObject;
      if (!api.remote && (user.role === 'owner' || user.role === 'sales')) {
        const project = await api.createProject({
          name: fields.clientName || fields.address || roomLabel,
          clientName: fields.clientName,
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
      {closingRoom ? (
        <CloseDialog
          subject="room"
          name={roomTitle(closingRoom)}
          onCancel={() => setClosingRoom(null)}
          onConfirm={async (choice) => {
            const room = closingRoom;
            setClosingRoom(null);
            await patch(room, {
              status: 'closed',
              refusal: choice ? { reasonKey: choice.reasonKey, comment: choice.comment, at: '', by: null } : null,
            });
            if (!choice) {
              trackPartnerAnalytics({ tool: 'cabinet', action: 'install_done' });
            }
          }}
        />
      ) : null}
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
      {showDesk && reminder ? (
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
            ? async (id, status, choice) => {
                await api.updateProject(id, {
                  status,
                  ...(status === 'done' ? { refusal: choice ? { reasonKey: choice.reasonKey, comment: choice.comment } : null } : {}),
                });
              }
            : undefined
        }
        onOpenRoom={(room) => {
          const projectId = room.projectId || (route.kind === 'project' ? route.projectId : '');
          if (projectId) navigateProject({ kind: 'room', projectId, roomId: room.id });
        }}
        onAddRoom={canCreate ? addRoom : undefined}
        onArchiveProject={
          canMove
            ? async (project, archived) => {
                setErr(null);
                try {
                  await api.updateProject(project.id, { archived });
                  setMsg(archived ? `«${project.name}» в архиве.` : `«${project.name}» возвращён из архива.`);
                } catch (e) {
                  setErr(e instanceof Error ? e.message : 'Не удалось изменить архив');
                }
              }
            : undefined
        }
        onBuildKp={canMove ? buildKp : undefined}
        onDocAction={async (room, doc, action) => {
          if (action === 'rebuild') {
            await rebuildDocument(room, doc);
            return;
          }
          if (action === 'share') await shareDocument(room, doc);
          else await openDocument(room, doc, action === 'download');
        }}
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
                    <CityField value={draft.city} onChange={(city) => setDraft((value) => ({ ...value, city }))} />
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

      {route.kind === 'room' && route.view && selected && selectedCard ? (
        <section className={styles.roomPage} aria-label="Комната" data-testid="room-result-view">
          <nav className={styles.crumbs} aria-label="Путь">
            <button type="button" onClick={() => navigateProject({ kind: 'desk' }, 'replace')}>
              Проекты
            </button>
            <span aria-hidden="true">/</span>
            <button type="button" onClick={closeRoom}>
              {selectedCard.project?.name || selectedCard.title}
            </button>
            <span aria-hidden="true">/</span>
            <button
              type="button"
              onClick={() => navigateProject({ kind: 'room', projectId: route.projectId, roomId: route.roomId })}
            >
              {roomTitle(selected)}
            </button>
            <span aria-hidden="true">/</span>
            <span>{route.view === 'profile' ? 'Результаты Проблемомера' : 'Результаты калькулятора'}</span>
          </nav>
          {(() => {
            const wanted = route.view;
            const doc =
              visibleDocuments(selected.documents).filter((item) => item.kind !== 'offer').find((item) => {
                const kind = documentDisplayKind(item.kind) === 'profile' ? 'profile' : 'estimate';
                return kind === wanted;
              }) || null;
            return (
              <SavedResultPage
                obj={selected}
                view={wanted}
                doc={doc}
                hidePrices={hideMoney}
                pdfBusy={Boolean(doc && docBusy === doc.id)}
                onOpenPdf={doc ? () => void openDocument(selected, doc, false) : null}
                onBack={() => navigateProject({ kind: 'room', projectId: route.projectId, roomId: route.roomId })}
              />
            );
          })()}
        </section>
      ) : null}

      {route.kind === 'room' && !route.view && selected && selectedCard
        ? (() => {
            const project = selectedCard.project || api.projects.find((item) => item.id === selected.projectId) || null;
            const projectName = project?.name || selectedCard.title || 'Проект';
            const client = (project?.clientName || selected.clientName || '').trim();
            const place = [selected.address || project?.address, selected.city || project?.city].filter(Boolean).join(', ');
            const next = roomNextStep(selected, canMove);
            const assignee = staff.find((person) => person.id === selected.assignedTo);
            const refused = selected.status === 'closed' && Boolean(selected.refusal);
            const stages = ROOM_STAGES.map((key, index) => ({
              key,
              label: JOB_OBJECT_STATUS_LABELS[key],
              state: stageStates(ROOM_STAGES, selected.status)[index]!,
            }));
            const runNext = () => {
              if (next.action === 'area' || next.action === 'diagnosis') api.requestDiagnosis(selected.id);
              else if (next.action === 'calculator') api.requestCalculator(selected.id);
              else if (next.action === 'finish') setClosingRoom(selected);
              else if (next.action === 'offer' && selected.projectId) navigateProject({ kind: 'project', projectId: selected.projectId, tab: 'documents' });
            };
            const facts: Fact[] = [
              { key: 'area', label: 'Площадь', value: selected.room.areaM2 != null ? `${selected.room.areaM2} м²` : 'Не указана' },
              { key: 'panels', label: 'Панели', value: selected.estimate ? `${selected.estimate.panels} шт.` : 'Нет расчёта' },
              ...(selected.estimate ? [{ key: 'dowels', label: 'Дюбели', value: `${selected.estimate.dowels} шт.` }] : []),
              ...(!hideMoney && selected.estimate?.totalCost != null
                ? [{ key: 'total', label: 'Итого комнаты', value: formatRub(selected.estimate.totalCost) }]
                : []),
              { key: 'comfort', label: 'Проблемомер', value: problemomerLine(selected), wide: true },
            ];
            return (
        <section className={styles.roomPage} aria-label="Комната">
          <nav className={styles.crumbs} aria-label="Путь">
            <button type="button" onClick={() => navigateProject({ kind: 'desk' }, 'replace')}>
              Проекты
            </button>
            <span aria-hidden="true">/</span>
            <button type="button" onClick={closeRoom}>
              {projectName}
            </button>
            <span aria-hidden="true">/</span>
            <span>{roomTitle(selected)}</span>
          </nav>

          <header className={card.hero} data-room-hero>
            <div className={card.heroTop}>
              <div>
                <p className={card.heroEyebrow}>Комната · {projectName}</p>
                <h1 className={card.heroTitle}>
                  {roomTitle(selected)}
                  <span className={card.stageBadge} data-tone={refused ? 'refused' : undefined}>
                    <StatusSwap statusKey={`${selected.status}${refused ? ':refusal' : ''}`}>{roomStageLabel(selected)}</StatusSwap>
                  </span>
                </h1>
                <ul className={card.heroMeta}>
                  {client ? <li>{client}</li> : null}
                  <li>{place || 'Адрес не заполнен'}</li>
                  {roomPhone ? (
                    <li>
                      <a href={telHref(roomPhone)} data-room-call>
                        Позвонить {roomPhone}
                      </a>
                    </li>
                  ) : null}
                </ul>
              </div>
              <div className={card.heroActions}>
                <button type="button" className={styles.ghost} onClick={closeRoom}>
                  К проекту
                </button>
              </div>
            </div>
            <NextStep text={next.text}>
              {next.button ? (
                <button type="button" className={styles.primary} data-next-action={next.action || undefined} onClick={runNext}>
                  {next.button}
                </button>
              ) : null}
              <button type="button" className={styles.ghost} onClick={() => api.requestDiagnosis(selected.id)}>
                Проблемомер
              </button>
              <button type="button" className={styles.ghost} onClick={() => api.requestCalculator(selected.id)}>
                Калькулятор
              </button>
            </NextStep>
            {canMove ? (
              <StageTrack
                stages={stages}
                groupLabel="Сменить статус"
                refused={refused}
                disabled={pendingId === selected.id}
                onPick={(s) => {
                  if (s === selected.status) return;
                  if (s === 'closed') setClosingRoom(selected);
                  else {
                    void patch(selected, { status: s });
                    if (s === 'measured') {
                      trackPartnerAnalytics({ tool: 'cabinet', action: 'client_agreed' });
                    } else if (s === 'install') {
                      trackPartnerAnalytics({ tool: 'cabinet', action: 'quote_accepted' });
                    }
                  }
                }}
              />
            ) : (
              <>
                <StageTrack stages={stages} groupLabel="Этапы комнаты" refused={refused} />
                <p className={styles.hint}>Статус меняет менеджер или владелец.</p>
              </>
            )}
            {selected.status === 'closed' ? (
              <p
                className={selected.refusal ? styles.refusalNote : styles.hint}
                data-outcome={selected.refusal ? 'refused' : 'completed'}
              >
                {selected.refusal ? refusalLine(selected) : 'Завершён: монтаж выполнен.'}
              </p>
            ) : null}
          </header>

          {selectedRooms.length > 1 ? (
            <nav className={card.roomSwitch} aria-label="Комнаты проекта">
              {selectedRooms.map((room) => (
                <button
                  key={room.id}
                  type="button"
                  className={card.roomChip}
                  aria-current={selectedId === room.id ? 'page' : undefined}
                  onClick={() => {
                    if (room.projectId) navigateProject({ kind: 'room', projectId: room.projectId, roomId: room.id }, 'replace');
                  }}
                >
                  <strong>{room.roomName || room.clientName || 'Комната'}</strong>
                  <span>
                    {room.room.areaM2 != null ? `${room.room.areaM2} м²` : 'Площадь не указана'} · {roomStageLabel(room)}
                  </span>
                </button>
              ))}
            </nav>
          ) : null}

          <div className={card.columns}>
            <div className={card.column}>
              <CardSection title="Главное о комнате" data={{ 'data-room-facts': '' }}>
                <FactGrid label="Главное о комнате" facts={facts} />
              </CardSection>

              {/* Место для блока даты и времени замера и монтажа (календарь). */}

              {profileAttach === 'pending' ? (
                <p className={styles.hint} role="status" data-testid="room-profile-pending">
                  Прикладываем «Профиль» к комнате…
                </p>
              ) : profileAttach === 'failed' ? (
                <p className={styles.hint} role="status">
                  Не удалось приложить «Профиль». Откройте Проблемомер этой комнаты и сохраните ещё раз.
                </p>
              ) : null}

              <ObjectDocuments
                obj={selected}
                busyId={docBusy}
                hidePrices={hideMoney}
                onOpen={(doc, download) => void openDocument(selected, doc, download)}
                onResults={(doc) =>
                  navigateProject({
                    kind: 'room',
                    projectId: route.kind === 'room' ? route.projectId : selected.projectId || '',
                    roomId: selected.id,
                    view: documentDisplayKind(doc.kind) === 'profile' ? 'profile' : 'estimate',
                  })
                }
                onShare={(doc) => void shareDocument(selected, doc)}
                onRebuild={(doc) => void rebuildDocument(selected, doc)}
              />

              <RoomPhotoReport key={selected.id} objectId={selected.id} />
            </div>

            <div className={card.column}>
              <CardSection title="Команда">
                {canAssign && staff.length ? (
                  <AssigneeField
                    room={selected}
                    staff={staff}
                    disabled={pendingId === selected.id}
                    onChange={(assignedTo) => void patch(selected, { assignedTo })}
                  />
                ) : (
                  <FactGrid
                    label="Команда"
                    facts={[{ key: 'assignee', label: 'Исполнитель', value: assignee?.displayName || (selected.assignedTo ? 'Назначен' : 'Не назначен'), wide: true }]}
                  />
                )}
              </CardSection>

              {selected.clientSummary && !hideMoney ? (
                <details className={card.section}>
                  <summary className={card.sectionTitle}>Сводка для клиента</summary>
                  <pre className={styles.summaryBox}>{selected.clientSummary}</pre>
                </details>
              ) : null}

              {(selected.history || []).length ? (
                <details className={card.section}>
                  <summary className={card.sectionTitle}>История</summary>
                  <ObjectHistory key={selected.id} entries={selected.history || []} people={[user, ...staff]} />
                </details>
              ) : null}

              {(canCreate && (api.projects.length || selected.clientName || selectedCard.project)) || canDelete ? (
                <CardSection title="Управление комнатой">
                  <div className={card.manage}>
                    {canCreate && (api.projects.length || selected.clientName || selectedCard.project) ? (
                      <label className={styles.field}>
                        Проект
                        <span className={styles.hint}>Комнату можно перенести в другой проект своей компании.</span>
                        <select
                          aria-label="Проект"
                          value={
                            selected.projectId && api.projects.some((item) => item.id === selected.projectId)
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
                          {selected.projectId && api.projects.some((item) => item.id === selected.projectId) ? null : (
                            <option value={selected.projectId || '__current'}>
                              {selectedCard.project?.name || selected.clientName || selectedCard.title || 'Этот проект'}
                            </option>
                          )}
                          {api.projects.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name || item.clientName}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    {canDelete ? (
                      <div>
                        <button type="button" className={styles.danger} onClick={() => setToDelete(selected)}>
                          Удалить комнату
                        </button>
                      </div>
                    ) : null}
                  </div>
                </CardSection>
              ) : null}
            </div>
          </div>
        </section>
            );
          })()
        : route.kind === 'room' && !(route.view && selected && selectedCard) ? (
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

/**
 * Исполнитель комнаты. Список зависит от стадии: на «Монтаже» — только монтажники.
 * Если на комнате остался исполнитель прошлой стадии (замерщик), список показывает «Не назначен»
 * и просит выбрать нового, а не выдаёт замерщика за исполнителя монтажа.
 */
export function AssigneeField({
  room,
  staff,
  disabled,
  onChange,
}: {
  room: JobObject;
  staff: ReadonlyArray<{ id: string; displayName: string; role: string }>;
  disabled?: boolean;
  onChange: (id: string | null) => void;
}) {
  const people = assigneeCandidates(staff, room.status);
  const current = staff.find((person) => person.id === room.assignedTo);
  const stale = Boolean(room.assignedTo) && !people.some((person) => person.id === room.assignedTo);
  const value = stale ? '' : room.assignedTo || '';
  const roleWord = assigneeRoleLabel(room.status);
  return (
    <label className={styles.field}>
      Исполнитель
      <span className={styles.hint}>
        {stale
          ? `Сейчас назначен ${current ? `${current.displayName} (${ROLE_LABELS[current.role as UserRole] || current.role})` : 'сотрудник прошлой стадии'}. Выберите ${roleWord}.`
          : room.status === 'install' || room.status === 'closed'
            ? 'На монтаже в списке только монтажники.'
            : 'Замерщик и бригада видят только назначенные им комнаты.'}
      </span>
      <select
        value={value}
        disabled={disabled}
        data-stale={stale ? 'true' : undefined}
        onChange={(e) => onChange(e.target.value || null)}
      >
        <option value="">{stale ? `Выберите ${roleWord}` : 'Не назначен'}</option>
        {people.map((s) => (
          <option key={s.id} value={s.id}>
            {s.displayName} · {ROLE_LABELS[s.role as UserRole] || s.role}
          </option>
        ))}
      </select>
    </label>
  );
}
