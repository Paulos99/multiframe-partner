import { INSUFFICIENT_OBSERVATIONS_LABEL } from '../../../../../packages/shared/events';
import styles from '../partner.module.css';
import type { DiagnosticSignal, SignalConfidence } from './diagnose';

const CONFIDENCE_LABELS: Record<SignalConfidence, string> = {
  low: 'низкая',
  medium: 'средняя',
  high: 'высокая',
};

/** Показываем только агрегаты: никаких имён, телефонов и адресов клиентов. */
export function SignalsList({
  signals,
  title = 'Сигналы',
  empty = 'Явных проблем в воронке не видно.',
}: {
  signals: readonly DiagnosticSignal[];
  title?: string;
  empty?: string;
}) {
  return (
    <section className={styles.hintCard} aria-label={title}>
      <h3 className={styles.dashSub}>{title}</h3>
      {signals.length === 0 ? (
        <p className={styles.lead}>{empty}</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
          {signals.map((s) => {
            const weak = s.label.includes(INSUFFICIENT_OBSERVATIONS_LABEL);
            return (
              <li
                key={s.id}
                data-signal-kind={s.kind}
                style={{
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1px solid var(--border, #d8d8d8)',
                  opacity: weak ? 0.75 : 1,
                }}
              >
                <strong style={{ display: 'block' }}>{s.label}</strong>
                <span className={styles.lead} style={{ display: 'block' }}>
                  Гипотеза: {s.hypothesis}
                </span>
                <span className={styles.hint}>
                  Уверенность: {CONFIDENCE_LABELS[s.confidence]} · наблюдений: {s.sampleSize}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
