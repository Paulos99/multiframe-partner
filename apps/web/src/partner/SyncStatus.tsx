import { useState } from 'react';
import { usePartner } from './PartnerContext';
import styles from './partner.module.css';

function syncCopy(status: string, pending: number, authHold: boolean) {
  let label = 'Синхронизировано';
  if (status === 'offline') {
    label = pending > 0 ? `Офлайн · Не выгружено ${pending}` : 'Офлайн';
  } else if (status === 'pending' || pending > 0) {
    label = `Не выгружено ${pending}`;
  }
  const hint = authHold
    ? 'Сессия истекла. Очередь на устройстве сохранена и уйдёт на сервер после входа.'
    : status === 'offline'
      ? 'Нет сети. Замеры и расчёты на этом устройстве.'
      : 'Очередь выгружается сама, когда появляется сеть.';
  const dot =
    status === 'offline' ? styles.syncDotOff : status === 'pending' || pending > 0 ? styles.syncDotWait : styles.syncDotOk;
  const tone = status === 'offline' ? styles.syncOff : status === 'pending' || pending > 0 ? styles.syncWait : styles.syncOk;
  return { label, hint, dot, tone };
}

export function SyncStatus({ compact = false }: { compact?: boolean }) {
  const api = usePartner();
  const [open, setOpen] = useState(false);
  const { label, hint, dot, tone } = syncCopy(api.syncStatus, api.pendingSyncCount, api.authHold);
  if (compact) {
    return (
      <span className={styles.syncDotWrap}>
        <button
          type="button"
          className={styles.syncDotBtn}
          aria-label={label}
          title={`${label}. ${hint}`}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span className={`${styles.syncDot} ${dot}`} aria-hidden />
        </button>
        {open ? (
          <span className={styles.syncPop} role="status">
            <strong>{label}</strong>
            <span>{hint}</span>
          </span>
        ) : null}
      </span>
    );
  }
  return (
    <span className={`${styles.syncBadge} ${tone}`} role="status" aria-live="polite" title={hint}>
      {label}
    </span>
  );
}
