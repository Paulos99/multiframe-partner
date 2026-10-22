import { useState } from 'react';
import {
  DEAL_OUTCOME_LABELS,
  LOSS_REASON_LABELS,
  type DealOutcome,
  type LossReason,
} from '../../../../../packages/shared/deal';
import { Button } from '../../ui/Button';
import styles from '../partner.module.css';

const OUTCOMES = (Object.keys(DEAL_OUTCOME_LABELS) as Exclude<DealOutcome, null>[]);
const REASONS = (Object.keys(LOSS_REASON_LABELS) as Exclude<LossReason, null>[]);

export function DealOutcomeForm({
  onSubmit,
  busy = false,
}: {
  onSubmit: (input: {
    outcome: Exclude<DealOutcome, null>;
    lossReason: LossReason;
    lossComment: string | null;
  }) => void | Promise<void>;
  busy?: boolean;
}) {
  const [outcome, setOutcome] = useState<Exclude<DealOutcome, null> | ''>('');
  const [lossReason, setLossReason] = useState<Exclude<LossReason, null>>('unknown');
  const [comment, setComment] = useState('');

  return (
    <form
      className={styles.hintCard}
      onSubmit={(e) => {
        e.preventDefault();
        if (!outcome) return;
        void onSubmit({
          outcome,
          lossReason: outcome === 'declined' ? lossReason : null,
          lossComment: outcome === 'declined' && comment.trim() ? comment.trim() : null,
        });
      }}
    >
      <h2>Результат по клиенту</h2>
      <p className={styles.lead}>Один обязательный итог. Причину отказа — коротко, можно пропустить.</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        {OUTCOMES.map((value) => (
          <button
            key={value}
            type="button"
            className={outcome === value ? styles.primaryBtn : styles.ghostBtn}
            onClick={() => setOutcome(value)}
          >
            {DEAL_OUTCOME_LABELS[value]}
          </button>
        ))}
      </div>
      {outcome === 'declined' ? (
        <label className={styles.field} style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
          <span>Причина отказа</span>
          <select
            value={lossReason}
            onChange={(e) => setLossReason(e.target.value as Exclude<LossReason, null>)}
          >
            {REASONS.map((r) => (
              <option key={r} value={r}>
                {LOSS_REASON_LABELS[r]}
              </option>
            ))}
          </select>
          <textarea
            rows={2}
            placeholder="Комментарий (необязательно)"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
        </label>
      ) : null}
      <Button type="submit" disabled={!outcome || busy}>
        Сохранить итог
      </Button>
    </form>
  );
}
