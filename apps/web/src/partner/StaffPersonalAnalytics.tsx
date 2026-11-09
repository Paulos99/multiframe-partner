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
import {
  buildStaffMonthlySeries,
  buildStaffTopProjects,
} from '../../../../packages/shared/staffAnalytics';
import { formatRub } from '../../../../packages/shared/periodSummary';
import { JourneyFunnel } from './JourneyFunnel';
import { StaffMonthlyChart } from './StaffMonthlyChart';
import styles from './partner.module.css';

type StaffPerson = {
  id: string;
  displayName: string;
  login: string;
  role: UserRole;
};

type RoomLike = Record<string, unknown> & {
  id: string;
  status?: string;
  createdBy?: string;
  assignedTo?: string;
};

type ProjectLike = Record<string, unknown> & {
  id: string;
  name?: string;
  clientName?: string;
  status?: string;
};

/** Личная аналитика сотрудника: воронка роли, график по месяцам, топ проектов. */
export function StaffPersonalAnalytics({
  person,
  rooms,
  events,
  projects,
  users,
  from,
  to,
  onBack,
  onBackToOverview,
}: {
  person: StaffPerson;
  rooms: RoomLike[];
  events: Array<Record<string, unknown>>;
  projects: ProjectLike[];
  users: StaffPerson[];
  from: string | null;
  to: string | null;
  onBack: () => void;
  onBackToOverview?: () => void;
}) {
  const role = normalizeRole(person.role);

  const journey = useMemo(() => {
    if (role === 'measurer') {
      return computeMeasurerJourney({ rooms, events, userId: person.id, from, to });
    }
    if (role === 'crew') {
      return computeCrewJourney({ rooms, userId: person.id, from, to });
    }
    return computeClientJourney({ rooms, events, users, from, to, userId: person.id });
  }, [role, rooms, events, users, from, to, person.id]);

  const monthly = useMemo(
    () => buildStaffMonthlySeries({ rooms, userId: person.id, from, to }),
    [rooms, person.id, from, to],
  );

  const topProjects = useMemo(
    () => buildStaffTopProjects({ rooms, projects, userId: person.id, from, to, limit: 7 }),
    [rooms, projects, person.id, from, to],
  );

  const funnelTitle =
    role === 'measurer'
      ? 'Воронка замерщика'
      : role === 'crew'
        ? 'Воронка монтажника'
        : 'Воронка менеджера';

  const showSalesBlocks = role === 'sales' || role === 'owner';

  return (
    <div className={styles.staffPersonal} data-staff-personal={person.id}>
      <div className={styles.dashHead}>
        <div>
          <div className={styles.staffNavRow}>
            {onBackToOverview ? (
              <button type="button" className={styles.staffBackPrimary} onClick={onBackToOverview}>
                ← Общая аналитика
              </button>
            ) : null}
            <button type="button" className={styles.ghost} onClick={onBack}>
              ← К списку сотрудников
            </button>
          </div>
          <nav className={styles.staffCrumb} aria-label="Путь">
            <button type="button" className={styles.staffCrumbLink} onClick={onBackToOverview || onBack}>
              Аналитика
            </button>
            <span aria-hidden="true">/</span>
            <button type="button" className={styles.staffCrumbLink} onClick={onBack}>
              Сотрудники
            </button>
            <span aria-hidden="true">/</span>
            <span className={styles.staffCrumbCurrent}>{person.displayName || person.login}</span>
          </nav>
          <h3 className={styles.dashSub}>
            {person.displayName || person.login}
            <span className={styles.hint}> · {ROLE_LABELS[role] || role}</span>
          </h3>
        </div>
      </div>

      <JourneyFunnel
        title={funnelTitle}
        steps={journey.steps}
        hint="Для менеджера — шесть этапов пути клиента. Процент от предыдущего. «Отказ» — от закрытых."
      />

      {showSalesBlocks ? (
        <>
          <StaffMonthlyChart series={monthly} title="По месяцам" />

          <h3 className={styles.dashSub}>Топ-7 проектов за период</h3>
          {topProjects.length ? (
            <ol className={styles.staffTopList} data-staff-top-projects>
              {topProjects.map((row) => (
                <li key={row.id} data-staff-top-project={row.id}>
                  <div className={styles.staffTopCard}>
                    <div className={styles.staffTopMain}>
                      <strong>{row.name}</strong>
                      <span className={styles.hint}>
                        {[row.clientName, row.stage].filter(Boolean).join(' · ')}
                      </span>
                    </div>
                    <div className={styles.staffTopNums}>
                      <strong>
                        {row.quoteSum > 0
                          ? formatRub(row.quoteSum)
                          : row.rooms > 0
                            ? `${row.rooms} комн.`
                            : `${row.area} м²`}
                      </strong>
                      {row.quoteSum > 0 ? (
                        <span className={styles.hint}>
                          {row.rooms} комн. · {row.area} м²
                        </span>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className={styles.lead} data-staff-top-empty>
              За период нет проектов этого сотрудника
            </p>
          )}
        </>
      ) : null}
    </div>
  );
}
