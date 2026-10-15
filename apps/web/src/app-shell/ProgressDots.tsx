import styles from './ProgressDots.module.css';
import { useSession } from '../state/SessionContext';
import { WIZARD_STEPS, type WizardStep } from '../state/types';
import { stepIndex } from '../state/session';

const LABELS: Record<WizardStep, string> = {
  start: 'Старт',
  room: 'Объект',
  processing: 'Расчёт',
  result: 'Итог',
};

export function ProgressDots() {
  const { session } = useSession();
  const current = stepIndex(session.step);

  return (
    <nav className={styles.wrap} aria-label="Прогресс">
      <ol className={styles.list}>
        {WIZARD_STEPS.map((step, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li
              key={step}
              className={`${styles.item} ${done ? styles.done : ''} ${active ? styles.active : ''}`}
              aria-current={active ? 'step' : undefined}
            >
              <span className={styles.dot} />
              <span className={styles.label}>{LABELS[step]}</span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
