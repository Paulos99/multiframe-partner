import {
  JOB_OBJECT_STATUS_LABELS,
  canCreateObjects,
  type JobObject,
  type UserRole,
} from '../../../../packages/shared/partner';
import { usePartner } from './PartnerContext';
import styles from './partner.module.css';

const NEXT_RANK: Record<JobObject['status'], number> = {
  measured: 0,
  draft: 1,
  quote_sent: 2,
  install: 3,
  closed: 4,
};

function greeting(name: string): string {
  const hour = new Date().getHours();
  const hello = hour < 12 ? 'Доброе утро' : hour < 18 ? 'Добрый день' : 'Добрый вечер';
  const first = name.trim().split(/\s+/)[0] || name;
  return `${hello}, ${first}`;
}

function roomTitle(room: JobObject): string {
  return room.roomName || room.clientName || 'Комната';
}

function roomMeta(room: JobObject): string {
  const place = [room.clientName, room.address].filter(Boolean).join(' · ');
  const area = room.room.areaM2 != null ? `${room.room.areaM2} м²` : '';
  return [JOB_OBJECT_STATUS_LABELS[room.status], place, area].filter(Boolean).join(' · ');
}

function nearest(rooms: JobObject[], role: UserRole): JobObject[] {
  const list =
    role === 'crew' ? rooms.filter((room) => room.status === 'install' || room.status === 'measured') : rooms;
  return [...list]
    .filter((room) => room.status !== 'closed')
    .sort((a, b) => NEXT_RANK[a.status] - NEXT_RANK[b.status] || b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 5);
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
  const tasks = nearest(api.objects, role);
  const first = tasks[0];
  const canCreate = canCreateObjects(role);
  const showTools = true;

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
        : 'Пока нет проектов. Создайте проект с первой комнатой — она появится на доске.';

  const partners = role === 'admin' ? api.adminListPartners() : [];

  return (
    <section className={styles.today} aria-label="Сегодня">
      <p className={styles.eyebrow}>Сегодня</p>
      <div className={styles.todayHead}>
        <div>
          <h2>{greeting(user.displayName)}</h2>
          <p className={styles.lead}>
            {role === 'admin'
              ? 'Сеть партнёров. Следующий шаг — компания, которой ещё нет в списке.'
              : role === 'crew'
                ? 'Комнаты, которые назначили вам на монтаж.'
                : role === 'measurer'
                  ? 'Комнаты, которые назначили вам на замер.'
                  : 'Ближайшие комнаты компании и один следующий шаг.'}
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
          ) : tasks.length ? (
            <ul className={styles.todayList}>
              {tasks.map((room) => (
                <li key={room.id}>
                  <button type="button" className={styles.todayTask} onClick={() => onOpenRoom?.(room.id)}>
                    <strong>{roomTitle(room)}</strong>
                    <span>{roomMeta(room)}</span>
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
