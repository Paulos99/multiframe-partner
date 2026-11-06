import { useMemo } from 'react';
import {
  ROLE_LABELS,
  normalizeRole,
  type UserRole,
} from '../../../../packages/shared/partner';
import {
  computeClientJourney,
  computeCrewJourney,
  computeMeasurerJourney,
} from '../../../../packages/shared/clientJourney';
import { JourneyFunnel } from './JourneyFunnel';
import styles from './partner.module.css';

type StaffPerson = {
  id: string;
  displayName: string;
  login: string;
  role: UserRole;
};

type RoomLike = {
  id: string;
  status?: string;
  createdBy?: string;
  assignedTo?: string;
  updatedAt?: string;
  createdAt?: string;
  projectId?: string;
  room?: { areaM2?: number | null } | null;
  areaM2?: number | null;
  refusal?: { reasonKey?: string; at?: string } | null;
  roomName?: string;
  clientName?: string;
};

type ProjectLike = {
  id: string;
  name?: string;
  clientName?: string;
  status?: string;
  refusal?: { reasonKey?: string } | null;
};

function areaOf(room: RoomLike): number {
  const nested = room.room && typeof room.room === 'object' ? Number(room.room.areaM2) : NaN;
  if (Number.isFinite(nested) && nested > 0) return nested;
  const flat = Number(room.areaM2);
  return Number.isFinite(flat) && flat > 0 ? flat : 0;
}

function monthKey(iso: string): string {
  const match = /^(\d{4}-\d{2})/.exec(String(iso || ''));
  return match ? match[1] : '';
}

function monthLabel(key: string): string {
  const [y, m] = key.split('-');
  if (!y || !m) return key;
  const names = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const idx = Number(m) - 1;
  return `${names[idx] || m} ${y}`;
}

/** Личная аналитика сотрудника: воронка роли, месяцы, топ закрытых проектов. */
export function StaffPersonalAnalytics({
  person,
  rooms,
  events,
  projects,
  users,
  from,
  to,
  onBack,
}: {
  person: StaffPerson;
  rooms: RoomLike[];
  events: Array<Record<string, unknown>>;
  projects: ProjectLike[];
  users: StaffPerson[];
  from: string | null;
  to: string | null;
  onBack: () => void;
}) {
  const role = normalizeRole(person.role);
  const mineRooms = useMemo(
    () =>
      rooms.filter(
        (room) =>
          String(room.createdBy || '') === person.id || String(room.assignedTo || '') === person.id,
      ),
    [rooms, person.id],
  );

  const journey = useMemo(() => {
    if (role === 'measurer') {
      return computeMeasurerJourney({ rooms, events, userId: person.id, from, to });
    }
    if (role === 'crew') {
      return computeCrewJourney({ rooms, userId: person.id, from, to });
    }
    return computeClientJourney({ rooms, events, users, from, to, userId: person.id });
  }, [role, rooms, events, users, from, to, person.id]);

  const monthly = useMemo(() => {
    const map = new Map<string, { created: number; closed: number; refused: number; area: number }>();
    for (const room of mineRooms) {
      const created = monthKey(String(room.createdAt || ''));
      if (created) {
        const row = map.get(created) || { created: 0, closed: 0, refused: 0, area: 0 };
        row.created += 1;
        map.set(created, row);
      }
      if (room.status === 'closed') {
        const closedAt = monthKey(String((room.refusal && room.refusal.at) || room.updatedAt || ''));
        if (!closedAt) continue;
        if (from && String((room.refusal && room.refusal.at) || room.updatedAt || '') < from) continue;
        if (to && String((room.refusal && room.refusal.at) || room.updatedAt || '') > to) continue;
        const row = map.get(closedAt) || { created: 0, closed: 0, refused: 0, area: 0 };
        row.closed += 1;
        if (Boolean(room.refusal && room.refusal.reasonKey)) row.refused += 1;
        else row.area += areaOf(room);
        map.set(closedAt, row);
      }
    }
    return [...map.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([key, row]) => ({ key, label: monthLabel(key), ...row }));
  }, [mineRooms, from, to]);

  const topProjects = useMemo(() => {
    const byProject = new Map<string, { name: string; area: number }>();
    for (const room of mineRooms) {
      if (room.status !== 'closed' || Boolean(room.refusal && room.refusal.reasonKey)) continue;
      const at = String((room.refusal && room.refusal.at) || room.updatedAt || '');
      if (from && at && at < from) continue;
      if (to && at && at > to) continue;
      const project = projects.find((item) => item.id === room.projectId);
      if (project && Boolean(project.refusal && project.refusal.reasonKey)) continue;
      const id = room.projectId || room.id;
      const name = project?.name || room.roomName || room.clientName || 'Проект';
      const row = byProject.get(id) || { name, area: 0 };
      row.area += areaOf(room);
      byProject.set(id, row);
    }
    return [...byProject.values()].sort((a, b) => b.area - a.area).slice(0, 5);
  }, [mineRooms, projects, from, to]);

  const funnelTitle =
    role === 'measurer'
      ? 'Воронка замерщика'
      : role === 'crew'
        ? 'Воронка монтажника'
        : 'Воронка менеджера';

  return (
    <div className={styles.staffPersonal} data-staff-personal={person.id}>
      <div className={styles.dashHead}>
        <div>
          <button type="button" className={styles.ghost} onClick={onBack}>
            ← К списку сотрудников
          </button>
          <h3 className={styles.dashSub}>
            {person.displayName || person.login}
            <span className={styles.hint}> · {ROLE_LABELS[role] || role}</span>
          </h3>
        </div>
      </div>

      <JourneyFunnel
        title={funnelTitle}
        steps={journey.steps}
        hint="Для менеджера — сжатая воронка клиента (6 этапов). % от предыдущего; «Отказ» — от закрытых."
      />

      {role === 'sales' || role === 'owner' ? (
        <>
          <h3 className={styles.dashSub}>По месяцам</h3>
          {monthly.length ? (
            <div className={styles.dashTableScroll}>
              <table className={styles.dashTable}>
                <thead>
                  <tr>
                    <th>Месяц</th>
                    <th>Новые комнаты</th>
                    <th>Закрыто</th>
                    <th>Отказы</th>
                    <th>Площадь, м²</th>
                  </tr>
                </thead>
                <tbody>
                  {monthly.map((row) => (
                    <tr key={row.key}>
                      <td data-label="Месяц">{row.label}</td>
                      <td data-label="Новые комнаты">{row.created}</td>
                      <td data-label="Закрыто">{row.closed}</td>
                      <td data-label="Отказы">{row.refused}</td>
                      <td data-label="Площадь, м²">{row.area ? String(Math.round(row.area)) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className={styles.lead}>Пока нет данных по месяцам</p>
          )}

          <h3 className={styles.dashSub}>Топ-5 закрытых проектов по площади</h3>
          {topProjects.length ? (
            <ol className={styles.todayList}>
              {topProjects.map((row) => (
                <li key={row.name + row.area}>
                  <div className={styles.todayTask} style={{ cursor: 'default' }}>
                    <strong>{row.name}</strong>
                    <span>{Math.round(row.area)} м²</span>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className={styles.lead}>Нет закрытых без отказа проектов за период</p>
          )}
        </>
      ) : null}
    </div>
  );
}
