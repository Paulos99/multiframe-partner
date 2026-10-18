import { Skeleton } from './Skeleton';
import { roomRank } from './kanban';
import { KanbanBoard } from './KanbanBoard';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  JOB_OBJECT_STATUS_LABELS,
  ROLE_LABELS,
  canAssignObjects,
  canCreateObjects,
  canDeleteObjects,
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
import { formatRub } from './estimate';
import { loadLocalDocBytes } from './localStore';
import { RiseItem, StatusSwap, usePrefersReducedMotion } from './motionBits';
import { usePartner } from './PartnerContext';
import { ObjectHistory } from './ObjectHistory';
import listStyles from './ProjectList.module.css';
import { buildProjectCards, cardMatches, visibleRooms } from './projectGroups';
import { preliminaryRoomTotal } from './projectSummary';
import styles from './partner.module.css';

const STATUSES: JobObjectStatus[] = ['draft', 'measured', 'quote_sent', 'install', 'closed'];

function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

function formatDocWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function ObjectDocuments({
  obj,
  busyId,
  onOpen,
}: {
  obj: JobObject;
  busyId: string | null;
  onOpen: (doc: JobObjectDocument, download: boolean) => void;
}) {
  const docs = visibleDocuments(obj.documents);
  return (
    <div className={styles.docBlock}>
      <div className={styles.field}>
        Документы
        <span className={styles.hint}>
          {docs.length
            ? '«Смета» — из калькулятора: цены, количество и схема раскладки. «Профиль» — из проблемомера: акустика комнаты. Старые версии сохраняются.'
            : '«Смета» появится после расчёта в калькуляторе, «Профиль» — после сохранения проблемомера.'}
        </span>
      </div>
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
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
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
  compact,
  onCreate,
}: {
  compact?: boolean;
  onCreate?: () => void;
}) {
  const api = usePartner();
  const user = api.user!;
  const reduce = usePrefersReducedMotion();
  const canAssign = canAssignObjects(user.role);
  const canDelete = canDeleteObjects(user.role);
  const canCreate = canCreateObjects(user.role);
  const staff = api.partnerListStaff();
  const [createStage, setCreateStage] = useState<JobObjectStatus>('draft');
  const [toDelete, setToDelete] = useState<JobObject | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<JobObjectStatus | 'all'>(
    user.role === 'crew' ? 'install' : 'all',
  );
  // On the board stages are columns, so the status filter applies only to the compact list.
  const roomFilter = compact ? statusFilter : 'all';
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [docBusy, setDocBusy] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<RoomDraft>(() => emptyDraft(user.org?.city || ''));
  const [saving, setSaving] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [adding, setAdding] = useState(false);
  const detailRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!api.openedObjectId) return;
    const room = api.objects.find((obj) => obj.id === api.openedObjectId);
    if (!room) return;
    setStatusFilter('all');
    setQuery('');
    setSelectedKey(room.projectId || `room:${room.id}`);
    setSelectedId(room.id);
  }, [api.openedObjectId, api.objects]);

  const counts = useMemo(() => {
    const map = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<JobObjectStatus, number>;
    for (const obj of api.objects) map[obj.status] += 1;
    return map;
  }, [api.objects]);

  const cards = useMemo(
    () => buildProjectCards(api.projects, api.objects).filter((card) => cardMatches(card, query, roomFilter)),
    [api.projects, api.objects, query, roomFilter],
  );
  const selectedCard = useMemo(
    () => buildProjectCards(api.projects, api.objects).find((card) => card.key === selectedKey) || null,
    [api.projects, api.objects, selectedKey],
  );
  const selectedRooms = useMemo(
    () => (selectedCard ? visibleRooms(selectedCard.rooms, roomFilter) : []),
    [selectedCard, roomFilter],
  );
  const selected = useMemo(
    () => api.objects.find((o) => o.id === selectedId) || null,
    [api.objects, selectedId],
  );
  const summary = useMemo(() => preliminaryRoomTotal(selectedRooms), [selectedRooms]);

  useEffect(() => {
    if (!selectedId || !detailRef.current) return;
    detailRef.current.scrollIntoView({
      behavior: reduce ? 'auto' : 'smooth',
      block: 'nearest',
    });
  }, [selectedId, reduce]);

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
      setSelectedId(saved.id);
      if (saved.projectId) setSelectedKey(saved.projectId);
      setMsg('Сохранено');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setPendingId(null);
    }
  }

  // Optimistic order lives in KanbanBoard; here we persist and compensate on failure.
  async function moveRoom(changes: JobObject[]) {
    setErr(null);
    setMsg(null);
    setPendingId(changes[changes.length - 1].id);
    const originals = new Map(api.objects.map((room) => [room.id, room]));
    const savedIds: string[] = [];
    let pendingSync = false;
    try {
      for (const room of changes) {
        const saved = await api.saveObject({ id: room.id, status: room.status, stageOrder: room.stageOrder });
        savedIds.push(room.id);
        pendingSync ||= !!saved.pendingSync;
      }
      setMsg(pendingSync ? 'Стадия сохранена на устройстве, ожидает синхронизации' : 'Стадия сохранена');
    } catch (error) {
      let incomplete = false;
      for (const id of savedIds.reverse()) {
        const room = originals.get(id);
        if (!room) continue;
        try {
          await api.saveObject({ id, status: room.status, stageOrder: roomRank(room) });
        } catch {
          incomplete = true;
        }
      }
      setErr(
        incomplete
          ? 'Не удалось восстановить весь порядок. Обновите страницу.'
          : error instanceof Error
            ? error.message
            : 'Порядок не сохранён',
      );
      throw error;
    } finally {
      setPendingId(null);
    }
  }

  async function openDocument(obj: JobObject, doc: JobObjectDocument, download: boolean) {
    setDocBusy(doc.id);
    setErr(null);
    try {
      let blob: Blob;
      if (doc.demo) {
        blob = await buildDemoPdfBlob(obj, doc);
      } else {
        const local = doc.dataBase64 || loadLocalDocBytes(doc.id);
        if (local) {
          const bin = Uint8Array.from(atob(local), (c) => c.charCodeAt(0));
          blob = new Blob([bin], { type: 'application/pdf' });
        } else {
          const file = await apiFetchObjectDocument(obj.id, doc.id);
          const bin = Uint8Array.from(atob(file.pdfBase64), (c) => c.charCodeAt(0));
          blob = new Blob([bin], { type: 'application/pdf' });
        }
      }
      openPdfBlob(blob, doc.filename, download);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Не удалось открыть PDF');
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
      if (selectedId === obj.id) setSelectedId(null);
      setMsg('Объект удалён');
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
    const roomLabel = draft.roomName.trim() || 'Комната';
    const fields = {
      status: createStage,
      clientName: draft.clientName.trim(),
      clientPhone: draft.clientPhone.trim(),
      address: draft.address.trim(),
      city: draft.city.trim() || user.org?.city || '',
      roomName: roomLabel,
      room: { roomTypeCustom: roomLabel },
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
      setSelectedKey(saved.projectId || `room:${saved.id}`);
      setSelectedId(saved.id);
      setMsg('Проект и первая комната сохранены');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Не удалось создать проект');
    } finally {
      setSaving(false);
    }
  }

  async function addRoom() {
    if (!selectedCard?.project) return;
    const label = roomName.trim();
    if (!label) return;
    setAdding(true);
    setErr(null);
    const project = selectedCard.project;
    try {
      const saved = await api.saveObject({
        status: 'draft',
        projectId: project.id,
        roomName: label,
        clientName: project.clientName || '',
        clientPhone: project.clientPhone || '',
        address: project.address || '',
        city: project.city || '',
        room: { roomTypeCustom: label },
      });
      setRoomName('');
      setSelectedId(saved.id);
      setMsg('Комната добавлена');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Не удалось добавить комнату');
    } finally {
      setAdding(false);
    }
  }

  const reminder =
    user.role === 'crew'
      ? counts.install
        ? `${counts.install} в монтаже — закройте объект, когда потолок готов`
        : 'Нет объектов в монтаже'
      : counts.quote_sent
        ? `${counts.quote_sent} КП ждут следующего шага`
        : counts.draft
          ? `${counts.draft} ещё в черновике`
          : null;

  const allowedStatuses = (current: JobObjectStatus) =>
    STATUSES.filter((s) => {
      if (user.role === 'crew') return s === 'install' || s === 'closed' || s === current;
      return true;
    });

  const filters: Array<JobObjectStatus | 'all'> =
    user.role === 'crew' ? ['install', 'closed', 'all'] : ['all', ...STATUSES];

  function openCard(key: string, rooms: JobObject[]) {
    setSelectedKey(key);
    setSelectedId(rooms.length === 1 ? rooms[0].id : null);
  }

  return (
    <div className={`${styles.card} ${styles.panelCard}`}>
      <div className={listStyles.toolbar}>
        <div>
          <h2>{user.role === 'crew' ? 'Задания на монтаж' : 'Объекты'}</h2>
          <p className={styles.lead}>
            {user.role === 'crew'
              ? 'Только ваши комнаты. В карточке — «Смета» с ценами и схемой раскладки и «Профиль» комнаты.'
              : 'Проект — это клиент и адрес. Комнаты внутри считаются отдельно, площади не смешиваются.'}
          </p>
        </div>
        {canCreate ? (
          <button
            type="button"
            className={styles.primary}
            onClick={() => {
              setCreateStage('draft');
              setCreating((value) => !value);
            }}
            aria-expanded={creating}
          >
            {creating ? 'Закрыть' : compact ? 'Создать' : '+ Новый объект'}
          </button>
        ) : null}
      </div>
      {reminder ? (
        <p className={styles.reminder} role="status">
          {reminder}
        </p>
      ) : null}
      {!api.online ? (
        <p className={styles.flash} role="status">
          Нет сети — показаны замеры и расчёты, сохранённые на устройстве.
        </p>
      ) : null}
      {!api.online && api.calculations.length ? (
        <div className={styles.calcCache}>
          <h3>Расчёты на устройстве</h3>
          <ul>
            {api.calculations.map((calc) => (
              <li key={calc.id}>
                <strong>{calc.tool === 'calculator' ? 'Калькулятор' : 'Проблемомер'}</strong>
                <span>
                  {calc.label ? `${calc.label} · ` : ''}
                  {calc.areaM2 != null ? `${calc.areaM2} м² · ` : ''}
                  {calc.panels != null ? `${calc.panels} пан. · ` : ''}
                  {new Date(calc.at).toLocaleString('ru-RU')}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {creating && canCreate ? (
        <form className={listStyles.form} onSubmit={(event) => void createProjectWithRoom(event)}>
          <label className={styles.field}>
            Клиент
            <input value={draft.clientName} onChange={(event) => setDraft((value) => ({ ...value, clientName: event.target.value }))} />
          </label>
          <label className={styles.field}>
            Телефон
            <input value={draft.clientPhone} inputMode="tel" onChange={(event) => setDraft((value) => ({ ...value, clientPhone: event.target.value }))} />
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
              placeholder="Кухня"
              onChange={(event) => setDraft((value) => ({ ...value, roomName: event.target.value }))}
            />
          </label>
          <div className={styles.field}>
            <span className={styles.srOnly}>Сохранить</span>
            <button type="submit" className={styles.primary} disabled={saving}>
              {saving ? 'Сохраняем…' : 'Создать проект'}
            </button>
          </div>
        </form>
      ) : null}

      {selectedCard ? (
        <div>
          <button type="button" className={listStyles.back} onClick={() => { setSelectedKey(null); setSelectedId(null); }}>
            ← {compact ? 'К списку' : 'К доске'}
          </button>
          <h3>{selectedCard.title}</h3>
          <p className={styles.lead}>{selectedCard.subtitle}</p>
          {selectedRooms.length ? (
            <p className={styles.hint}>
              Предварительный итог: {summary.calculated ? formatRub(summary.total) : 'расчётов пока нет'}. Рассчитано {summary.calculated} из {summary.rooms}. Это ещё не зафиксированное предложение.
            </p>
          ) : null}
          <div className={listStyles.rooms}>
            {selectedRooms.map((room) => (
              <button
                key={room.id}
                type="button"
                className={`${listStyles.room} ${selectedId === room.id ? listStyles.roomOn : ''}`}
                onClick={() => setSelectedId(room.id)}
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
            {!selectedRooms.length ? <p className={styles.hint}>В проекте пока нет комнат с этим статусом.</p> : null}
          </div>
          {canCreate && selectedCard.project ? (
            <div className={listStyles.add}>
              <label className={styles.field}>
                Новая комната
                <input value={roomName} placeholder="Спальня" onChange={(event) => setRoomName(event.target.value)} />
              </label>
              <button type="button" className={styles.primary} disabled={adding || !roomName.trim()} onClick={() => void addRoom()}>
                {adding ? 'Сохраняем…' : 'Добавить комнату'}
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <>
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
          {compact ? (
            <div className={styles.chipRow} role="toolbar" aria-label="Фильтр по статусу">
              {filters.map((id) => {
                const on = statusFilter === id;
                const label = id === 'all' ? 'Все' : JOB_OBJECT_STATUS_LABELS[id];
                const n = id === 'all' ? api.objects.length : counts[id];
                return (
                  <button
                    key={id}
                    type="button"
                    className={on ? styles.chipOn : styles.chip}
                    aria-pressed={on}
                    onClick={() => setStatusFilter(id)}
                  >
                    {label} · {n}
                  </button>
                );
              })}
            </div>
          ) : null}
          {!compact ? (
            <KanbanBoard
              rooms={cards.flatMap((card) => visibleRooms(card.rooms, 'all'))}
              projects={api.projects}
              role={user.role}
              pendingId={pendingId}
              loading={api.objectsLoading && !api.objects.length}
              staff={staff}
              onCreate={
                canCreate
                  ? (stage) => {
                      setCreateStage(stage);
                      setCreating(true);
                    }
                  : undefined
              }
              onMove={moveRoom}
              onDelete={canDelete ? setToDelete : undefined}
              onOpen={(room) => {
                setSelectedKey(room.projectId || `room:${room.id}`);
                setSelectedId(room.id);
              }}
            />
          ) : api.objectsLoading && !api.objects.length ? (
            <Skeleton kind="cards" count={3} label="Загрузка объектов"/>
          ) : (
            <div className={listStyles.grid}>
              {cards.map((card, index) => (
                <RiseItem key={card.key} index={index}>
                  <button type="button" className={listStyles.card} onClick={() => openCard(card.key, card.rooms)}>
                    <span className={listStyles.meta}>Комнат: {visibleRooms(card.rooms, statusFilter).length}</span>
                    <strong>
                      {card.title}
                      {card.rooms.some((room) => room.pendingSync) ? ' · ↻' : ''}
                    </strong>
                    <span className={listStyles.meta}>{card.subtitle}</span>
                  </button>
                </RiseItem>
              ))}
              {!cards.length ? (
                <div className={styles.emptyState}>
                  <p className={styles.lead}>
                    {api.objects.length || api.projects.length
                      ? 'Ничего не нашлось по этому фильтру.'
                      : compact
                        ? 'Пока нет проектов. Создайте проект с первой комнатой или сохраните замер.'
                        : user.role === 'crew'
                          ? 'Пока нет заданий.'
                          : 'Пока нет проектов.'}
                  </p>
                  {api.objects.length || api.projects.length ? (
                    <button
                      type="button"
                      className={styles.ghost}
                      onClick={() => {
                        setQuery('');
                        setStatusFilter(user.role === 'crew' ? 'install' : 'all');
                      }}
                    >
                      Сбросить фильтр
                    </button>
                  ) : canCreate ? (
                    <button type="button" className={styles.primary} onClick={() => setCreating(true)}>
                      Создать
                    </button>
                  ) : null}
                  {!cards.length && onCreate && canCreate ? (
                    <button type="button" className={styles.ghost} onClick={onCreate}>
                      Открыть проблемомер
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}
        </>
      )}

      {selected && selectedCard ? (
        <div className={styles.objectDetail} ref={detailRef}>
          <h3>
            {selected.roomName || selected.clientName || 'Комната'} · {JOB_OBJECT_STATUS_LABELS[selected.status]}
          </h3>
          <p className={styles.lead}>
            {[selected.address, selected.city].filter(Boolean).join(' · ') || 'Адрес не заполнен'}
          </p>
          {selected.clientPhone ? (
            <a className={styles.callLink} href={telHref(selected.clientPhone)}>
              Позвонить {selected.clientPhone}
            </a>
          ) : (
            <p className={styles.hint}>Телефон не указан</p>
          )}
          {selected.estimate ? (
            <div className={styles.grid2}>
              <div className={styles.field}>
                Панели
                <strong>{selected.estimate.panels} шт.</strong>
              </div>
              <div className={styles.field}>
                Дюбели
                <strong>{selected.estimate.dowels} шт.</strong>
              </div>
              {selected.estimate.totalCost != null ? (
                <div className={styles.field}>
                  Итого комнаты
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
            onOpen={(doc, download) => void openDocument(selected, doc, download)}
          />

          {canCreate ? (
            <div className={styles.navRow}>
              <button type="button" className={styles.ghost} onClick={() => api.requestDiagnosis(selected.id)}>
                Диагностика
              </button>
              <button type="button" className={styles.ghost} onClick={() => api.requestCalculator(selected.id)}>
                Рассчитать
              </button>
            </div>
          ) : null}

          {canCreate && api.projects.length ? (
            <label className={styles.field}>
              Проект
              <span className={styles.hint}>Комнату можно перенести в другой проект своей компании.</span>
              <select
                value={selected.projectId || ''}
                disabled={pendingId === selected.id}
                onChange={(event) => {
                  if (event.target.value) void patch(selected, { projectId: event.target.value });
                }}
              >
                {!selected.projectId ? <option value="">Выберите проект</option> : null}
                {api.projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <div className={styles.field}>
            Статус
            <div className={styles.chipRow} role="group" aria-label="Сменить статус">
              {allowedStatuses(selected.status).map((s) => (
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

          {canAssign && staff.length ? (
            <label className={styles.field}>
              Исполнитель
              <span className={styles.hint}>
                Монтажник видит только комнаты, назначенные лично ему.
              </span>
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

          {selected.clientSummary ? (
            <div className={styles.field}>
              Сводка для клиента
              <pre className={styles.summaryBox}>{selected.clientSummary}</pre>
              <button
                type="button"
                className={styles.ghost}
                onClick={() => {
                  const clip = navigator.clipboard;
                  if (!clip) {
                    setErr('Не удалось скопировать');
                    return;
                  }
                  void clip.writeText(selected.clientSummary).then(
                    () => setMsg('Сводка скопирована'),
                    () => setErr('Не удалось скопировать'),
                  );
                }}
              >
                Скопировать сводку
              </button>
            </div>
          ) : null}

          <ObjectHistory key={selected.id} entries={selected.history || []} people={[user, ...staff]} />

          {canDelete ? (
            <div className={styles.navRow}>
              <button type="button" className={styles.danger} onClick={() => setToDelete(selected)}>
                Удалить комнату
              </button>
            </div>
          ) : null}
        </div>
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
        title={toDelete ? `Удалить объект «${objectLabel(toDelete)}»?` : ''}
        message="Действие нельзя отменить."
        confirmLabel="Удалить"
        busy={deleting}
        onCancel={() => setToDelete(null)}
        onConfirm={() => {
          if (toDelete) void remove(toDelete);
        }}
      />
    </div>
  );
}
