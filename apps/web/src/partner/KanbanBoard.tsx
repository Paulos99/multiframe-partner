import { createElement, useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
  pointerWithin,
  closestCorners,
  type DragOverEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  JOB_OBJECT_STATUS_LABELS,
  canMoveObjects,
  documentKindsSummary,
  type JobObject,
  type Project,
  type UserRole,
  type JobObjectStatus,
} from '../../../../packages/shared/partner';
import {
  m,
  AnimatePresence,
  motionPresets,
  usePrefersReducedMotion,
} from './motionBits';
import {
  canMoveRoom,
  roomCountLabel,
  KANBAN_STAGES,
  sortRooms,
  rankMovedColumn,
  type BoardSort,
} from './kanban';
import { CheckCircleIcon, DraftIcon, DrillIcon, MoreIcon, SendIcon, TapeMeasureIcon } from '../icons';
import styles from './KanbanBoard.module.css';

function Column({
  stage,
  children,
}: {
  stage: JobObjectStatus;
  children: ReactNode;
}) {
  const { setNodeRef } = useDroppable({ id: stage });
  return (
    <section
      ref={setNodeRef}
      className={styles.column}
      data-kanban-stage={stage}
      aria-label={JOB_OBJECT_STATUS_LABELS[stage]}
    >
      {children}
    </section>
  );
}
function Card({
  room,
  disabled,
  frozen,
  children,
  onOpen,
  onHover,
  related,
  onStep,
  onMenu,
}: {
  room: JobObject;
  /** Blocks both drag and open (save in flight). */
  disabled: boolean;
  /** Blocks drag only. The card still opens. */
  frozen: boolean;
  children: ReactNode;
  onOpen: () => void;
  onHover: (id: string | null) => void;
  related: boolean;
  onStep: (direction: number) => void;
  /** Opens the card actions menu at viewport coordinates; omitted when the role has no actions. */
  onMenu?: (x: number, y: number) => void;
}) {
  const reduce = usePrefersReducedMotion();
  const {
    setNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: room.id,
    disabled: disabled || frozen,
    transition: reduce ? null : undefined,
  });
  return (
    <div
      ref={setNodeRef}
      className={styles.cardWrap}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <button
        {...attributes}
        {...listeners}
        type="button"
        data-room-id={room.id}
        aria-roledescription="карточка"
        aria-disabled={disabled || undefined}
        className={`${styles.card} ${related ? styles.related : ''} ${isDragging ? styles.source : ''}`}
        aria-label={`${room.roomName || 'Комната'} · ${room.clientName || 'Клиент'} · ${JOB_OBJECT_STATUS_LABELS[room.status]}`}
        onPointerDown={(e) => {
          if (e.pointerType !== 'touch') listeners?.onPointerDown?.(e);
        }}
        onKeyDown={(e) => {
          if (e.altKey && ['ArrowLeft', 'ArrowRight'].includes(e.key)) {
            e.preventDefault();
            onStep(e.key === 'ArrowRight' ? 1 : -1);
          } else listeners?.onKeyDown?.(e);
        }}
        onMouseEnter={() => onHover(room.projectId || null)}
        onMouseLeave={() => onHover(null)}
        onFocus={() => onHover(room.projectId || null)}
        onBlur={() => onHover(null)}
        onClick={() => {
          if (!isDragging) onOpen();
        }}
        onContextMenu={
          onMenu
            ? (e) => {
                e.preventDefault();
                onMenu(e.clientX, e.clientY);
              }
            : undefined
        }
      >
        {children}
      </button>
      {onMenu && !isDragging ? (
        <button
          type="button"
          className={styles.cardMenu}
          aria-label={`Действия с комнатой «${room.roomName || room.clientName || 'Комната'}»`}
          aria-haspopup="menu"
          // Keep the dnd-kit sensors (pointer, long-press touch, keyboard) off this button.
          onPointerDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            const r = e.currentTarget.getBoundingClientRect();
            onMenu(r.right, r.bottom + 4);
          }}
        >
          <MoreIcon size={18} />
        </button>
      ) : null}
    </div>
  );
}
const STAGE_ICONS: Record<JobObjectStatus, ComponentType<{ size?: number }>> = {
  draft: DraftIcon,
  measured: TapeMeasureIcon,
  quote_sent: SendIcon,
  install: DrillIcon,
  closed: CheckCircleIcon,
};
export function KanbanBoard({
  rooms,
  projects,
  role,
  pendingId,
  onOpen,
  onMove,
  onCreate,
  loading,
  staff,
  onDelete,
}: {
  rooms: JobObject[];
  projects: Project[];
  role: UserRole;
  pendingId: string | null;
  onOpen: (room: JobObject) => void;
  onMove: (changes: JobObject[]) => Promise<void>;
  onCreate?: (status: JobObjectStatus) => void;
  loading?: boolean;
  staff: { id: string; displayName: string }[];
  /** Present only for roles that may delete objects (admin, owner). */
  onDelete?: (room: JobObject) => void;
}) {
  const reduce = usePrefersReducedMotion();
  const board = useRef<HTMLDivElement>(null);
  const [sort, setSort] = useState<BoardSort>('manual');
  const [local, setLocal] = useState<JobObject[] | null>(null);
  const [active, setActive] = useState<JobObject | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [tab, setTab] = useState<JobObjectStatus>('draft');
  const [assigned, setAssigned] = useState('all');
  const [filters, setFilters] = useState(false);
  const [menu, setMenu] = useState<{ room: JobObject; x: number; y: number } | null>(null);
  // Where the pointer grabbed the card, relative to its top-left; the overlay rotates/scales around it.
  const [grab, setGrab] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const busy = useRef(false);
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', close);
    // Focus and layout can scroll in the same turn the menu opens. Ignore that
    // tick so the menu is not dismissed before the click finishes.
    const arm = window.setTimeout(() => window.addEventListener('scroll', close, true), 200);
    return () => {
      window.clearTimeout(arm);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [menu]);
  const snapshot = useRef<JobObject[]>([]);
  const draft = useRef<JobObject[]>([]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const visible =
    local ??
    sortRooms(
      rooms.filter(
        (r) =>
          assigned === 'all' ||
          (assigned === 'none' ? !r.assignedTo : r.assignedTo === assigned),
      ),
      sort,
      [],
      projects,
    );
  const namedRooms = local ?? rooms;
  function dragCardName(id: unknown) {
    const room = namedRooms.find((item) => item.id === id);
    if (!room) return 'комнаты';
    return `«${room.clientName || 'Клиент'}, ${room.roomName || 'Комната'}»`;
  }
  function dragColumnName(id: unknown) {
    if (typeof id === 'string' && KANBAN_STAGES.includes(id as JobObjectStatus)) {
      return `«${JOB_OBJECT_STATUS_LABELS[id as JobObjectStatus]}»`;
    }
    const room = namedRooms.find((item) => item.id === id);
    return room ? `«${JOB_OBJECT_STATUS_LABELS[room.status]}»` : 'доски';
  }
  function preview(next: JobObject[]) {
    draft.current = next;
    setLocal(next);
  }
  async function commit(room: JobObject, next: JobObject[]) {
    const previousSort = sort;
    const list = next.filter((r) => r.status === room.status);
    const ranked = rankMovedColumn(list, room.id);
    const changes = ranked.filter(
      (r) =>
        r.id === room.id ||
        r.stageOrder !== list.find((old) => old.id === r.id)?.stageOrder,
    );
    // Save the dragged card last; companion rank changes are compensated on failure.
    changes.sort((a, b) => Number(a.id === room.id) - Number(b.id === room.id));
    preview(
      next.map((r) => ranked.find((updated) => updated.id === r.id) ?? r),
    );
    busy.current = true;
    setSort('manual');
    try {
      await onMove(changes);
    } catch {
      setSort(previousSort);
      setLocal(snapshot.current);
    } finally {
      busy.current = false;
      setLocal(null);
    }
  }
  function over({ active: drag, over }: DragOverEvent) {
    if (!over) return;
    const current = draft.current;
    const room = current.find((r) => r.id === drag.id);
    const stage = KANBAN_STAGES.includes(over.id as JobObjectStatus)
      ? (over.id as JobObjectStatus)
      : current.find((r) => r.id === over.id)?.status;
    if (!room || !stage || room.status === stage || !canMoveRoom(role, stage))
      return;
    const next = current.filter((r) => r.id !== room.id);
    const index = next.findIndex((r) => r.id === over.id);
    next.splice(index < 0 ? 0 : index, 0, { ...room, status: stage });
    preview(next);
  }
  function end({ active: drag, over }: DragEndEvent) {
    setActive(null);
    if (!over) {
      setLocal(null);
      return;
    }
    let next = draft.current;
    const room = next.find((r) => r.id === drag.id);
    const target = next.find((r) => r.id === over.id);
    const destination = target?.status ?? (over.id as JobObjectStatus);
    if (!canMoveRoom(role, destination)) {
      setLocal(null);
      return;
    }
    if (KANBAN_STAGES.includes(over.id as JobObjectStatus) && room) {
      next = [room, ...next.filter((r) => r.id !== room.id)];
    }
    if (!room || !canMoveRoom(role, room.status)) {
      setLocal(null);
      return;
    }
    if (target && target.status === room.status && target.id !== room.id)
      next = arrayMove(next, next.indexOf(room), next.indexOf(target));
    const column = (list: JobObject[]) =>
      list
        .filter((r) => r.status === room.status)
        .map((r) => r.id)
        .join('|');
    const original = snapshot.current.find((r) => r.id === room.id);
    if (
      original?.status === room.status &&
      column(next) === column(snapshot.current)
    ) {
      // Dropped back in place: nothing to save.
      setLocal(null);
      return;
    }
    void commit(room, next);
  }
  function content(room: JobObject) {
    const project = projects.find((p) => p.id === room.projectId);
    return (
      <>
        <strong>
          {project?.clientName || room.clientName || 'Клиент'} ·{' '}
          {room.roomName || 'Комната'}
        </strong>
        <small>
          {(project?.address || room.address || '').trim() || 'Добавить адрес'}
        </small>
        <div className={styles.metadata}>
          <span title="Обновлено">
            {new Date(room.updatedAt).toLocaleDateString('ru-RU', {
              day: '2-digit',
              month: 'short',
            })}
          </span>
          <span title="Документы">{documentKindsSummary(room.documents) || 'Без PDF'}</span>
          <span>{room.room.areaM2 ?? '—'} м²</span>
        </div>
        {room.pendingSync && <small>↻ Ожидает синхронизации</small>}
      </>
    );
  }
  return (
    <>
      <div className={styles.toolbar}>
        <strong>{roomCountLabel(visible.length)}</strong>
        <button
          type="button"
          aria-expanded={filters}
          onClick={() => setFilters(!filters)}
        >
          Фильтры{assigned !== 'all' ? ' · 1' : ''}
        </button>
        <label>
          Сортировка{' '}
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as BoardSort)}
          >
            <option value="updatedAt">По обновлению</option>
            <option value="createdAt">По созданию</option>
            <option value="client">По клиенту</option>
            <option value="manual">Вручную</option>
          </select>
        </label>
        {filters && (
          <label>
            Ответственный{' '}
            <select
              value={assigned}
              onChange={(e) => setAssigned(e.target.value)}
            >
              <option value="all">Все</option>
              <option value="none">Не назначен</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.displayName}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {/* Visible hint removed at Pavel's request; the instructions stay for screen readers. */}
      <p className={styles.srOnly} id="kanban-help">
        {canMoveRoom(role, 'draft')
          ? 'Перетащите карточку в стадию или измените порядок. Alt + ←/→ — стадия, Пробел — поднять, стрелки — переместить, Escape — отменить. На телефоне удерживайте карточку.'
          : 'Откройте карточку, чтобы посмотреть комнату. Статус меняет менеджер или владелец.'}
      </p>
      <div className={styles.tabs} aria-label="Стадии">
        {KANBAN_STAGES.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={tab === s}
            onClick={() => {
              setTab(s);
              board.current
                ?.querySelector(`[data-kanban-stage="${s}"]`)
                ?.scrollIntoView({
                  behavior: reduce ? 'instant' : 'smooth',
                  block: 'nearest',
                  inline: 'start',
                });
            }}
          >
            {JOB_OBJECT_STATUS_LABELS[s]}
          </button>
        ))}
      </div>
      <DndContext
        accessibility={{
          screenReaderInstructions: {
            draggable:
              'Чтобы взять карточку, нажмите пробел. Стрелками переносите её между колонками. Пробел — отпустить в колонке, Escape — отменить.',
          },
          announcements: {
            onDragStart({ active }) {
              return `Взята карточка ${dragCardName(active.id)}.`;
            },
            onDragOver({ active, over }) {
              return over
                ? `Карточка ${dragCardName(active.id)} над колонкой ${dragColumnName(over.id)}.`
                : `Карточка ${dragCardName(active.id)} вне колонок.`;
            },
            onDragEnd({ active, over }) {
              return over
                ? `Карточка ${dragCardName(active.id)} отпущена в колонке ${dragColumnName(over.id)}.`
                : `Карточка ${dragCardName(active.id)} отпущена.`;
            },
            onDragCancel({ active }) {
              return `Перенос карточки ${dragCardName(active.id)} отменён.`;
            },
          },
        }}
        sensors={sensors}
        collisionDetection={(args) => {
          const hits = pointerWithin(args);
          return hits.length
            ? hits.some((h) => !KANBAN_STAGES.includes(h.id as JobObjectStatus))
              ? hits.filter(
                  (h) => !KANBAN_STAGES.includes(h.id as JobObjectStatus),
                )
              : hits
            : args.pointerCoordinates
              ? []
              : closestCorners(args);
        }}
        onDragStart={({ active: drag, activatorEvent }) => {
          if (busy.current) return;
          setMenu(null);
          const room = visible.find((r) => r.id === drag.id);
          // dnd-kit has not measured the active rect yet at drag start, so read the card node itself.
          const node = (activatorEvent?.target as Element | null)?.closest(
            `.${styles.cardWrap}`,
          );
          const rect = node?.getBoundingClientRect() ?? drag.rect.current.initial;
          const point =
            activatorEvent && 'touches' in activatorEvent
              ? (activatorEvent as TouchEvent).touches[0]
              : (activatorEvent as PointerEvent | null);
          setGrab(
            rect && point && 'clientX' in point
              ? {
                  x: point.clientX - rect.left,
                  y: point.clientY - rect.top,
                  width: rect.width,
                  height: rect.height,
                }
              : rect
                ? { x: rect.width / 2, y: rect.height / 2, width: rect.width, height: rect.height }
                : null,
          );
          if (room) {
            snapshot.current = visible;
            preview(visible);
            setActive(room);
          }
        }}
        onDragOver={over}
        onDragEnd={end}
        onDragCancel={() => {
          setActive(null);
          setLocal(null);
        }}
      >
        <div
          ref={board}
          className={styles.board}
          aria-label="Доска проектов"
          aria-busy={loading}
          onScroll={() => {
            const el = board.current;
            if (el) {
              const cols = [...el.children] as HTMLElement[];
              const nearest = cols.reduce((a, b) =>
                Math.abs(b.offsetLeft - el.offsetLeft - el.scrollLeft) <
                Math.abs(a.offsetLeft - el.offsetLeft - el.scrollLeft)
                  ? b
                  : a,
              );
              setTab(nearest.dataset.kanbanStage as JobObjectStatus);
            }
          }}
        >
          {KANBAN_STAGES.map((stage) => {
            const list = visible.filter((r) => r.status === stage);
            const displayList: (JobObject | null)[] = [...list];
            if (
              active?.status === stage &&
              !list.some((r) => r.id === active.id)
            ) {
              const sourceIndex = snapshot.current
                .filter((r) => r.status === stage)
                .findIndex((r) => r.id === active.id);
              displayList.splice(Math.max(0, sourceIndex), 0, null);
            }
            return (
              <Column key={stage} stage={stage}>
                <header>
                  <span className={styles.icon} aria-hidden="true">
                    {createElement(STAGE_ICONS[stage], { size: 18 })}
                  </span>
                  <h3>{JOB_OBJECT_STATUS_LABELS[stage]}</h3>
                  <span className={styles.count}>{list.length}</span>
                  {canMoveObjects(role) ? (
                  <details>
                    <summary
                      aria-label={`Действия: ${JOB_OBJECT_STATUS_LABELS[stage]}`}
                    >
                      <MoreIcon size={18} />
                    </summary>
                    <button type="button" onClick={() => setSort('updatedAt')}>
                      По обновлению
                    </button>
                    <button type="button" onClick={() => setSort('client')}>
                      По клиенту
                    </button>
                  </details>
                  ) : null}
                  {onCreate && (
                    <button
                      type="button"
                      aria-label={`Новая комната: ${JOB_OBJECT_STATUS_LABELS[stage]}`}
                      onClick={() => onCreate(stage)}
                    >
                      +
                    </button>
                  )}
                </header>
                <div className={styles.cards} data-column-scroll>
                  <SortableContext
                    items={list.map((r) => r.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {loading ? (
                      [0, 1, 2].map((n) => (
                        <div key={n} className={styles.skeleton}>
                          <i />
                          <i />
                          <i />
                        </div>
                      ))
                    ) : (
                      <AnimatePresence initial={false}>
                        {displayList.map((room) =>
                          room ? (
                            <m.div
                              key={room.id}
                              layout={!reduce && !active}
                              initial={
                                reduce || active
                                  ? false
                                  : { opacity: 0, scale: 0.97 }
                              }
                              animate={{ opacity: 1, scale: 1 }}
                              exit={
                                reduce || active
                                  ? undefined
                                  : { opacity: 0, scale: 0.97 }
                              }
                              transition={
                                reduce ? { duration: 0 } : motionPresets.layout
                              }
                            >
                              <Card
                                room={room}
                                disabled={!!pendingId || busy.current}
                                frozen={!canMoveRoom(role, room.status)}
                                related={!!hover && hover === room.projectId}
                                onMenu={
                                  onDelete
                                    ? (x, y) => setMenu({ room, x, y })
                                    : undefined
                                }
                                onHover={setHover}
                                onOpen={() => onOpen(room)}
                                onStep={(direction) => {
                                  const stage =
                                    KANBAN_STAGES[
                                      KANBAN_STAGES.indexOf(room.status) +
                                        direction
                                    ];
                                  if (
                                    !stage ||
                                    busy.current ||
                                    pendingId ||
                                    !canMoveRoom(role, stage)
                                  )
                                    return;
                                  snapshot.current = visible;
                                  void commit({ ...room, status: stage }, [
                                    { ...room, status: stage },
                                    ...visible.filter((r) => r.id !== room.id),
                                  ]);
                                }}
                              >
                                {content(room)}
                              </Card>
                            </m.div>
                          ) : (
                            <div
                              key="source-ghost"
                              className={styles.ghost}
                              aria-hidden="true"
                            />
                          ),
                        )}
                      </AnimatePresence>
                    )}
                  </SortableContext>
                  {!loading && !displayList.length && (
                    <p className={styles.empty}>Пока нет комнат</p>
                  )}
                </div>
              </Column>
            );
          })}
        </div>
        {/* Portaled to body: an ancestor with transform/backdrop-filter would otherwise become the
            containing block of the fixed overlay and shift it away from the pointer. */}
        {createPortal(
          <DragOverlay
            dropAnimation={reduce ? null : { duration: 160, easing: 'ease-out' }}
          >
            {active ? (
              <m.div
                className={`${styles.card} ${styles.overlay}`}
                data-kanban-overlay
                initial={false}
                style={{
                  width: grab?.width,
                  // Motion owns transform-origin; rotate/scale around the grab point so it stays put.
                  originX: grab ? grab.x / grab.width : 0.5,
                  originY: grab ? grab.y / grab.height : 0.5,
                }}
                animate={{ rotate: reduce ? 0 : 3, scale: reduce ? 1 : 1.04 }}
                transition={motionPresets.layout}
              >
                {content(active)}
              </m.div>
            ) : null}
          </DragOverlay>,
          document.body,
        )}
      </DndContext>
      {menu && onDelete
        ? createPortal(
            <div
              className={styles.menuBackdrop}
              onPointerDown={() => setMenu(null)}
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu(null);
              }}
            >
              <div
                role="menu"
                aria-label="Действия с комнатой"
                className={styles.menu}
                style={{
                  left: Math.max(8, Math.min(menu.x, window.innerWidth - 188)),
                  top: Math.max(8, Math.min(menu.y, window.innerHeight - 64)),
                }}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  role="menuitem"
                  className={styles.menuDanger}
                  onClick={() => {
                    const room = menu.room;
                    setMenu(null);
                    onDelete(room);
                  }}
                >
                  Удалить
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
