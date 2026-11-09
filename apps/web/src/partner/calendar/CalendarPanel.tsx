import { useMemo, useRef, useState, type ReactNode } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  pointerWithin,
  closestCenter,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { VISIT_KIND_LABELS, conflictIds, visitStartMs, type Visit, type VisitKind } from '../../../../../packages/shared/calendar.js';
import { ChevronLeftIcon, ChevronRightIcon, MoreIcon } from '../../icons';
import { usePartner } from '../PartnerContext';
import { markVisitDone, saveVisit } from './calendarClient';
import { patchCalendarVisits, refreshCalendar, setCalendarOrgFilter, useCalendar } from './calendarStore';
import {
  type CalendarMode,
  dayKey,
  durationLabel,
  formatTimeRange,
  moveStartsAtToDate,
  rangeTitle,
  sameDay,
  shiftCursor,
  startAtDay,
  startOfDay,
  visibleDays,
  weekdayShort,
} from './calendarView';
import { VisitDialog, type VisitDraft } from './VisitDialog';
import styles from './Calendar.module.css';

const MODES: Array<[CalendarMode, string]> = [
  ['day', 'День'],
  ['week', 'Неделя'],
  ['month', 'Месяц'],
];

function dayDropId(d: Date): string {
  return `day:${dayKey(d)}`;
}

function parseDayDropId(id: string | number): Date | null {
  const raw = String(id);
  if (!raw.startsWith('day:')) return null;
  const parts = raw.slice(4).split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
  const [y, m, day] = parts;
  return new Date(y, m, day);
}

/**
 * Раздел «Календарь»: замеры и монтажи по дням, неделям и месяцу.
 * Замерщик и монтажник видят свои выезды, владелец и менеджер — всю компанию, StP — все компании.
 * Владелец и менеджер перетаскивают выезды между днями и создают новые кликом по дате.
 */
export function CalendarPanel({
  onOpenVisit,
  embedded,
}: {
  onOpenVisit?: (visit: Visit) => void;
  /** Внутри вкладки «Проекты»: без своего заголовка, переключатель вида снаружи. */
  embedded?: boolean;
}) {
  const api = usePartner();
  const calendar = useCalendar();
  const role = api.user?.role;
  const [mode, setMode] = useState<CalendarMode>('week');
  const [cursor, setCursor] = useState(() => startOfDay(new Date()));
  const [kind, setKind] = useState<'' | VisitKind>('');
  const [person, setPerson] = useState('');
  const [dialog, setDialog] = useState<VisitDraft | null>(null);
  const [details, setDetails] = useState<Visit | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const moving = useRef(false);
  const days = useMemo(() => visibleDays(mode, cursor), [mode, cursor]);
  const clashes = useMemo(() => conflictIds(calendar.visits), [calendar.visits]);
  const showOrg = role === 'admin';
  const partners = calendar.partners || [];
  const showPartnerFilter = role === 'admin' && partners.length > 0;
  const canPlan = calendar.canPlan;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
  );

  const people = useMemo(() => {
    const map = new Map<string, string>();
    for (const v of calendar.visits) map.set(v.userId, v.userName || 'Сотрудник');
    for (const p of calendar.people) map.set(p.id, p.name);
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], 'ru'));
  }, [calendar.visits, calendar.people]);

  const filtered = useMemo(
    () => calendar.visits.filter((v) => (!kind || v.kind === kind) && (!person || v.userId === person)),
    [calendar.visits, kind, person],
  );
  const byDay = useMemo(() => {
    const map = new Map<string, Visit[]>();
    for (const v of filtered) {
      const ms = visitStartMs(v);
      if (ms == null) continue;
      const d = new Date(ms);
      const key = dayKey(d);
      const list = map.get(key) || [];
      list.push(v);
      map.set(key, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    return map;
  }, [filtered]);
  const visitsOn = (d: Date) => byDay.get(dayKey(d)) || [];
  const visibleClashes = filtered.filter((v) => clashes.has(v.id) && days.some((d) => sameDay(d, new Date(v.startsAt))));
  const today = new Date();
  const activeVisit = activeId ? calendar.visits.find((v) => v.id === activeId) || null : null;

  function openCreate(day: Date) {
    if (!canPlan) return;
    setDetails(null);
    setDialog({ kind: 'measure', startsAt: startAtDay(day) });
  }

  async function moveVisit(visit: Visit, target: Date) {
    const nextStarts = moveStartsAtToDate(visit.startsAt, target);
    if (sameDay(new Date(visit.startsAt), target) && nextStarts === visit.startsAt) return;
    const previous = calendar.visits;
    setMoveError(null);
    moving.current = true;
    patchCalendarVisits(previous.map((v) => (v.id === visit.id ? { ...v, startsAt: nextStarts } : v)));
    try {
      await saveVisit(
        {
          kind: visit.kind,
          projectId: visit.projectId,
          objectId: visit.objectId,
          startsAt: nextStarts,
          durationMin: visit.durationMin,
          userId: visit.userId,
          note: visit.note,
          done: Boolean(visit.doneAt),
        },
        visit.id,
      );
      await refreshCalendar({ force: true });
    } catch (err) {
      patchCalendarVisits(previous);
      setMoveError(err instanceof Error ? err.message : 'Не удалось перенести выезд');
      await refreshCalendar({ force: true });
    } finally {
      moving.current = false;
    }
  }

  function onDragStart(event: DragStartEvent) {
    if (!canPlan || moving.current) return;
    setMoveError(null);
    setActiveId(String(event.active.id));
  }

  function onDragEnd(event: DragEndEvent) {
    const visitId = String(event.active.id);
    const visit = calendar.visits.find((v) => v.id === visitId);
    const target = event.over ? parseDayDropId(event.over.id) : null;
    setActiveId(null);
    if (!canPlan || !visit || !target || moving.current) return;
    void moveVisit(visit, target);
  }

  function onDragCancel() {
    setActiveId(null);
  }

  function card(v: Visit, compact: boolean) {
    return (
      <EventCard
        key={v.id}
        visit={v}
        compact={compact}
        clash={clashes.has(v.id)}
        canDrag={canPlan}
        dragging={activeId === v.id}
        showOrg={showOrg}
        onOpen={onOpenVisit ? () => onOpenVisit(v) : () => setDetails(v)}
        onMore={() => setDetails(v)}
        openLabel={onOpenVisit ? 'Открыть' : 'Подробнее'}
      />
    );
  }

  const lead =
    role === 'measurer' || role === 'crew'
      ? 'Ваши замеры и монтажи. Время назначает владелец или менеджер.'
      : role === 'admin'
        ? 'Замеры и монтажи всех партнёров.'
        : canPlan
          ? 'Замеры и монтажи компании. Перетащите выезд на другой день или нажмите на дату, чтобы назначить новый.'
          : 'Замеры и монтажи компании. Нажмите на выезд, чтобы открыть проект.';

  return (
    <section className={styles.panel} aria-label="Календарь" data-embedded={embedded ? '' : undefined}>
      {embedded ? (
        <>
          <h2 className={styles.srOnly}>Календарь</h2>
          {canPlan ? (
            <header className={styles.head}>
              <p className={styles.lead}>{lead}</p>
              <button type="button" className={styles.primary} onClick={() => setDialog({ kind: 'measure' })}>
                Назначить выезд
              </button>
            </header>
          ) : (
            <p className={styles.lead}>{lead}</p>
          )}
        </>
      ) : (
        <header className={styles.head}>
          <div>
            <h2>Календарь</h2>
            <p className={styles.lead}>{lead}</p>
          </div>
          {canPlan ? (
            <button type="button" className={styles.primary} onClick={() => setDialog({ kind: 'measure' })}>
              Назначить выезд
            </button>
          ) : null}
        </header>
      )}

      <div className={styles.toolbar}>
        <div className={styles.nav}>
          <button type="button" className={styles.ghost} onClick={() => setCursor(startOfDay(new Date()))}>
            Сегодня
          </button>
          <button type="button" className={styles.iconBtn} aria-label="Назад" onClick={() => setCursor((c) => shiftCursor(mode, c, -1))}>
            <ChevronLeftIcon size={18} />
          </button>
          <button type="button" className={styles.iconBtn} aria-label="Вперёд" onClick={() => setCursor((c) => shiftCursor(mode, c, 1))}>
            <ChevronRightIcon size={18} />
          </button>
          <strong className={styles.rangeTitle} aria-live="polite">
            {rangeTitle(mode, cursor)}
          </strong>
        </div>
        <div className={styles.modes} role="group" aria-label="Вид календаря">
          {MODES.map(([id, label]) => (
            <button key={id} type="button" aria-pressed={mode === id} onClick={() => setMode(id)}>
              {label}
            </button>
          ))}
        </div>
        <div className={styles.filters}>
          {showPartnerFilter ? (
            <label className={styles.partnerFilter}>
              <span className={styles.filterLabel}>Партнёр</span>
              <select
                aria-label="Партнёр"
                value={calendar.orgFilter || ''}
                onChange={(e) => {
                  setPerson('');
                  setCalendarOrgFilter(e.target.value || null);
                }}
              >
                <option value="">Все партнёры</option>
                {partners.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label>
            <span className={styles.srOnly}>Тип выезда</span>
            <select aria-label="Тип выезда" value={kind} onChange={(e) => setKind(e.target.value as '' | VisitKind)}>
              <option value="">Замеры и монтажи</option>
              <option value="measure">Только замеры</option>
              <option value="install">Только монтажи</option>
            </select>
          </label>
          {people.length > 1 ? (
            <label>
              <span className={styles.srOnly}>Сотрудник</span>
              <select aria-label="Сотрудник" value={person} onChange={(e) => setPerson(e.target.value)}>
                <option value="">Все сотрудники</option>
                {people.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      </div>

      {visibleClashes.length ? (
        <p className={styles.clashBanner} role="status">
          Пересечения по времени: {visibleClashes.length} {visibleClashes.length === 1 ? 'выезд' : visibleClashes.length < 5 ? 'выезда' : 'выездов'}. Один сотрудник назначен на два места сразу.
        </p>
      ) : null}
      {calendar.error ? (
        <p className={styles.error} role="alert">
          {calendar.error}
        </p>
      ) : null}
      {moveError ? (
        <p className={styles.error} role="alert">
          {moveError}
        </p>
      ) : null}
      {canPlan ? (
        <p className={styles.srOnly} id="calendar-dnd-help">
          Перетащите выезд на другой день мышью или удерживая пальцем. Нажмите на пустое место дня, чтобы назначить новый выезд.
        </p>
      ) : null}

      <DndContext
        sensors={sensors}
        collisionDetection={(args) => {
          const hits = pointerWithin(args);
          if (hits.length) return hits;
          return closestCenter(args);
        }}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
        accessibility={{
          screenReaderInstructions: {
            draggable:
              'Чтобы перенести выезд, зажмите карточку и перетащите на другой день. Escape — отменить.',
          },
          announcements: {
            onDragStart({ active }) {
              const v = calendar.visits.find((x) => x.id === active.id);
              return v ? `Взят выезд ${VISIT_KIND_LABELS[v.kind]} ${formatTimeRange(v.startsAt, v.durationMin)}.` : 'Взят выезд.';
            },
            onDragOver({ over }) {
              const day = over ? parseDayDropId(over.id) : null;
              return day
                ? `Над ${day.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}.`
                : 'Вне дней календаря.';
            },
            onDragEnd({ over }) {
              const day = over ? parseDayDropId(over.id) : null;
              return day
                ? `Отпущено на ${day.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}.`
                : 'Перенос отменён.';
            },
            onDragCancel() {
              return 'Перенос выезда отменён.';
            },
          },
        }}
      >
        {mode === 'month' ? (
          <div className={styles.month} aria-describedby={canPlan ? 'calendar-dnd-help' : undefined}>
            {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((d) => (
              <span key={d} className={styles.weekHead} aria-hidden="true">
                {d}
              </span>
            ))}
            {days.map((d) => {
              const list = visitsOn(d);
              return (
                <DayCell
                  key={d.toISOString()}
                  day={d}
                  canPlan={canPlan}
                  out={d.getMonth() !== cursor.getMonth()}
                  today={sameDay(d, today)}
                  onCreate={() => openCreate(d)}
                  onOpenDay={() => {
                    setCursor(d);
                    setMode('day');
                  }}
                >
                  <ul className={styles.list}>{list.slice(0, 3).map((v) => card(v, true))}</ul>
                  {list.length > 3 ? (
                    <button
                      type="button"
                      className={styles.more}
                      onClick={() => {
                        setCursor(d);
                        setMode('day');
                      }}
                    >
                      ещё {list.length - 3}
                    </button>
                  ) : null}
                </DayCell>
              );
            })}
          </div>
        ) : (
          <div className={mode === 'week' ? styles.week : styles.day} aria-describedby={canPlan ? 'calendar-dnd-help' : undefined}>
            {days.map((d) => {
              const list = visitsOn(d);
              return (
                <DayColumn
                  key={d.toISOString()}
                  day={d}
                  mode={mode}
                  canPlan={canPlan}
                  today={sameDay(d, today)}
                  count={list.length}
                  onCreate={() => openCreate(d)}
                >
                  {list.length ? <ul className={styles.list}>{list.map((v) => card(v, mode === 'week'))}</ul> : <p className={styles.empty}>Свободно</p>}
                </DayColumn>
              );
            })}
          </div>
        )}

        <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.2, 0, 0, 1)' }}>
          {activeVisit ? (
            <div className={styles.dragOverlay} data-kind={activeVisit.kind}>
              <span className={styles.eventTime}>{formatTimeRange(activeVisit.startsAt, activeVisit.durationMin)}</span>
              <span className={styles.eventKind}>{VISIT_KIND_LABELS[activeVisit.kind]}</span>
              <span className={styles.eventTitle}>
                {activeVisit.projectName}
                {activeVisit.roomName ? ` · ${activeVisit.roomName}` : ''}
              </span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {!calendar.loading && calendar.loaded && !calendar.visits.length ? (
        <p className={styles.emptyAll}>
          {canPlan ? 'Выездов пока нет. Назначьте замер или монтаж: кнопка «Назначить выезд», клик по дате или из карточки проекта.' : 'Выездов пока нет.'}
        </p>
      ) : null}

      {details ? (
        <VisitDetails
          visit={details}
          canPlan={canPlan}
          mine={details.userId === api.user?.id}
          onClose={() => setDetails(null)}
          onOpen={onOpenVisit ? () => { setDetails(null); onOpenVisit(details); } : undefined}
          onEdit={() => {
            setDetails(null);
            setDialog({
              id: details.id,
              kind: details.kind,
              projectId: details.projectId,
              objectId: details.objectId,
              userId: details.userId,
              startsAt: details.startsAt,
              durationMin: details.durationMin,
              note: details.note,
              done: Boolean(details.doneAt),
            });
          }}
        />
      ) : null}
      {dialog ? <VisitDialog draft={dialog} onClose={() => setDialog(null)} /> : null}
    </section>
  );
}

function DayColumn({
  day,
  mode,
  canPlan,
  today,
  count,
  onCreate,
  children,
}: {
  day: Date;
  mode: CalendarMode;
  canPlan: boolean;
  today: boolean;
  count: number;
  onCreate: () => void;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: dayDropId(day), disabled: !canPlan });
  return (
    <div
      ref={setNodeRef}
      className={styles.dayCol}
      data-today={today ? '' : undefined}
      data-drop={isOver ? '' : undefined}
      data-day={dayKey(day)}
    >
      <div className={styles.dayHeadRow}>
        <h3 className={styles.dayHead}>
          {mode === 'week' ? `${weekdayShort(day)}, ${day.getDate()}` : `${count ? `Выездов: ${count}` : 'Выездов нет'}`}
        </h3>
        {canPlan ? (
          <button type="button" className={styles.dayAdd} aria-label={`Назначить выезд на ${day.toLocaleDateString('ru-RU')}`} onClick={onCreate}>
            Добавить
          </button>
        ) : null}
      </div>
      {children}
      {canPlan && !count ? (
        <button type="button" className={styles.dayHit} aria-label={`Назначить выезд на ${day.toLocaleDateString('ru-RU')}`} onClick={onCreate} />
      ) : null}
    </div>
  );
}

function DayCell({
  day,
  canPlan,
  out,
  today,
  onCreate,
  onOpenDay,
  children,
}: {
  day: Date;
  canPlan: boolean;
  out: boolean;
  today: boolean;
  onCreate: () => void;
  onOpenDay: () => void;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: dayDropId(day), disabled: !canPlan });
  return (
    <div
      ref={setNodeRef}
      className={styles.monthCell}
      data-out={out ? '' : undefined}
      data-today={today ? '' : undefined}
      data-drop={isOver ? '' : undefined}
      data-day={dayKey(day)}
    >
      <div className={styles.dayHeadRow}>
        <button
          type="button"
          className={styles.dayNum}
          aria-label={`${day.getDate()}, открыть день`}
          onClick={onOpenDay}
        >
          {day.getDate()}
        </button>
        {canPlan ? (
          <button type="button" className={styles.dayAdd} aria-label={`Назначить выезд на ${day.toLocaleDateString('ru-RU')}`} onClick={onCreate}>
            +
          </button>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function EventCard({
  visit,
  compact,
  clash,
  canDrag,
  dragging,
  showOrg,
  onOpen,
  onMore,
  openLabel,
}: {
  visit: Visit;
  compact: boolean;
  clash: boolean;
  canDrag: boolean;
  dragging: boolean;
  showOrg: boolean;
  onOpen: () => void;
  onMore: () => void;
  openLabel: string;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: visit.id,
    data: { visit },
    disabled: !canDrag,
  });
  const hidden = dragging || isDragging;
  return (
    <li
      ref={setNodeRef}
      className={styles.event}
      data-kind={visit.kind}
      data-done={visit.doneAt ? '' : undefined}
      data-clash={clash ? '' : undefined}
      data-dragging={hidden ? '' : undefined}
      data-visit-id={visit.id}
    >
      <button
        type="button"
        className={styles.eventMain}
        onClick={onOpen}
        aria-label={`${VISIT_KIND_LABELS[visit.kind]} ${formatTimeRange(visit.startsAt, visit.durationMin)}, ${visit.projectName || ''}${visit.roomName ? `, ${visit.roomName}` : ''}. ${openLabel}`}
        {...(canDrag ? { ...listeners, ...attributes } : {})}
      >
        <span className={styles.eventTime}>{formatTimeRange(visit.startsAt, visit.durationMin)}</span>
        <span className={styles.eventKind}>
          {VISIT_KIND_LABELS[visit.kind]}
          {visit.doneAt ? ' · выполнен' : ''}
        </span>
        <span className={styles.eventTitle}>
          {visit.projectName}
          {visit.roomName ? ` · ${visit.roomName}` : ''}
        </span>
        <span className={styles.eventMeta}>{[visit.userName, showOrg ? visit.orgName : null, compact ? null : visit.address].filter(Boolean).join(' · ')}</span>
        {clash ? <span className={styles.clashTag}>Пересечение</span> : null}
      </button>
      <button
        type="button"
        className={styles.eventMore}
        aria-label="Подробнее о выезде"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onMore}
      >
        <MoreIcon size={18} />
      </button>
    </li>
  );
}

function VisitDetails({
  visit,
  canPlan,
  mine,
  onClose,
  onOpen,
  onEdit,
}: {
  visit: Visit;
  canPlan: boolean;
  mine: boolean;
  onClose: () => void;
  onOpen?: () => void;
  onEdit: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function toggleDone() {
    setBusy(true);
    setError(null);
    try {
      await markVisitDone(visit.id, !visit.doneAt);
      await refreshCalendar();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={styles.backdrop} role="presentation" onClick={onClose}>
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-label="Выезд" onClick={(e) => e.stopPropagation()}>
        <h2>
          {VISIT_KIND_LABELS[visit.kind]} · {formatTimeRange(visit.startsAt, visit.durationMin)}
        </h2>
        <dl className={styles.facts}>
          <div>
            <dt>Дата</dt>
            <dd>
              {new Date(visit.startsAt).toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}, {durationLabel(visit.durationMin)}
            </dd>
          </div>
          <div>
            <dt>Проект</dt>
            <dd>
              {visit.projectName}
              {visit.roomName ? ` · ${visit.roomName}` : ''}
            </dd>
          </div>
          {visit.address ? (
            <div>
              <dt>Адрес</dt>
              <dd>{visit.address}</dd>
            </div>
          ) : null}
          <div>
            <dt>Исполнитель</dt>
            <dd>
              {visit.userName}
              {visit.orgName ? ` · ${visit.orgName}` : ''}
            </dd>
          </div>
          {visit.note ? (
            <div>
              <dt>Комментарий</dt>
              <dd>{visit.note}</dd>
            </div>
          ) : null}
          <div>
            <dt>Статус</dt>
            <dd>{visit.doneAt ? 'Выполнен' : 'Запланирован'}</dd>
          </div>
        </dl>
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
        <div className={styles.actions}>
          {onOpen ? (
            <button type="button" className={styles.primary} onClick={onOpen}>
              Открыть проект
            </button>
          ) : null}
          {canPlan ? (
            <button type="button" className={styles.ghost} onClick={onEdit}>
              Изменить
            </button>
          ) : mine ? (
            <button type="button" className={styles.ghost} onClick={() => void toggleDone()} disabled={busy}>
              {visit.doneAt ? 'Вернуть в план' : 'Отметить выполненным'}
            </button>
          ) : null}
          <button type="button" className={styles.ghost} onClick={onClose}>
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}
