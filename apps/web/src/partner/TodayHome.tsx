import { useMemo, useState } from 'react';
import {
  JOB_OBJECT_STATUS_LABELS,
  canCreateObjects,
  type JobObject,
  type UserRole,
} from '../../../../packages/shared/partner';
import { greetingLine, greetingName } from '../../../../packages/shared/personName.js';
import { roomDisplayName } from './kanban';
import { projectStatusLabel, roomProjectStatuses } from './projectDesk';
import { usePartner } from './PartnerContext';
import { groupRoomsByProjectStage, nearestFlat, openRoomsForRole } from './todayNearest';
import styles from './partner.module.css';

function roomTitle(room: JobObject): string {
  return roomDisplayName(room);
}

/** Стадия проекта, как на доске «Проекты». Своя стадия комнаты — только если проекта нет. */
export function roomMeta(room: JobObject, projectStatus?: Parameters<typeof projectStatusLabel>[0]): string {
  const place = [room.clientName, room.address].filter(Boolean).join(' · ');
  const area = room.room?.areaM2 != null ? `${room.room.areaM2} м²` : '';
  return [projectStatus ? projectStatusLabel(projectStatus) : JOB_OBJECT_STATUS_LABELS[room.status], place, area].filter(Boolean).join(' · ');
}

function usesStageGroups(role: UserRole): boolean {
  return role === 'owner' || role === 'sales';
}

export function TodayHome({
  onOpenRoom,
  onProjects,
  onCreateProject,
  onProblemomer,
  onCalculator,
  onTraining,
  onAddPartner,
}: {
  onOpenRoom?: (id: string) => void;
  onProjects?: () => void;
  onCreateProject?: () => void;
  onProblemomer?: () => void;
  onCalculator?: () => void;
  onTraining?: () => void;
  onAddPartner?: () => void;
}) {
  const api = usePartner();
  const user = api.user!;
  const role = user.role;
  const stages = useMemo(() => roomProjectStatuses(api.projects, api.objects), [api.projects, api.objects]);
  const openRooms = useMemo(() => openRoomsForRole(api.objects, role), [api.objects, role]);
  const flatTasks = useMemo(() => nearestFlat(api.objects, role), [api.objects, role]);
  const stageGroups = useMemo(
    () => (usesStageGroups(role) ? groupRoomsByProjectStage(openRooms, stages) : []),
    [role, openRooms, stages],
  );
  const [openStage, setOpenStage] = useState<string | null>(null);
  const first = usesStageGroups(role) ? openRooms[0] : flatTasks[0];
  const canCreate = canCreateObjects(role);
  const showTools = true;
  const hasRooms = usesStageGroups(role) ? openRooms.length > 0 : flatTasks.length > 0;

  let primaryLabel = 'Открыть проекты';
  let primary = onProjects;
  if (role === 'admin') {
    primaryLabel = 'Добавить партнёра';
    primary = onAddPartner;
  } else if (first?.status === 'measured' && canCreate) {
    primaryLabel = 'Собрать КП';
    primary = () => onOpenRoom?.(first.id);
  } else if (first) {
    primaryLabel = 'Открыть комнату';
    primary = () => onOpenRoom?.(first.id);
  } else if (canCreate) {
    primaryLabel = 'Новый проект';
    primary = onCreateProject;
  } else if (onProjects) {
    primaryLabel = 'Открыть проекты';
    primary = onProjects;
  } else if (onProblemomer) {
    primaryLabel = 'Проблемомер';
    primary = onProblemomer;
  }

  const empty =
    role === 'measurer' || role === 'crew'
      ? 'Пока нет назначенных комнат. Назначение приходит от менеджера или владельца.'
      : role === 'admin'
        ? 'Добавьте партнёра — компания появится в списке сети.'
        : 'Пока нет проектов. Создайте проект с первой комнатой — она откроется на странице проекта.';

  const partners = role === 'admin' ? api.adminListPartners() : [];
  const named = Boolean(greetingName(user.displayName));

  return (
    <section className={styles.today} aria-label="Сегодня">
      <p className={styles.eyebrow}>Сегодня</p>
      <div className={styles.todayHead}>
        <div>
          <h2>{greetingLine(user.displayName)}</h2>
          {!named ? (
            <p className={styles.lead}>Имя можно указать в профиле — кнопка «Мой профиль» в шапке.</p>
          ) : null}
          <p className={styles.lead}>
            {role === 'admin'
              ? 'Сеть партнёров. Следующий шаг — компания, которой ещё нет в списке.'
              : role === 'crew'
                ? 'Комнаты, которые назначили вам на монтаж.'
                : role === 'measurer'
                  ? 'Комнаты, которые назначили вам на замер.'
                  : 'Ближайшие комнаты компании по стадиям и один следующий шаг.'}
          </p>
        </div>
        {primary ? (
          <button type="button" className={styles.primary} onClick={primary}>
            {primaryLabel}
          </button>
        ) : null}
      </div>

      <div className={styles.todayGrid}>
        <div className={styles.todayCard}>
          <h3>{role === 'admin' ? 'Партнёры' : 'Ближайшие комнаты'}</h3>
          {api.objectsLoading && role !== 'admin' && !api.objects.length ? (
            <p className={styles.lead}>Загружаем комнаты…</p>
          ) : role === 'admin' ? (
            partners.length ? (
              <ul className={styles.todayList}>
                {partners.slice(0, 5).map((partner) => (
                  <li key={partner.user.id}>
                    <button type="button" className={styles.todayTask} onClick={onProjects || onAddPartner}>
                      <strong>{partner.org?.settings.companyName || partner.user.displayName}</strong>
                      <span>{partner.org?.settings.city || 'Город не указан'}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className={styles.emptyState}>
                <p className={styles.lead}>{api.partnersLoading ? 'Загружаем партнёров…' : empty}</p>
              </div>
            )
          ) : usesStageGroups(role) && hasRooms ? (
            <ul className={styles.todayStageList}>
              {stageGroups.map((group) => {
                const expanded = openStage === group.status;
                return (
                  <li key={group.status} className={styles.todayStageItem}>
                    <button
                      type="button"
                      className={styles.todayStage}
                      aria-expanded={expanded}
                      onClick={() => setOpenStage(expanded ? null : group.status)}
                    >
                      <strong>{group.label}</strong>
                      <span className={styles.todayStageCount}>
                        {group.rooms.length}{' '}
                        {group.rooms.length === 1 ? 'комната' : group.rooms.length < 5 ? 'комнаты' : 'комнат'}
                      </span>
                    </button>
                    {expanded ? (
                      <ul className={styles.todayList}>
                        {group.rooms.map((room) => (
                          <li key={room.id}>
                            <button type="button" className={styles.todayTask} onClick={() => onOpenRoom?.(room.id)}>
                              <strong>{roomTitle(room)}</strong>
                              <span>{roomMeta(room, stages[room.id] || group.status)}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : hasRooms ? (
            <ul className={styles.todayList}>
              {flatTasks.map((room) => (
                <li key={room.id}>
                  <button type="button" className={styles.todayTask} onClick={() => onOpenRoom?.(room.id)}>
                    <strong>{roomTitle(room)}</strong>
                    <span>{roomMeta(room, stages[room.id])}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className={styles.emptyState}>
              <p className={styles.lead}>{empty}</p>
              {canCreate ? (
                <button type="button" className={styles.primary} onClick={onCreateProject}>
                  Новый проект
                </button>
              ) : onProjects ? (
                <button type="button" className={styles.ghost} onClick={onProjects}>
                  Открыть проекты
                </button>
              ) : null}
            </div>
          )}
        </div>

        {showTools ? (
          <div className={styles.todayCard}>
            <h3>Для комнаты</h3>
            <p className={styles.lead}>
              Проблемомер собирает вопросы для рекомендации по потолку. Калькулятор считает только потолок MultiFrame.
            </p>
            <div className={styles.todayActions}>
              {onProblemomer ? (
                <button type="button" className={styles.primary} onClick={onProblemomer}>
                  Проблемомер
                </button>
              ) : null}
              {onCalculator ? (
                <button type="button" className={styles.ghost} onClick={onCalculator}>
                  Калькулятор
                </button>
              ) : null}
              {onTraining ? (
                <button type="button" className={styles.ghost} onClick={onTraining}>
                  Обучение
                </button>
              ) : null}
            </div>
          </div>
        ) : onTraining ? (
          <div className={styles.todayCard}>
            <h3>Обучение</h3>
            <p className={styles.lead}>Методички сети. Папки и файлы меняет только админ.</p>
            <button type="button" className={styles.ghost} onClick={onTraining}>
              Открыть обучение
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
