import { useRef, useState } from 'react';
import type {
  JobObject,
  Project,
  UserRole,
  JobObjectStatus,
} from '../../../../packages/shared/partner';
import { JOB_OBJECT_STATUS_LABELS } from '../../../../packages/shared/partner';
import {
  m,
  AnimatePresence,
  motionPresets,
  usePrefersReducedMotion,
} from './motionBits';
import { canMoveRoom, KANBAN_STAGES } from './kanban';
import styles from './KanbanBoard.module.css';
export function KanbanBoard({
  rooms,
  projects,
  role,
  pendingId,
  onOpen,
  onMove,
}: {
  rooms: JobObject[];
  projects: Project[];
  role: UserRole;
  pendingId: string | null;
  onOpen: (room: JobObject) => void;
  onMove: (room: JobObject, status: JobObjectStatus) => Promise<void>;
}) {
  const reduce = usePrefersReducedMotion();
  const dragged = useRef(false);
  const [active, setActive] = useState<string | null>(null);
  return (
    <>
      <p className={styles.help} id="kanban-help">
        Перетащите комнату в нужную стадию. С клавиатуры: Alt + ← или →. Нажмите
        карточку, чтобы открыть.
      </p>
      <div className={styles.board} aria-label="Канбан объектов">
        {KANBAN_STAGES.map((stage) => (
          <section
            key={stage}
            className={styles.column}
            data-kanban-stage={stage}
            aria-label={JOB_OBJECT_STATUS_LABELS[stage]}
          >
            <h3>
              {JOB_OBJECT_STATUS_LABELS[stage]}{' '}
              <span>{rooms.filter((r) => r.status === stage).length}</span>
            </h3>
            <AnimatePresence initial={false}>
              {rooms
                .filter((r) => r.status === stage)
                .map((room) => {
                  const project = projects.find((p) => p.id === room.projectId);
                  return (
                    <m.button
                      type="button"
                      key={room.id}
                      layout={!reduce}
                      layoutId={reduce ? undefined : `room-${room.id}`}
                      className={styles.card}
                      style={{
                        pointerEvents: active === room.id ? 'none' : undefined,
                      }}
                      data-room-id={room.id}
                      aria-describedby="kanban-help"
                      aria-label={`${room.roomName || 'Комната'} · ${project?.clientName || room.clientName || 'Клиент'} · ${JOB_OBJECT_STATUS_LABELS[stage]}`}
                      disabled={pendingId === room.id}
                      drag={!pendingId}
                      dragSnapToOrigin
                      dragMomentum={false}
                      initial={reduce ? false : { opacity: 0, scale: 0.98 }}
                      animate={{
                        opacity: pendingId === room.id ? 0.5 : 1,
                        scale: 1,
                      }}
                      exit={reduce ? undefined : { opacity: 0, scale: 0.98 }}
                      transition={
                        reduce ? { duration: 0 } : motionPresets.layout
                      }
                      whileDrag={
                        reduce
                          ? undefined
                          : {
                              scale: 1.03,
                              zIndex: 20,
                              boxShadow: '0 16px 40px #0003',
                            }
                      }
                      onDragStart={() => {
                        dragged.current = true;
                        setActive(room.id);
                      }}
                      onDragEnd={(_, info) => {
                        setActive(null);
                        const target = document
                          .elementFromPoint(
                            info.point.x - window.scrollX,
                            info.point.y - window.scrollY,
                          )
                          ?.closest('[data-kanban-stage]')
                          ?.getAttribute(
                            'data-kanban-stage',
                          ) as JobObjectStatus | null;
                        if (
                          target &&
                          target !== stage &&
                          canMoveRoom(role, target)
                        )
                          void onMove(room, target);
                        window.setTimeout(() => {
                          dragged.current = false;
                        }, 0);
                      }}
                      onKeyDown={(e) => {
                        if (
                          !e.altKey ||
                          !['ArrowRight', 'ArrowLeft'].includes(e.key)
                        )
                          return;
                        e.preventDefault();
                        const next =
                          KANBAN_STAGES[
                            KANBAN_STAGES.indexOf(stage) +
                              (e.key === 'ArrowRight' ? 1 : -1)
                          ];
                        if (next && canMoveRoom(role, next) && !pendingId)
                          void onMove(room, next);
                      }}
                      onClick={() => {
                        if (!dragged.current) onOpen(room);
                      }}
                    >
                      <strong>{room.roomName || 'Комната'}</strong>
                      <span>
                        {project?.clientName || room.clientName || 'Клиент'}
                      </span>
                      <small>
                        {project?.address || room.address || 'Адрес не указан'}
                      </small>
                      <span>
                        {room.room.areaM2 ?? '—'} м²
                        {room.pendingSync ? ' · ждёт синхронизации' : ''}
                      </span>
                    </m.button>
                  );
                })}
            </AnimatePresence>
            {!rooms.some((r) => r.status === stage) ? (
              <p className={styles.empty}>
                {active && canMoveRoom(role, stage)
                  ? 'Перенесите сюда'
                  : 'Нет комнат'}
              </p>
            ) : null}
          </section>
        ))}
      </div>
    </>
  );
}
