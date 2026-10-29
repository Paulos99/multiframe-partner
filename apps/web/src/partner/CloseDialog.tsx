import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { REFUSAL_COMMENT_MAX, REFUSAL_OTHER_KEY, REFUSAL_REASONS } from '../../../../packages/shared/refusal.js';
import { closeChoiceError } from './closeOutcome';
import { Button } from '../ui/Button';
import styles from './CloseDialog.module.css';

export type CloseChoice = { reasonKey: string; comment: string } | null;
export { closeChoiceError };

/**
 * Закрытие проекта или комнаты: «Завершён» (монтаж выполнен) или «Отказ» (клиент отказался).
 * Отказ без причины не отправляется. Небольшое окно по центру, не боковая панель.
 */
export function CloseDialog({
  subject,
  name,
  onConfirm,
  onCancel,
}: {
  subject: 'room' | 'project';
  name: string;
  /** null — «Завершён»; объект — «Отказ» с причиной. */
  onConfirm: (choice: CloseChoice) => void | Promise<void>;
  onCancel: () => void;
}) {
  const titleId = useId();
  const [outcome, setOutcome] = useState<'completed' | 'refused'>('completed');
  const [reasonKey, setReasonKey] = useState('');
  const [comment, setComment] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => {
    first.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onCancel]);

  const error = closeChoiceError(outcome, reasonKey, comment);
  const word = subject === 'project' ? 'проект' : 'комнату';

  async function submit() {
    setTouched(true);
    if (error) return;
    setBusy(true);
    try {
      await onConfirm(outcome === 'refused' ? { reasonKey, comment: comment.trim() } : null);
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div className={styles.backdrop} role="presentation" onClick={() => !busy && onCancel()}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-close-dialog
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id={titleId}>Закрыть {word}</h2>
        <p className={styles.lead}>«{name}». Выберите, чем закончилась работа.</p>
        <fieldset className={styles.choices}>
          <legend className={styles.srOnly}>Итог</legend>
          <label className={styles.choice} data-checked={outcome === 'completed' || undefined}>
            <input
              ref={first}
              type="radio"
              name="close-outcome"
              checked={outcome === 'completed'}
              onChange={() => setOutcome('completed')}
            />
            <span>
              <strong>Завершён</strong>
              <small>Монтаж выполнен, работа сдана.</small>
            </span>
          </label>
          <label className={styles.choice} data-checked={outcome === 'refused' || undefined} data-refusal>
            <input
              type="radio"
              name="close-outcome"
              checked={outcome === 'refused'}
              onChange={() => setOutcome('refused')}
            />
            <span>
              <strong>Отказ</strong>
              <small>Клиент отказался. Нужна причина, она попадёт в аналитику.</small>
            </span>
          </label>
        </fieldset>
        {outcome === 'refused' ? (
          <div className={styles.reason}>
            <label>
              Причина отказа
              <select value={reasonKey} onChange={(event) => setReasonKey(event.target.value)} aria-required="true">
                <option value="">Выберите причину</option>
                {REFUSAL_REASONS.map((reason) => (
                  <option key={reason.key} value={reason.key}>
                    {reason.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Комментарий{reasonKey === REFUSAL_OTHER_KEY ? '' : ' (необязательно)'}
              <textarea
                value={comment}
                maxLength={REFUSAL_COMMENT_MAX}
                rows={3}
                onChange={(event) => setComment(event.target.value)}
              />
            </label>
          </div>
        ) : null}
        {touched && error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
        <div className={styles.actions}>
          <button type="button" className={styles.cancel} disabled={busy} onClick={onCancel}>
            Отмена
          </button>
          <Button loading={busy} onClick={() => void submit()}>
            {outcome === 'refused' ? 'Закрыть с отказом' : 'Закрыть как завершённый'}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
