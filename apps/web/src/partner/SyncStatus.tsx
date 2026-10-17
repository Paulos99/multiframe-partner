import { usePartner } from './PartnerContext';
import styles from './partner.module.css';

export function SyncStatus() {
  const api = usePartner();
  const pending = api.pendingSyncCount;
  let label = 'Синхронизировано';
  let tone = styles.syncOk;
  if (api.syncStatus === 'offline') {
    label = pending > 0 ? `Офлайн · Не выгружено ${pending}` : 'Офлайн';
    tone = styles.syncOff;
  } else if (api.syncStatus === 'pending' || pending > 0) {
    label = `Не выгружено ${pending}`;
    tone = styles.syncWait;
  }
  const hint = api.authHold
    ? 'Сессия истекла. Очередь на устройстве сохранена и уйдёт на сервер после входа.'
    : api.syncStatus === 'offline'
      ? 'Нет сети. Замеры и расчёты на этом устройстве.'
      : 'Очередь выгружается сама, когда появляется сеть.';
  return (
    <span className={`${styles.syncBadge} ${tone}`} role="status" aria-live="polite" title={hint}>
      {label}
    </span>
  );
}
