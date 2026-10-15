import { Screen } from '../../ui/Screen';
import { SimCompare } from '../../ui/SimCompare';
import { useSession } from '../../state/SessionContext';
import { DISCLAIMER_SIMULATION, HYBRID_CLASS_LABELS } from '../../state/types';
import { deriveSimulation } from '../../state/simulation';
import styles from './BeforeAfterScreen.module.css';

export function BeforeAfterScreen() {
  const { session } = useSession();
  const sim = session.derived?.simulation ?? deriveSimulation(session.answers);
  const beforeClass = HYBRID_CLASS_LABELS[sim.before.classLabel];
  const afterClass = HYBRID_CLASS_LABELS[sim.after.classLabel];

  return (
    <Screen
      title="До и после"
      subtitle="Как меняется комфорт комнаты с MultiFrame"
    >
      <p className={styles.verdict} role="status">
        Сейчас: {beforeClass} → с MultiFrame: {afterClass}
      </p>

      <div className={styles.dual}>
        <article className={`${styles.card} ${styles.before}`}>
          <span className={styles.tag}>Сейчас типично</span>
          <h2>Обычный потолок</h2>
          <ul>
            <li>Соседи сверху слышны слишком отчётливо</li>
            <li>Бытовые звуки сверху легко различить</li>
            <li>Сейчас: {beforeClass}</li>
          </ul>
        </article>

        <article className={`${styles.card} ${styles.after}`}>
          <span className={styles.tag}>С MultiFrame</span>
          <h2>Бескаркасная акустика</h2>
          <ul>
            <li>В комнате заметно спокойнее</li>
            <li>Ударный и воздушный шум воспринимаются мягче</li>
            <li>С MultiFrame: {afterClass}</li>
          </ul>
        </article>
      </div>

      <div className={styles.simSecondary}>
        <p className={styles.simLead}>Оценка в цифрах</p>
        <SimCompare sim={sim} tone="secondary" />
      </div>

      {DISCLAIMER_SIMULATION ? (
        <div className={styles.note}>
          <p>{DISCLAIMER_SIMULATION}</p>
        </div>
      ) : null}
    </Screen>
  );
}
