import type { Deal } from '../../../../../packages/shared/deal';
import type { CommercialProject } from './demoBook';
import { outcomeLabel, stageLabel } from './labels';
import styles from '../Projects.module.css';

export function DealIndex({
  projects,
  deals,
  onOpen,
}: {
  projects: CommercialProject[];
  deals: Deal[];
  onOpen: (projectId: string) => void;
}) {
  if (!projects.length) {
    return <p className={styles.empty}>Проектов пока нет. Сделка открывается внутри проекта.</p>;
  }
  return (
    <div className={styles.grid}>
      {projects.map((project) => {
        const own = deals.filter((deal) => deal.projectId === project.id);
        const active = own.find((deal) => !deal.closedAt) || null;
        const closed = own.find((deal) => deal.closedAt);
        const caption = active
          ? `${stageLabel(active.stage)} · ${outcomeLabel(active.outcome)}`
          : closed
            ? outcomeLabel(closed.outcome)
            : 'Сделка ещё не открыта';
        return (
          <button type="button" className={styles.project} key={project.id} onClick={() => onOpen(project.id)}>
            <span className={styles.caption}>{caption}</span>
            <strong>{project.name}</strong>
            <span className={styles.muted}>{project.place}</span>
            <span className={styles.link}>Открыть сделку</span>
          </button>
        );
      })}
    </div>
  );
}
