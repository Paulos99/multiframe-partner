import { useCallback, useEffect, useState } from 'react';
import {
  FEEDBACK_REPLY_MAX,
  FEEDBACK_STATUS_LABELS,
  FEEDBACK_STATUSES,
  FEEDBACK_TYPE_LABELS,
  FEEDBACK_TYPES,
  type FeedbackItem,
  type FeedbackStatus,
} from '../../../../../packages/shared/feedback.js';
import { Button } from '../../ui/Button';
import { apiFeedbackSummary, apiListFeedback, apiUpdateFeedback, hasRemoteApi, type FeedbackListFilter } from '../apiClient';
import { loadToken } from '../localStore';
import { FeedbackCard } from './FeedbackCard';
import styles from './feedback.module.css';

/** Ответ админа на одно обращение: статус и комментарий, который увидит отправитель. */
function AdminReply({ item, onSaved }: { item: FeedbackItem; onSaved: (next: FeedbackItem) => void }) {
  const [status, setStatus] = useState<FeedbackStatus>(item.status);
  const [reply, setReply] = useState(item.reply || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const dirty = status !== item.status || reply.trim() !== (item.reply || '');

  async function save() {
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      const next = await apiUpdateFeedback(item.id, { status, reply: reply.trim() });
      onSaved(next);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.adminReply}>
      <label>
        Статус
        <select aria-label="Статус обращения" value={status} onChange={(e) => setStatus(e.target.value as FeedbackStatus)} disabled={busy}>
          {(FEEDBACK_STATUSES as FeedbackStatus[]).map((s) => (
            <option key={s} value={s}>
              {FEEDBACK_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </label>
      <label className={styles.replyLabel}>
        Ответ отправителю
        <textarea
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          rows={2}
          maxLength={FEEDBACK_REPLY_MAX}
          disabled={busy}
          placeholder="Что сделали или когда исправим"
        />
      </label>
      <div className={styles.replyActions}>
        <Button variant="secondary" onClick={() => void save()} loading={busy} success={saved && !dirty} disabled={!dirty}>
          Сохранить
        </Button>
        {error ? (
          <span className={styles.error} role="alert">
            {error}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** Раздел админа StP «Обратная связь»: все обращения партнёров с фильтрами, статусом и ответом. */
export function FeedbackAdminPanel({ onNewCount }: { onNewCount?: (count: number) => void }) {
  const connected = hasRemoteApi() && Boolean(loadToken());
  const [filter, setFilter] = useState<FeedbackListFilter>({});
  const [items, setItems] = useState<FeedbackItem[] | null>(null);
  const [partners, setPartners] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState('');

  const load = useCallback(
    (signal?: AbortSignal) => {
      setError('');
      return apiListFeedback(filter, signal)
        .then((data) => {
          setItems(data.items);
          setPartners(data.partners || []);
          if (typeof data.newCount === 'number') onNewCount?.(data.newCount);
        })
        .catch((e) => {
          if (!signal?.aborted) setError(e instanceof Error ? e.message : 'Не удалось загрузить обращения');
        });
    },
    [filter, onNewCount],
  );

  useEffect(() => {
    if (!connected) return;
    const ctrl = new AbortController();
    void load(ctrl.signal);
    return () => ctrl.abort();
  }, [connected, load]);

  const set = (key: keyof FeedbackListFilter) => (value: string) =>
    setFilter((prev) => ({ ...prev, [key]: value || undefined }));

  if (!connected) {
    return (
      <section className={styles.panel} aria-label="Обратная связь">
        <h2>Обратная связь</h2>
        <p className={styles.notice}>Обращения партнёров хранятся на сервере. В демо без сервера раздел пуст.</p>
      </section>
    );
  }

  return (
    <section className={styles.panel} aria-label="Обратная связь">
      <div className={styles.panelHead}>
        <div>
          <h2>Обратная связь</h2>
          <p className={styles.muted}>Ошибки, предложения и вопросы от партнёров. Ответ увидит сотрудник, который написал.</p>
        </div>
        <Button variant="ghost" onClick={() => void load()}>
          Обновить
        </Button>
      </div>
      <div className={styles.filters}>
        <label>
          Статус
          <select aria-label="Статус" value={filter.status || ''} onChange={(e) => set('status')(e.target.value)}>
            <option value="">Все</option>
            {(FEEDBACK_STATUSES as FeedbackStatus[]).map((s) => (
              <option key={s} value={s}>
                {FEEDBACK_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Тип
          <select aria-label="Тип" value={filter.type || ''} onChange={(e) => set('type')(e.target.value)}>
            <option value="">Все</option>
            {(FEEDBACK_TYPES as FeedbackItem['type'][]).map((t) => (
              <option key={t} value={t}>
                {FEEDBACK_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Партнёр
          <select aria-label="Партнёр" value={filter.orgId || ''} onChange={(e) => set('orgId')(e.target.value)}>
            <option value="">Все</option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error ? <p className={styles.error}>{error}</p> : null}
      {items === null && !error ? <p className={styles.muted}>Загружаем…</p> : null}
      {items && items.length === 0 ? <p className={styles.muted}>Обращений с такими условиями нет.</p> : null}
      <div className={styles.list}>
        {items?.map((item) => (
          <FeedbackCard key={item.id} item={item} showAuthor showContext>
            <AdminReply
              item={item}
              onSaved={(next) => {
                setItems((prev) => prev?.map((x) => (x.id === next.id ? next : x)) || null);
                void apiFeedbackSummary()
                  .then((d) => onNewCount?.(d.newCount))
                  .catch(() => {});
              }}
            />
          </FeedbackCard>
        ))}
      </div>
    </section>
  );
}
