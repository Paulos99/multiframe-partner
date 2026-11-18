import { useState } from 'react';
import { ROLE_LABELS, STAFF_ROLES, type UserRole } from '../../../../packages/shared/partner';
import { Button } from '../ui/Button';
import { usePartner } from './PartnerContext';
import { pendingStaffJoins, rejectedStaffJoins, type StaffJoinRequest } from './staffJoin';
import styles from './partner.module.css';

function when(iso?: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
}

/**
 * Заявки сотрудников, которые сами зарегистрировались и ждут подключения к компании.
 */
export function StaffJoinRequests() {
  const api = usePartner();
  const rows = api.listStaffJoins();
  const pending = pendingStaffJoins(rows);
  const rejected = rejectedStaffJoins(rows);
  const [busy, setBusy] = useState<string | null>(null);
  const [roles, setRoles] = useState<Record<string, UserRole>>({});
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showRejected, setShowRejected] = useState(false);

  if (!pending.length && !rejected.length && !notice) return null;

  async function decide(row: StaffJoinRequest, decision: 'approve' | 'reject') {
    setBusy(row.id);
    setErr(null);
    setNotice(null);
    try {
      const role = roles[row.id] || (row.role as UserRole);
      await api.decideStaffJoin(row.id, decision, {
        role: decision === 'approve' ? role : undefined,
        reason: decision === 'reject' ? reason.trim() : undefined,
      });
      setNotice(decision === 'approve' ? `«${row.displayName}» добавлен в компанию` : `Заявка «${row.displayName}» отклонена`);
      setRejecting(null);
      setReason('');
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Ошибка');
    } finally {
      setBusy(null);
    }
  }

  function item(row: StaffJoinRequest, kind: 'pending' | 'rejected') {
    const role = roles[row.id] || (STAFF_ROLES.includes(row.role as UserRole) ? (row.role as UserRole) : 'measurer');
    return (
      <li key={row.id} className={styles.requestItem} data-staff-join={row.login}>
        <div className={styles.requestWho}>
          <strong>{row.displayName}</strong>
          <span className={styles.requestMeta}>
            {ROLE_LABELS[row.role as UserRole] || row.role} · логин {row.login}
            {row.phone ? ` · ${row.phone}` : ''}
          </span>
          <span className={styles.requestMeta}>
            {kind === 'pending' ? `Заявка от ${when(row.submittedAt)}` : `Отклонена ${when(row.decidedAt)}`}
          </span>
          {kind === 'rejected' && row.reason ? <span className={styles.requestReason}>Причина: {row.reason}</span> : null}
        </div>
        <div className={styles.rowActions}>
          {kind === 'pending' ? (
            <>
              <label className={styles.field}>
                Роль
                <select
                  aria-label={`Роль для ${row.displayName}`}
                  value={role}
                  onChange={(event) => setRoles((prev) => ({ ...prev, [row.id]: event.target.value as UserRole }))}
                >
                  {STAFF_ROLES.map((item) => (
                    <option key={item} value={item}>
                      {ROLE_LABELS[item]}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                variant="primary"
                loading={busy === row.id}
                disabled={Boolean(busy)}
                onClick={() => void decide(row, 'approve')}
              >
                Одобрить
              </Button>
              {rejecting === row.id ? (
                <div className={styles.requestReject}>
                  <label className={styles.field}>
                    Причина (необязательно)
                    <input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={300} />
                  </label>
                  <Button
                    variant="danger"
                    loading={busy === row.id}
                    disabled={Boolean(busy)}
                    onClick={() => void decide(row, 'reject')}
                  >
                    Отклонить
                  </Button>
                  <button type="button" className={styles.ghost} onClick={() => setRejecting(null)}>
                    Отмена
                  </button>
                </div>
              ) : (
                <Button variant="ghost" disabled={Boolean(busy)} onClick={() => { setRejecting(row.id); setReason(''); }}>
                  Отклонить
                </Button>
              )}
            </>
          ) : null}
        </div>
      </li>
    );
  }

  return (
    <section className={styles.card} aria-label="Заявки на подключение" data-testid="staff-join-requests">
      <h2>Заявки на подключение</h2>
      {pending.length ? (
        <p className={styles.lead}>Люди зарегистрировались сами и ждут, пока их добавят в компанию.</p>
      ) : (
        <p className={styles.lead}>Новых заявок нет.</p>
      )}
      {notice ? (
        <p className={styles.flash} role="status">
          {notice}
        </p>
      ) : null}
      {err ? (
        <p className={styles.error} role="alert">
          {err}
        </p>
      ) : null}
      {pending.length ? <ul className={styles.requestList}>{pending.map((row) => item(row, 'pending'))}</ul> : null}
      {rejected.length ? (
        <>
          <button type="button" className={styles.ghost} onClick={() => setShowRejected((open) => !open)}>
            {showRejected ? 'Скрыть отклонённые' : `Отклонённые: ${rejected.length}`}
          </button>
          {showRejected ? <ul className={styles.requestList}>{rejected.map((row) => item(row, 'rejected'))}</ul> : null}
        </>
      ) : null}
    </section>
  );
}
