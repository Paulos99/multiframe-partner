import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { JobObject, Project } from '../../../../../packages/shared/partner';
import { Button } from '../../ui/Button';
import { ModalSurface } from '../motionBits';
import styles from '../partner.module.css';
import { claimSave, releaseSave } from '../idempotency';
import {
  areasDiffer,
  saveSummary,
  validateSave,
  type AreaChoice,
  type SaveDraftView,
  type SaveIntent,
  type SaveMode,
} from './saveDestination';

export function SaveDestination({
  presentation = 'inline',
  draft,
  projects,
  rooms,
  boundRoom = null,
  busy = false,
  notice = null,
  onCancel,
  onConfirm,
}: {
  presentation?: 'inline' | 'dialog';
  draft: SaveDraftView;
  projects: Project[];
  rooms: JobObject[];
  boundRoom?: JobObject | null;
  busy?: boolean;
  notice?: string | null;
  onCancel: () => void;
  onConfirm: (intent: SaveIntent) => Promise<void>;
}) {
  const titleId = useId();
  const [mode, setMode] = useState<SaveMode>(projects.length ? 'existing' : 'new');
  const [projectId, setProjectId] = useState(boundRoom?.projectId || '');
  const [roomId, setRoomId] = useState(boundRoom?.id || '');
  const [query, setQuery] = useState('');
  const [projectName, setProjectName] = useState('');
  const [roomName, setRoomName] = useState(boundRoom?.roomName || '');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [areaChoice, setAreaChoice] = useState<AreaChoice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const saveLock = useRef(false);

  useEffect(() => {
    if (presentation !== 'dialog') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [presentation, busy, onCancel]);

  const visibleProjects = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return projects;
    return projects.filter((project) =>
      [project.name, project.address, project.clientName, project.city].some((part) =>
        (part || '').toLowerCase().includes(needle),
      ),
    );
  }, [projects, query]);

  const projectRooms = useMemo(
    () => rooms.filter((room) => room.projectId === projectId),
    [rooms, projectId],
  );
  const selectedRoom = boundRoom || rooms.find((room) => room.id === roomId) || null;
  const roomArea = selectedRoom?.room.areaM2 ?? null;
  const mismatch = mode === 'existing' && areasDiffer(roomArea, draft.areaM2);
  const lines = saveSummary(draft);

  async function confirm() {
    if (!claimSave(saveLock)) return;
    try {
      const intent: SaveIntent = {
        mode: boundRoom ? 'existing' : mode,
        projectId: boundRoom?.projectId || projectId || null,
        roomId: boundRoom?.id || roomId || null,
        projectName,
        roomName,
        phone,
        address,
        areaChoice: mismatch ? areaChoice : null,
        roomAreaM2: roomArea ?? null,
      };
      const problem = validateSave(draft, intent);
      if (problem) {
        setError(problem);
        return;
      }
      setError(null);
      await onConfirm(intent);
    } finally {
      releaseSave(saveLock);
    }
  }

  const body = (
    <div className={presentation === 'dialog' ? styles.saveDialog : styles.saveInline}>
      <h2 id={titleId}>Куда сохранить?</h2>
      <p className={styles.lead}>
        {boundRoom
          ? `Результат запишется в комнату «${boundRoom.roomName || boundRoom.clientName || 'Комната'}».`
          : 'Выберите существующие проект и комнату или создайте новые. Пока не нажмёте «Сохранить», ничего не создаётся.'}
      </p>
      <ul className={styles.saveSummary}>
        {lines.length ? lines.map((line) => <li key={line}>{line}</li>) : <li>Пока нечего записывать</li>}
      </ul>

      {boundRoom ? null : (
        <div className={styles.salesCtas} role="group" aria-label="Куда записать">
          <button
            type="button"
            className={mode === 'existing' ? styles.primary : styles.ghost}
            onClick={() => setMode('existing')}
          >
            Существующий проект
          </button>
          <button
            type="button"
            className={mode === 'new' ? styles.primary : styles.ghost}
            onClick={() => setMode('new')}
          >
            Новый проект
          </button>
        </div>
      )}

      {!boundRoom && mode === 'existing' ? (
        <div className={styles.saveFields}>
          {!projects.length ? (
            <p className={styles.hint}>Пока нет проектов. Переключитесь на новый — телефон и адрес можно указать позже.</p>
          ) : null}
          <label className={styles.field}>
            Найти проект
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Название или адрес"
              inputMode="search"
            />
          </label>
          <label className={styles.field}>
            Проект
            <select
              aria-label="Существующий проект"
              value={projectId}
              onChange={(event) => {
                setProjectId(event.target.value);
                setRoomId('');
                setAreaChoice(null);
              }}
            >
              <option value="">Выберите проект</option>
              {visibleProjects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                  {project.address ? ` · ${project.address}` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            Комната
            <select
              aria-label="Существующая комната"
              value={roomId}
              onChange={(event) => {
                setRoomId(event.target.value);
                setAreaChoice(null);
              }}
            >
              <option value="">Выберите комнату</option>
              {projectRooms.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.roomName || room.clientName || 'Комната'}
                  {room.room.areaM2 != null ? ` · ${room.room.areaM2} м²` : ''}
                  {room.estimate?.totalCost != null
                    ? ` · ${Math.round(room.estimate.totalCost).toLocaleString('ru-RU')} ₽`
                    : ''}
                </option>
              ))}
            </select>
          </label>
          {projectId && !projectRooms.length ? (
            <p className={styles.hint}>В этом проекте пока нет комнат. Создайте новый проект с комнатой.</p>
          ) : null}
        </div>
      ) : null}

      {!boundRoom && mode === 'new' ? (
        <div className={styles.saveFields}>
          <label className={styles.field}>
            Название проекта
            <input
              value={projectName}
              onChange={(event) => setProjectName(event.target.value)}
              placeholder="Квартира на Лесной"
            />
          </label>
          <label className={styles.field}>
            Название комнаты
            <input
              value={roomName}
              onChange={(event) => setRoomName(event.target.value)}
              placeholder="Кухня"
            />
          </label>
          <label className={styles.field}>
            Телефон, если уже известен
            <input
              value={phone}
              inputMode="tel"
              onChange={(event) => setPhone(event.target.value)}
              placeholder="Можно позже"
            />
          </label>
          <label className={styles.field}>
            Адрес, если уже известен
            <input
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder="Можно позже"
            />
          </label>
        </div>
      ) : null}

      {mismatch ? (
        <fieldset className={styles.saveChoice}>
          <legend>Площадь комнаты и консультации различаются</legend>
          <p className={styles.lead}>
            В комнате {roomArea} м², в консультации {draft.areaM2} м². Выберите, что записать. Сумма будет
            соответствовать выбранной площади.
          </p>
          <button
            type="button"
            className={areaChoice === 'consultation' ? styles.primary : styles.ghost}
            onClick={() => setAreaChoice('consultation')}
          >
            Принять площадь консультации
          </button>
          <button
            type="button"
            className={areaChoice === 'room' ? styles.primary : styles.ghost}
            onClick={() => setAreaChoice('room')}
          >
            Сохранить площадь комнаты и пересчитать
          </button>
        </fieldset>
      ) : null}

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className={styles.flash} role="status">
          {notice}
        </p>
      ) : null}
      <div className={styles.actionRow}>
        <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>
          Отмена
        </Button>
        <Button type="button" loading={busy} disabled={busy} onClick={() => void confirm()}>
          Сохранить
        </Button>
      </div>
    </div>
  );

  if (presentation !== 'dialog') return body;

  return (
    <div className={styles.saveOverlay} onMouseDown={onCancel}>
      <ModalSurface
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {body}
      </ModalSurface>
    </div>
  );
}
