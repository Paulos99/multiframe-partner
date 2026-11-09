import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  VISIT_DEFAULT_MINUTES,
  VISIT_KIND_LABELS,
  findConflicts,
  visitRoleAllowed,
  type Visit,
  type VisitKind,
} from '../../../../../packages/shared/calendar.js';
import { Button } from '../../ui/Button';
import { usePartner } from '../PartnerContext';
import { deleteVisit, saveVisit } from './calendarClient';
import { refreshCalendar, useCalendar } from './calendarStore';
import { defaultStart, durationLabel, formatTimeRange, fromLocalInputs, toLocalInputs } from './calendarView';
import styles from './Calendar.module.css';

export type VisitDraft = {
  id?: string;
  kind: VisitKind;
  projectId?: string;
  objectId?: string | null;
  userId?: string;
  startsAt?: string;
  durationMin?: number;
  note?: string;
  done?: boolean;
};

const DURATIONS = [30, 60, 90, 120, 180, 240, 300, 360, 480, 600];

/**
 * Окно «Назначить замер / монтаж»: дата, время, длительность, исполнитель, комментарий.
 * Пересечение с другими выездами того же человека видно сразу, до сохранения.
 */
export function VisitDialog({
  draft,
  reason,
  onClose,
  onSaved,
}: {
  draft: VisitDraft;
  /** Подсказка над формой, например «Комната перешла на этап «Замер»». */
  reason?: string;
  onClose: () => void;
  onSaved?: (visit: Visit) => void;
}) {
  const titleId = useId();
  const api = usePartner();
  const calendar = useCalendar();
  const editing = Boolean(draft.id);
  const [kind, setKind] = useState<VisitKind>(draft.kind);
  const [projectId, setProjectId] = useState(draft.projectId || '');
  const [objectId, setObjectId] = useState(draft.objectId || '');
  const initial = toLocalInputs(draft.startsAt || defaultStart());
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [durationMin, setDurationMin] = useState(draft.durationMin || VISIT_DEFAULT_MINUTES[draft.kind]);
  const [userId, setUserId] = useState(draft.userId || '');
  const [note, setNote] = useState(draft.note || '');
  const [done, setDone] = useState(Boolean(draft.done));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const first = useRef<HTMLInputElement>(null);

  useEffect(() => {
    first.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const projects = useMemo(
    () => api.projects.filter((p) => !p.archivedAt || p.id === draft.projectId).sort((a, b) => a.name.localeCompare(b.name, 'ru')),
    [api.projects, draft.projectId],
  );
  const rooms = useMemo(() => api.objects.filter((o) => o.projectId === projectId), [api.objects, projectId]);
  const people = useMemo(() => calendar.people.filter((p) => visitRoleAllowed(kind, p.role)), [calendar.people, kind]);
  const startsAt = fromLocalInputs(date, time);
  const conflicts = useMemo(() => {
    if (!startsAt || !userId) return [];
    return findConflicts(calendar.visits, { id: draft.id || '__new', userId, startsAt, durationMin, kind });
  }, [calendar.visits, draft.id, userId, startsAt, durationMin, kind]);

  // Подставляем исполнителя проекта, если его ещё не выбрали.
  useEffect(() => {
    if (userId || !projectId) return;
    const project = api.projects.find((p) => p.id === projectId);
    const room = api.objects.find((o) => o.id === objectId);
    const candidate = kind === 'measure' ? project?.measurerUserId : project?.crewUserId;
    const pick = [candidate, room?.assignedTo].find((id) => id && people.some((p) => p.id === id));
    if (pick) setUserId(pick);
  }, [api.objects, api.projects, kind, objectId, people, projectId, userId]);

  async function submit() {
    setError(null);
    if (!projectId) return setError('Выберите проект');
    if (!startsAt) return setError('Укажите дату и время');
    if (!userId) return setError(kind === 'measure' ? 'Выберите замерщика' : 'Выберите монтажника');
    setBusy(true);
    try {
      const result = await saveVisit({ kind, projectId, objectId: objectId || null, startsAt, durationMin, userId, note, done }, draft.id);
      await refreshCalendar();
      onSaved?.(result.visit);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!draft.id) return;
    setBusy(true);
    try {
      await deleteVisit(draft.id);
      await refreshCalendar();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось удалить');
    } finally {
      setBusy(false);
    }
  }

  const title = `${editing ? 'Выезд' : 'Назначить'}: ${VISIT_KIND_LABELS[kind].toLowerCase()}`;
  return createPortal(
    <div className={styles.backdrop} role="presentation" onClick={() => !busy && onClose()}>
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={(e) => e.stopPropagation()}>
        <h2 id={titleId}>{title}</h2>
        {reason ? <p className={styles.reason}>{reason}</p> : null}
        <fieldset className={styles.kindSwitch}>
          <legend className={styles.srOnly}>Тип выезда</legend>
          {(['measure', 'install'] as VisitKind[]).map((value) => (
            <label key={value} data-checked={kind === value || undefined}>
              <input
                ref={value === kind ? first : undefined}
                type="radio"
                name="visit-kind"
                checked={kind === value}
                onChange={() => {
                  setKind(value);
                  setUserId('');
                  if (!editing) setDurationMin(VISIT_DEFAULT_MINUTES[value]);
                }}
              />
              {VISIT_KIND_LABELS[value]}
            </label>
          ))}
        </fieldset>
        <label className={styles.field}>
          Проект
          <select aria-label="Проект" value={projectId} onChange={(e) => { setProjectId(e.target.value); setObjectId(''); }}>
            <option value="">Выберите проект</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {[p.name, p.address].filter(Boolean).join(' · ')}
              </option>
            ))}
          </select>
        </label>
        {rooms.length > 1 ? (
          <label className={styles.field}>
            Комната
            <select aria-label="Комната" value={objectId} onChange={(e) => setObjectId(e.target.value)}>
              <option value="">Все комнаты проекта</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.roomName || r.address || 'Комната'}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <div className={styles.row3}>
          <label className={styles.field}>
            Дата
            <input aria-label="Дата" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </label>
          <label className={styles.field}>
            Время
            <input aria-label="Время" type="time" value={time} step={900} onChange={(e) => setTime(e.target.value)} required />
          </label>
          <label className={styles.field}>
            Длительность
            <select aria-label="Длительность" value={durationMin} onChange={(e) => setDurationMin(Number(e.target.value))}>
              {[...new Set([...DURATIONS, durationMin])].sort((a, b) => a - b).map((m) => (
                <option key={m} value={m}>
                  {durationLabel(m)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className={styles.field}>
          {kind === 'measure' ? 'Замерщик' : 'Монтажник'}
          <select aria-label={kind === 'measure' ? 'Замерщик' : 'Монтажник'} value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="">Выберите сотрудника</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        {conflicts.length ? (
          <div className={styles.conflict} role="alert">
            <strong>Пересечение по времени</strong>
            {conflicts.map((v) => (
              <span key={v.id}>
                {VISIT_KIND_LABELS[v.kind]} {formatTimeRange(v.startsAt, v.durationMin)} · {v.projectName || 'проект'}
              </span>
            ))}
            <small>Сохранить можно, но сотрудник не успеет на оба выезда.</small>
          </div>
        ) : null}
        <label className={styles.field}>
          Комментарий (необязательно)
          <textarea aria-label="Комментарий" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Домофон, этаж, когда позвонить" />
        </label>
        {editing ? (
          <label className={styles.check}>
            <input type="checkbox" checked={done} onChange={(e) => setDone(e.target.checked)} />
            Выезд выполнен
          </label>
        ) : null}
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
        <div className={styles.actions}>
          <Button type="button" onClick={() => void submit()} loading={busy} disabled={busy}>
            Сохранить
          </Button>
          <button type="button" className={styles.ghost} onClick={onClose} disabled={busy}>
            Отмена
          </button>
          {editing ? (
            <button type="button" className={styles.danger} onClick={() => void remove()} disabled={busy}>
              Удалить выезд
            </button>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
