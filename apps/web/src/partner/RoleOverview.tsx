import { useSyncExternalStore } from 'react';
import { usePartner } from './PartnerContext';
import { ObjectsPanel } from './ObjectsPanel';
import { PeriodCalendar } from './PeriodCalendar';
import { getAnalyticsPeriod, setAnalyticsPeriod, subscribeAnalyticsPeriod } from './analytics';
import styles from './RoleOverview.module.css';

export function NetworkOverview() {
  const period = useSyncExternalStore(subscribeAnalyticsPeriod, getAnalyticsPeriod, getAnalyticsPeriod);
  return (
    <section className={styles.board} aria-label="Управление партнёрской сетью">
      <div className={styles.period}>
        <PeriodCalendar fromYmd={period.fromYmd} toYmd={period.toYmd}
          onChange={setAnalyticsPeriod} triggerClassName={styles.periodTrigger} />
      </div>
    </section>
  );
}

export function RoleWorkspace({ compact, onCreate }: { compact?: boolean; onCreate?: () => void }) {
  const { user } = usePartner();
  if (!user) return null;
  return <ObjectsPanel compact={compact} onCreate={onCreate} />;
}
