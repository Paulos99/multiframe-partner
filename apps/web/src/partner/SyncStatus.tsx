import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { JOB_OBJECT_STATUS_LABELS, type JobObjectStatus } from '../../../../packages/shared/partner';
import { usePartner } from './PartnerContext';
import { canChangeRoomStage } from '../../../../packages/shared/roomStage.js';
import { peekObjectDocumentQueue } from './localStore';
import {
  devicePlace,
  lastSyncLine,
  pendingSummary,
  syncBanner,
  syncLabel,
  syncState,
  type SyncState,
} from './offlineQueue';
import styles from './partner.module.css';
import sync from './SyncStatus.module.css';

function hintFor(state: SyncState, authHold: boolean, summary: string, place: string): string {
  if (authHold) return `Вход истёк. Всё снятое сохранено ${place.toLowerCase()} и уйдёт на сервер после входа.`;
  if (state === 'offline') {
    return summary
      ? `${place}: ${summary}. Уйдёт само, когда появится связь.`
      : `Можно работать дальше: замеры, заметки и фото сохраняются ${place === 'На телефоне' ? 'на телефоне' : 'на этом компьютере'}.`;
  }
  if (state === 'pending') return `Отправляем: ${summary}. Если связь слабая, повторим сами.`;
  return `Всё, что снято ${place === 'На телефоне' ? 'на телефоне' : 'на этом компьютере'}, уже на сервере.`;
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
  const place = devicePlace();
  const hint = hintFor(state, api.authHold, summary, place);
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
 * было связи с сервером. При окончательной ошибке PDF — список и «Убрать из очереди».
 */
export function SyncBanner() {
  const api = usePartner();
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [failedDocs, setFailedDocs] = useState(() => peekObjectDocumentQueue().filter((doc) => doc.failed));
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    setFailedDocs(peekObjectDocumentQueue().filter((doc) => doc.failed));
  }, [api.pendingCounts.documents, api.lastSyncResult, api.pendingSyncCount]);
  if (!api.user || !api.remote || api.user.role === 'admin') return null;
  const failedCount = failedDocs.length || peekObjectDocumentQueue().filter((doc) => doc.failed).length;
  const banner = syncBanner({
    pending: api.pendingSyncCount,
    failed: failedCount,
    lastSyncAt: api.lastSyncAt,
    now: Math.max(now, Date.now()),
    online: api.online,
  });
  if (!banner) return null;
  const summary = pendingSummary(api.pendingCounts);
  const place = devicePlace();
  const groups = new Map<string, (typeof failedDocs)[number]>();
  for (const doc of failedDocs) {
    const key = `${doc.objectId}::${doc.versionId}`;
    if (!groups.has(key)) groups.set(key, doc);
  }
  return (
    <div className={sync.banner} role="alert" data-testid="sync-banner">
      <div className={sync.bannerBody}>
        {banner ? (
          <p>
            <strong>{banner.text}</strong>
            {summary ? (
              <span>
                {' '}
                {place}: {summary}.
              </span>
            ) : null}
          </p>
        ) : null}
        {api.lastSyncResult ? <p className={sync.result} data-testid="sync-result">{api.lastSyncResult}</p> : null}
        {groups.size > 0 ? (
          <ul className={sync.failList} data-testid="sync-failed-docs">
            {[...groups.values()].map((doc) => (
              <li key={`${doc.objectId}::${doc.versionId}`}>
                <span>
                  {doc.filename}
                  {doc.roomName ? ` · ${doc.roomName}` : ''}
                  {doc.lastError ? ` — ${doc.lastError}` : ''}
                </span>
                <button
                  type="button"
                  className={sync.dismissBtn}
                  onClick={() => api.dismissQueuedDocuments(doc.objectId, doc.versionId)}
                >
                  Убрать из очереди
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {api.online && api.pendingSyncCount > 0 ? (
        <button
          type="button"
          className={styles.ghost}
          disabled={busy}
          data-testid="sync-send-now"
          onClick={() => {
            setBusy(true);
            void api.syncNow().finally(() => {
              setBusy(false);
              setFailedDocs(peekObjectDocumentQueue().filter((doc) => doc.failed));
            });
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
