import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { canCreateObjects, type JobObject } from '../../../../packages/shared/partner';
import { Button } from '../ui/Button';
import { AnimatePresence, ModalSurface } from './motionBits';
import { usePartner } from './PartnerContext';
import { consumeReturnToTools } from './toolsReturn';
import {
  cleanName,
  pickableProjects,
  projectLabel,
  roomDataParts,
  roomHasData,
  roomLabel,
  roomsOfProject,
  type SaveTarget,
} from './toolSave';
import styles from './SaveToProjectModal.module.css';

export type SavePrefill = {
  /** Название новой комнаты по ответам: «Спальня». */
  roomName: string;
  /** Тип комнаты словами, только для показа. */
  roomType: string;
  areaM2: number | null;
};

/**
 * Небольшое окно по центру (не боковая панель): проект с поиском, затем комната —
 * существующая или новая. Запись выполняет `onSave`, окно после неё открывает страницу комнаты.
 */
export function SaveToProjectModal({
  open,
  tool,
  prefill,
  onSave,
  onClose,
}: {
  open: boolean;
  tool: 'problemomer' | 'calculator';
  prefill: SavePrefill;
  onSave: (target: SaveTarget) => Promise<JobObject>;
  onClose: () => void;
}) {
  const { user, projects, objects, leaveToCabinet } = usePartner();
  const titleId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const canCreate = Boolean(user && canCreateObjects(user.role));
  const [query, setQuery] = useState('');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [creatingProject, setCreatingProject] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [roomChoice, setRoomChoice] = useState<string | 'new' | null>(null);
  const [roomName, setRoomName] = useState(prefill.roomName);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const latest = useRef({ busy, onClose });
  latest.current = { busy, onClose };

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setProjectId(null);
    setCreatingProject(false);
    setProjectName('');
    setRoomChoice(null);
    setRoomName(prefill.roomName);
    setConfirming(false);
    setBusy(false);
    setErr(null);
    // Только при открытии: ответы не должны сбрасывать выбор.
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    searchRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !latest.current.busy) latest.current.onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [open]);

  const visible = useMemo(
    () => pickableProjects(user?.role, projects, objects, query),
    [user?.role, projects, objects, query],
  );
  const rooms = useMemo(() => (projectId ? roomsOfProject(objects, projectId) : []), [objects, projectId]);
  const chosenRoom = roomChoice && roomChoice !== 'new' ? rooms.find((room) => room.id === roomChoice) : undefined;

  const hasProject = creatingProject ? cleanName(projectName).length > 0 : Boolean(projectId);
  const hasRoom = creatingProject || roomChoice === 'new' ? cleanName(roomName).length > 0 : Boolean(chosenRoom);
  const ready = hasProject && hasRoom;

  function pickProject(id: string) {
    setCreatingProject(false);
    setProjectId(id);
    setRoomChoice(null);
    setErr(null);
  }

  function startProject() {
    setCreatingProject(true);
    setProjectId(null);
    setRoomChoice('new');
    setErr(null);
  }

  function target(): SaveTarget {
    return {
      project: creatingProject ? { create: { name: projectName } } : { id: projectId! },
      room:
        creatingProject || roomChoice === 'new'
          ? { create: { name: cleanName(roomName) } }
          : { id: chosenRoom!.id },
    };
  }

  async function run() {
    setBusy(true);
    setErr(null);
    try {
      const saved = await onSave(target());
      // Страница комнаты открывается сама: возврат в «Инструменты» здесь не нужен.
      consumeReturnToTools();
      onClose();
      leaveToCabinet(saved.id);
    } catch (ex) {
      setConfirming(false);
      setErr(ex instanceof Error ? ex.message : 'Не удалось сохранить');
    } finally {
      setBusy(false);
    }
  }

  function submit() {
    if (!ready || busy) return;
    if (chosenRoom && roomHasData(chosenRoom)) {
      setConfirming(true);
      return;
    }
    void run();
  }

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div
          className={styles.backdrop}
          role="presentation"
          onClick={() => {
            if (!busy) onClose();
          }}
        >
          <ModalSurface
            className={styles.dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            data-tool={tool}
            exit={{ opacity: 0, scale: 0.98 }}
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id={titleId}>Сохранить в проект</h2>
            {confirming && chosenRoom ? (
              <>
                <p className={styles.lead} role="alert">
                  В комнате «{roomLabel(chosenRoom)}» уже есть данные: {roomDataParts(chosenRoom).join(', ')}. Заменить
                  их новым результатом?
                </p>
                <div className={styles.actions}>
                  <button type="button" className={styles.cancel} disabled={busy} onClick={() => setConfirming(false)}>
                    Назад
                  </button>
                  <Button loading={busy} onClick={() => void run()}>
                    Заменить и сохранить
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className={styles.lead}>
                  {tool === 'problemomer'
                    ? 'Профиль комнаты и площадь запишутся в комнату проекта.'
                    : 'Площадь и расчёт запишутся в комнату проекта.'}
                </p>

                <section className={styles.block} aria-label="Проект">
                  <h3>Проект</h3>
                  <input
                    ref={searchRef}
                    type="search"
                    className={styles.search}
                    aria-label="Найти проект"
                    placeholder="Найти проект"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                  <ul className={styles.list}>
                    {visible.map((project) => (
                      <li key={project.id}>
                        <button
                          type="button"
                          className={styles.item}
                          aria-pressed={!creatingProject && projectId === project.id}
                          onClick={() => pickProject(project.id)}
                        >
                          {projectLabel(project)}
                        </button>
                      </li>
                    ))}
                  </ul>
                  {!visible.length ? (
                    <p className={styles.empty}>
                      {query.trim()
                        ? 'Проектов с таким названием нет.'
                        : canCreate
                          ? 'Проектов пока нет.'
                          : 'Нет проектов с назначенными вам комнатами.'}
                    </p>
                  ) : null}
                  {canCreate ? (
                    creatingProject ? (
                      <label className={styles.field}>
                        Название нового проекта
                        <input
                          value={projectName}
                          placeholder="Например, Квартира на Ленина"
                          onChange={(event) => setProjectName(event.target.value)}
                        />
                      </label>
                    ) : (
                      <button type="button" className={styles.link} onClick={startProject}>
                        Создать проект
                      </button>
                    )
                  ) : null}
                </section>

                {projectId || creatingProject ? (
                  <section className={styles.block} aria-label="Комната">
                    <h3>Комната</h3>
                    {!creatingProject ? (
                      <ul className={styles.list}>
                        {rooms.map((room) => (
                          <li key={room.id}>
                            <button
                              type="button"
                              className={styles.item}
                              aria-pressed={roomChoice === room.id}
                              onClick={() => {
                                setRoomChoice(room.id);
                                setErr(null);
                              }}
                            >
                              <span>{roomLabel(room)}</span>
                              <span className={styles.meta}>
                                {roomHasData(room) ? roomDataParts(room).join(', ') : 'пустая'}
                              </span>
                            </button>
                          </li>
                        ))}
                        {canCreate ? (
                          <li>
                            <button
                              type="button"
                              className={styles.item}
                              aria-pressed={roomChoice === 'new'}
                              onClick={() => {
                                setRoomChoice('new');
                                setErr(null);
                              }}
                            >
                              Создать комнату
                            </button>
                          </li>
                        ) : null}
                      </ul>
                    ) : null}
                    {!rooms.length && !canCreate && !creatingProject ? (
                      <p className={styles.empty}>В этом проекте нет назначенных вам комнат.</p>
                    ) : null}
                    {creatingProject || roomChoice === 'new' ? (
                      <div className={styles.newRoom}>
                        <label className={styles.field}>
                          Название комнаты
                          <input value={roomName} onChange={(event) => setRoomName(event.target.value)} />
                        </label>
                        <p className={styles.meta} data-testid="save-prefill">
                          {[
                            prefill.roomType ? `Тип: ${prefill.roomType}` : null,
                            prefill.areaM2 ? `Площадь: ${prefill.areaM2} м²` : null,
                          ]
                            .filter(Boolean)
                            .join(' · ') || 'Тип и площадь возьмутся из результата.'}
                        </p>
                      </div>
                    ) : null}
                  </section>
                ) : null}

                {err ? (
                  <p className={styles.error} role="alert">
                    {err}
                  </p>
                ) : null}
                <div className={styles.actions}>
                  <button type="button" className={styles.cancel} disabled={busy} onClick={onClose}>
                    Отмена
                  </button>
                  <Button loading={busy} disabled={!ready} onClick={submit}>
                    Сохранить
                  </Button>
                </div>
              </>
            )}
          </ModalSurface>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
