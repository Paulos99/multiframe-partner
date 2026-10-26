import { useState } from 'react';
import { Button } from '../../ui/Button';
import styles from '../partner.module.css';

/**
 * Копирование текста КП не меняет статус.
 * Подтверждение отправки — отдельное явное действие.
 */
export function QuoteActions({
  lifecycle,
  onCopyText,
  onConfirmSent,
  busy = false,
}: {
  lifecycle: string;
  onCopyText: () => void | Promise<void>;
  onConfirmSent: (comment: string) => void | Promise<void>;
  busy?: boolean;
}) {
  const [comment, setComment] = useState('');
  const sent = lifecycle === 'quote_sent_confirmed';
  const statusLabel: Record<string, string> = {
    quote_created: 'Сформировано',
    quote_shared: 'Текст передан, отправка не подтверждена',
    quote_sent_confirmed: 'Отправка подтверждена',
    quote_accepted: 'Клиент согласился',
    quote_declined: 'Клиент отказался',
    quote_postponed: 'Решение отложено',
  };

  return (
    <div className={styles.hintCard}>
      <h2>Коммерческое предложение</h2>
      <p className={styles.lead}>
        Статус: <strong>{statusLabel[lifecycle] || 'Готовится'}</strong>
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
        <Button type="button" variant="ghost" disabled={busy} onClick={() => void onCopyText()}>
          Скопировать текст
        </Button>
        {!sent ? (
          <Button type="button" disabled={busy} onClick={() => void onConfirmSent(comment)}>
            Подтвердить отправку
          </Button>
        ) : null}
      </div>
      {!sent ? (
        <input
          className={styles.field}
          placeholder="Комментарий к отправке (необязательно)"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
      ) : null}
    </div>
  );
}
