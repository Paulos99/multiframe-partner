import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { JOB_OBJECT_STATUS_LABELS, type JobObjectStatus } from '../../../../packages/shared/partner';
import { usePartner } from './PartnerContext';
import { canChangeRoomStage } from '../../../../packages/shared/roomStage.js';
import { lastSyncLine, pendingSummary, syncBanner, syncLabel, syncState, type SyncState } from './offlineQueue';
import styles from './partner.module.css';
import sync from './SyncStatus.module.css';

function hintFor(state: SyncState, authHold: boolean, summary: string): string {
  if (authHold) return 'Вход истёк. Всё снятое сохранено на телефоне и уйдёт на сервер после входа.';
  if (state === 'offline') {
    return summary
      ? `На телефоне: ${summary}. Уйдёт само, когда появится связь.`
      : 'Можно работать дальше: замеры, заметки и фото сохраняются на телефоне.';
  }
  if (state === 'pending') return `Отправляем: ${summary}. Если связь слабая, повторим сами.`;
  return 'Всё, что снято на телефоне, уже на сервере.';
}

const dotClass: Record<SyncState, string> = {
  offline: styles.syncDotOff!,
  pending: styles.syncDotWait!,
  done: styles.syncDotOk!,
};
const toneClass: Record<SyncState, string> = {
  offline: styles.syncOff!,
  pending: styles.syncWait!,
  done: styles.syncOk!,
};

/** Индикатор в шапке: «Нет связи», «Ждёт отправки: N», «Всё отправлено». */
export function SyncStatus({ compact = false }: { compact?: boolean }) {
  const api = usePartner();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const pending = api.pendingSyncCount;
  const state = syncState(api.online, pending);
  const label = syncLabel(state, pending);
  const summary = pendingSummary(api.pendingCounts);
  const hint = hintFor(state, api.authHold, summary);
  const sendNow = async () => {
    setBusy(true);
    try {
      await api.syncNow();
    } finally {
      setBusy(false);
    }
  };
  if (compact) {
    return (
      <span className={styles.syncDotWrap} data-sync-state={state}>
        <button
          type="button"
          className={styles.syncDotBtn}
          aria-label={label}
          title={`${label}. ${hint}`}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          data-testid="sync-status"
        >
          <span className={`${styles.syncDot} ${dotClass[state]}`} aria-hidden />
        </button>
        {open ? (
          <span className={styles.syncPop} role="status">
            <strong>{label}</strong>
            <span>{hint}</span>
            {api.remote ? <span className={sync.when}>{lastSyncLine(api.lastSyncAt, Date.now())}</span> : null}
            {pending > 0 && api.online ? (
              <button type="button" className={sync.sendBtn} disabled={busy} onClick={() => void sendNow()}>
                {busy ? 'Отправляем…' : 'Отправить сейчас'}
              </button>
            ) : null}
          </span>
        ) : null}
      </span>
    );
  }
  return (
    <span className={`${styles.syncBadge} ${toneClass[state]}`} role="status" aria-live="polite" title={hint}>
      {label}
    </span>
  );
}

/**
 * Полоса-напоминание над содержимым кабинета: ждут отправки 2 и больше объектов или больше суток не
 * было связи с сервером.
 */
export function SyncBanner() {
  const api = usePartner();
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  if (!api.user || !api.remote || api.user.role === 'admin') return null;
  const banner = syncBanner({
    pending: api.pendingSyncCount,
    lastSyncAt: api.lastSyncAt,
    now: Math.max(now, Date.now()),
    online: api.online,
  });
  if (!banner) return null;
  const summary = pendingSummary(api.pendingCounts);
  return (
    <div className={sync.banner} role="alert" data-testid="sync-banner">
      <p>
        <strong>{banner.text}</strong>
        {summary ? <span> На телефоне: {summary}.</span> : null}
      </p>
      {api.online && api.pendingSyncCount > 0 ? (
        <button
          type="button"
          className={styles.ghost}
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void api.syncNow().finally(() => setBusy(false));
          }}
        >
          {busy ? 'Отправляем…' : 'Отправить сейчас'}
        </button>
      ) : null}
    </div>
  );
}

const stageName = (status: string) => JOB_OBJECT_STATUS_LABELS[status as JobObjectStatus] || status;

/** Конфликт этапа: пока человек был без связи, этап комнаты изменили. Выбирает он сам. */
export function StageConflictDialog() {
  const api = usePartner();
  const [busy, setBusy] = useState(false);
  const conflict = api.stageConflicts[0];
  if (!conflict) return null;
  // Замерщик не может вернуть свой этап поверх этапа менеджера: остаётся только этап сервера.
  const canKeepMine = canChangeRoomStage(api.user?.role, conflict.serverStatus, conflict.myStatus);
  const choose = async (choice: 'mine' | 'server') => {
    setBusy(true);
    try {
      await api.resolveStageConflict(conflict.objectId, choice);
    } finally {
      setBusy(false);
    }
  };
  return createPortal(
    <div className={styles.modalBackdrop}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-label="Этап комнаты изменили" data-testid="stage-conflict">
        <h3>Этап комнаты «{conflict.roomName}» изменили</h3>
        <p className={sync.conflictText}>
          Пока вы были без связи, на сервере этап стал «{stageName(conflict.serverStatus)}», а вы поставили «
          {stageName(conflict.myStatus)}».{' '}
          {canKeepMine
            ? 'Какой оставить? Остальные ваши правки (площадь, ответы) сохранятся в любом случае.'
            : 'Этот этап поставил менеджер, свой поверх него поставить нельзя. Остальные ваши правки (площадь, ответы) сохранятся.'}
        </p>
        <div className={sync.conflictBtns}>
          {canKeepMine ? (
            <button type="button" className={styles.primary} disabled={busy} onClick={() => void choose('mine')}>
              Оставить мой: «{stageName(conflict.myStatus)}»
            </button>
          ) : null}
          <button
            type="button"
            className={canKeepMine ? styles.ghost : styles.primary}
            disabled={busy}
            onClick={() => void choose('server')}
          >
            Оставить «{stageName(conflict.serverStatus)}»
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
