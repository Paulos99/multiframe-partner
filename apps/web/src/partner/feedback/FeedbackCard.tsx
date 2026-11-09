import type { ReactNode } from 'react';
import {
  FEEDBACK_STATUS_LABELS,
  FEEDBACK_TYPE_LABELS,
  type FeedbackItem,
} from '../../../../../packages/shared/feedback.js';
import styles from './feedback.module.css';

const ROLE_LABELS: Record<string, string> = {
  owner: 'Руководитель',
  sales: 'Менеджер',
  measurer: 'Замерщик',
  crew: 'Монтажник',
};

export function formatFeedbackDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
}

export function FeedbackStatusChip({ status }: { status: FeedbackItem['status'] }) {
  return (
    <span className={styles.status} data-status={status}>
      {FEEDBACK_STATUS_LABELS[status] || status}
    </span>
  );
}

/** Карточка обращения: у отправителя и у админа одинаковая, админ добавляет компанию, контекст и форму ответа. */
export function FeedbackCard({
  item,
  showAuthor = false,
  showContext = false,
  children,
}: {
  item: FeedbackItem;
  showAuthor?: boolean;
  showContext?: boolean;
  children?: ReactNode;
}) {
  const ctx = item.context || {};
  return (
    <article className={styles.card} data-testid="feedback-card" data-status={item.status}>
      <header className={styles.cardHead}>
        <span className={styles.type} data-type={item.type}>
          {FEEDBACK_TYPE_LABELS[item.type] || item.type}
        </span>
        <FeedbackStatusChip status={item.status} />
        <time className={styles.date} dateTime={item.createdAt}>
          {formatFeedbackDate(item.createdAt)}
        </time>
      </header>
      {showAuthor ? (
        <p className={styles.author}>
          <strong>{item.companyName || 'Компания'}</strong>
          {' · '}
          {item.authorName || item.authorLogin}
          {item.authorRole ? ` · ${ROLE_LABELS[item.authorRole] || item.authorRole}` : ''}
          {item.authorLogin ? <span className={styles.muted}> ({item.authorLogin})</span> : null}
        </p>
      ) : null}
      <p className={styles.text}>{item.text}</p>
      {item.photos?.length ? (
        <ul className={styles.thumbs} aria-label="Фото к обращению">
          {item.photos.map((photo, i) => (
            <li key={photo.id}>
              <a href={photo.url || photo.thumbUrl} target="_blank" rel="noopener noreferrer" title="Открыть фото полностью">
                <img src={photo.thumbUrl || photo.url} alt={`Фото ${i + 1}`} loading="lazy" />
              </a>
            </li>
          ))}
        </ul>
      ) : null}
      {showContext ? (
        <dl className={styles.context}>
          {ctx.pageTitle || ctx.page ? (
            <div>
              <dt>Где</dt>
              <dd>
                {ctx.pageTitle || '—'}
                {ctx.page ? <span className={styles.muted}> · {ctx.page}</span> : null}
              </dd>
            </div>
          ) : null}
          {ctx.device ? (
            <div>
              <dt>Устройство</dt>
              <dd title={ctx.device}>{ctx.device.split(' — ')[0]}</dd>
            </div>
          ) : null}
          {ctx.screen ? (
            <div>
              <dt>Экран</dt>
              <dd>{ctx.screen}</dd>
            </div>
          ) : null}
          {ctx.appVersion ? (
            <div>
              <dt>Версия</dt>
              <dd>{ctx.appVersion}</dd>
            </div>
          ) : null}
          {ctx.online === false ? (
            <div>
              <dt>Связь</dt>
              <dd>не было интернета</dd>
            </div>
          ) : null}
        </dl>
      ) : null}
      {item.reply ? (
        <div className={styles.reply} data-testid="feedback-reply">
          <p className={styles.replyHead}>
            Ответ StP{item.replyAuthorName ? ` · ${item.replyAuthorName}` : ''}
            {item.repliedAt ? <span className={styles.muted}> · {formatFeedbackDate(item.repliedAt)}</span> : null}
          </p>
          <p className={styles.text}>{item.reply}</p>
        </div>
      ) : null}
      {children}
    </article>
  );
}
