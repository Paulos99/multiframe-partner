import { useState } from 'react';
import { usePartner } from './PartnerContext';
import { resolveSyncUi } from './commercial/syncLabels';
import styles from './partner.module.css';

export function SyncStatus({ compact = false }: { compact?: boolean }) {
  const api = usePartner();
  const [open, setOpen] = useState(false);
  const { label, hint, kind } = resolveSyncUi({
    online: api.online,
    pending: api.pendingSyncCount,
    authHold: api.authHold,
  });
  const dot =
    kind === 'offline' || kind === 'saved_local'
      ? styles.syncDotOff
      : kind === 'uploading' || kind === 'retry'
        ? styles.syncDotWait
        : styles.syncDotOk;
  const tone =
    kind === 'offline' || kind === 'saved_local'
      ? styles.syncOff
      : kind === 'uploading' || kind === 'retry'
        ? styles.syncWait
        : styles.syncOk;

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
