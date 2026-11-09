import { useMemo, useState } from 'react';
import { VISIT_KIND_LABELS, conflictIds, visitStartMs, type Visit, type VisitKind } from '../../../../../packages/shared/calendar.js';
import { ChevronLeftIcon, ChevronRightIcon, MoreIcon } from '../../icons';
import { usePartner } from '../PartnerContext';
import { markVisitDone } from './calendarClient';
import { refreshCalendar, setCalendarOrgFilter, useCalendar } from './calendarStore';
import {
  type CalendarMode,
  durationLabel,
  formatTimeRange,
  rangeTitle,
  sameDay,
  shiftCursor,
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

/**
 * Раздел «Календарь»: замеры и монтажи по дням, неделям и месяцу.
 * Замерщик и монтажник видят свои выезды, владелец и менеджер — всю компанию, StP — все компании.
 * Это решает сервер; здесь фильтры по партнёру (для админа StP), типу и сотруднику.
 */
export function CalendarPanel({ onOpenVisit }: { onOpenVisit?: (visit: Visit) => void }) {
  const api = usePartner();
  const calendar = useCalendar();
  const role = api.user?.role;
  const [mode, setMode] = useState<CalendarMode>('week');
  const [cursor, setCursor] = useState(() => startOfDay(new Date()));
  const [kind, setKind] = useState<'' | VisitKind>('');
  const [person, setPerson] = useState('');
  const [dialog, setDialog] = useState<VisitDraft | null>(null);
  const [details, setDetails] = useState<Visit | null>(null);
  const days = useMemo(() => visibleDays(mode, cursor), [mode, cursor]);
  const clashes = useMemo(() => conflictIds(calendar.visits), [calendar.visits]);
  const showOrg = role === 'admin';
  const partners = calendar.partners || [];
  const showPartnerFilter = role === 'admin' && partners.length > 0;

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
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const list = map.get(key) || [];
      list.push(v);
      map.set(key, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    return map;
  }, [filtered]);
  const visitsOn = (d: Date) => byDay.get(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`) || [];
  const visibleClashes = filtered.filter((v) => clashes.has(v.id) && days.some((d) => sameDay(d, new Date(v.startsAt))));
  const today = new Date();

  function card(v: Visit, compact: boolean) {
    const clash = clashes.has(v.id);
    const open = onOpenVisit ? () => onOpenVisit(v) : () => setDetails(v);
    return (
      <li key={v.id} className={styles.event} data-kind={v.kind} data-done={v.doneAt ? '' : undefined} data-clash={clash ? '' : undefined}>
        <button type="button" className={styles.eventMain} onClick={open} aria-label={`${VISIT_KIND_LABELS[v.kind]} ${formatTimeRange(v.startsAt, v.durationMin)}, ${v.projectName || ''}${v.roomName ? `, ${v.roomName}` : ''}. ${onOpenVisit ? 'Открыть' : 'Подробнее'}`}>
          <span className={styles.eventTime}>{formatTimeRange(v.startsAt, v.durationMin)}</span>
          <span className={styles.eventKind}>{VISIT_KIND_LABELS[v.kind]}{v.doneAt ? ' · выполнен' : ''}</span>
          <span className={styles.eventTitle}>{v.projectName}{v.roomName ? ` · ${v.roomName}` : ''}</span>
          <span className={styles.eventMeta}>{[v.userName, showOrg ? v.orgName : null, compact ? null : v.address].filter(Boolean).join(' · ')}</span>
          {clash ? <span className={styles.clashTag}>Пересечение</span> : null}
        </button>
        <button type="button" className={styles.eventMore} aria-label="Подробнее о выезде" onClick={() => setDetails(v)}>
          <MoreIcon size={18} />
        </button>
      </li>
    );
  }

  return (
    <section className={styles.panel} aria-label="Календарь">
      <header className={styles.head}>
        <div>
          <h2>Календарь</h2>
          <p className={styles.lead}>
            {role === 'measurer' || role === 'crew'
              ? 'Ваши замеры и монтажи. Время назначает владелец или менеджер.'
              : role === 'admin'
                ? 'Замеры и монтажи всех партнёров.'
                : 'Замеры и монтажи компании. Нажмите на выезд, чтобы открыть проект.'}
          </p>
        </div>
        {calendar.canPlan ? (
          <button type="button" className={styles.primary} onClick={() => setDialog({ kind: 'measure' })}>
            Назначить выезд
          </button>
        ) : null}
      </header>

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

      {mode === 'month' ? (
        <div className={styles.month}>
          {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((d) => (
            <span key={d} className={styles.weekHead} aria-hidden="true">
              {d}
            </span>
          ))}
          {days.map((d) => {
            const list = visitsOn(d);
            return (
              <div key={d.toISOString()} className={styles.monthCell} data-out={d.getMonth() !== cursor.getMonth() ? '' : undefined} data-today={sameDay(d, today) ? '' : undefined}>
                <button type="button" className={styles.dayNum} aria-label={`${d.getDate()}, выездов: ${list.length}. Открыть день`} onClick={() => { setCursor(d); setMode('day'); }}>
                  {d.getDate()}
                </button>
                <ul className={styles.list}>
                  {list.slice(0, 3).map((v) => card(v, true))}
                </ul>
                {list.length > 3 ? (
                  <button type="button" className={styles.more} onClick={() => { setCursor(d); setMode('day'); }}>
                    ещё {list.length - 3}
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <div className={mode === 'week' ? styles.week : styles.day}>
          {days.map((d) => {
            const list = visitsOn(d);
            return (
              <div key={d.toISOString()} className={styles.dayCol} data-today={sameDay(d, today) ? '' : undefined}>
                <h3 className={styles.dayHead}>
                  {mode === 'week' ? `${weekdayShort(d)}, ${d.getDate()}` : `${list.length ? `Выездов: ${list.length}` : 'Выездов нет'}`}
                </h3>
                {list.length ? <ul className={styles.list}>{list.map((v) => card(v, mode === 'week'))}</ul> : <p className={styles.empty}>Свободно</p>}
              </div>
            );
          })}
        </div>
      )}
      {!calendar.loading && calendar.loaded && !calendar.visits.length ? (
        <p className={styles.emptyAll}>
          {calendar.canPlan ? 'Выездов пока нет. Назначьте замер или монтаж: кнопка «Назначить выезд» или из карточки проекта.' : 'Выездов пока нет.'}
        </p>
      ) : null}

      {details ? (
        <VisitDetails
          visit={details}
          canPlan={calendar.canPlan}
          mine={details.userId === api.user?.id}
          onClose={() => setDetails(null)}
          onOpen={onOpenVisit ? () => { setDetails(null); onOpenVisit(details); } : undefined}
          onEdit={() => {
            setDetails(null);
            setDialog({ id: details.id, kind: details.kind, projectId: details.projectId, objectId: details.objectId, userId: details.userId, startsAt: details.startsAt, durationMin: details.durationMin, note: details.note, done: Boolean(details.doneAt) });
          }}
        />
      ) : null}
      {dialog ? <VisitDialog draft={dialog} onClose={() => setDialog(null)} /> : null}
    </section>
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
            <dd>{new Date(visit.startsAt).toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}, {durationLabel(visit.durationMin)}</dd>
          </div>
          <div>
            <dt>Проект</dt>
            <dd>{visit.projectName}{visit.roomName ? ` · ${visit.roomName}` : ''}</dd>
          </div>
          {visit.address ? (
            <div>
              <dt>Адрес</dt>
              <dd>{visit.address}</dd>
            </div>
          ) : null}
          <div>
            <dt>Исполнитель</dt>
            <dd>{visit.userName}{visit.orgName ? ` · ${visit.orgName}` : ''}</dd>
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
        {error ? <p className={styles.error} role="alert">{error}</p> : null}
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
