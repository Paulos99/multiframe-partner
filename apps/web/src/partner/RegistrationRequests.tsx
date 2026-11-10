import { useState } from 'react';
import { personName } from '../../../../packages/shared/personName.js';
import { Button } from '../ui/Button';
import { usePartner } from './PartnerContext';
import { pendingRegistrations, registrationOf, rejectedRegistrations, requestsCountLabel } from './registration';
import styles from './partner.module.css';
import addStyles from './AdminPartners.module.css';

type Row = ReturnType<ReturnType<typeof usePartner>['adminListPartners']>[number];

function when(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
}

function applicant(row: Row): string {
  const reg = registrationOf(row);
  const full = [reg?.firstName, reg?.lastName].filter(Boolean).join(' ').trim();
  return full || personName(row.user.displayName) || row.user.displayName;
}

/**
 * Заявки владельцев, зарегистрировавшихся сами (страница #/register).
 * Кабинет заявителя уже работает; здесь StP подтверждает или отклоняет его.
 */
export function RegistrationRequests() {
  const api = usePartner();
  const rows = api.adminListPartners();
  const pending = pendingRegistrations(rows);
  const rejected = rejectedRegistrations(rows);
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showRejected, setShowRejected] = useState(false);

  if (!pending.length && !rejected.length && !notice) return null;

  async function decide(row: Row, decision: 'approve' | 'reject') {
    const company = row.org?.settings.companyName || row.user.displayName;
    setBusy(row.user.id);
    setErr(null);
    setNotice(null);
    try {
      await api.adminDecideRegistration(row.user.id, decision, decision === 'reject' ? reason.trim() : '');
      setNotice(decision === 'approve' ? `«${company}» подтверждён` : `Заявка «${company}» отклонена, вход в кабинет закрыт`);
      setRejecting(null);
      setReason('');
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Ошибка');
    } finally {
      setBusy(null);
    }
  }

  function item(row: Row, kind: 'pending' | 'rejected') {
    const reg = registrationOf(row);
    const id = row.user.id;
    const company = row.org?.settings.companyName || row.user.displayName;
    const city = row.org?.settings.city || 'город не указан';
    return (
      <li key={id} className={styles.requestItem} data-registration={row.user.login}>
        <div className={styles.requestWho}>
          <strong>{company}</strong>
          <span className={styles.requestMeta}>
            {applicant(row)} · {city} · логин {row.user.login}
          </span>
          <span className={styles.requestMeta}>
            {kind === 'pending' ? `Заявка от ${when(reg?.submittedAt)}` : `Отклонена ${when(reg?.decidedAt)}`}
          </span>
          {kind === 'rejected' && reg?.reason ? <span className={styles.requestReason}>Причина: {reg.reason}</span> : null}
        </div>
        <div className={styles.rowActions}>
          <Button
            variant="primary"
            loading={busy === id}
            disabled={Boolean(busy)}
            onClick={() => void decide(row, 'approve')}
          >
            Подтвердить
          </Button>
          {kind === 'pending' ? (
            <button
              type="button"
              className={styles.danger}
              disabled={Boolean(busy)}
              aria-expanded={rejecting === id}
              onClick={() => {
                setErr(null);
                setReason('');
                setRejecting((open) => (open === id ? null : id));
              }}
            >
              Отклонить
            </button>
          ) : null}
        </div>
        {rejecting === id ? (
          <div className={styles.requestReject} role="group" aria-label={`Отклонить заявку «${company}»`}>
            <p className={styles.lead}>
              Владелец и сотрудники «{company}» больше не смогут войти. При входе они увидят, что регистрация отклонена,
              и причину, если вы её напишете. Подтвердить заявку можно и потом.
            </p>
            <label className={styles.field}>
              Причина (необязательно)
              <textarea value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
            </label>
            <div className={styles.rowActions}>
              <button
                type="button"
                className={styles.danger}
                disabled={Boolean(busy)}
                onClick={() => void decide(row, 'reject')}
              >
                {busy === id ? 'Отклоняем…' : 'Отклонить заявку'}
              </button>
              <button type="button" className={styles.ghost} onClick={() => setRejecting(null)}>
                Отмена
              </button>
            </div>
          </div>
        ) : null}
      </li>
    );
  }

  return (
    <section className={`${styles.card} ${styles.panelCard}`} data-section="registrations" id="registrations" aria-labelledby="registrations-title">
      <div className={addStyles.sectionHead}>
        <h2 id="registrations-title">
          Новые заявки
          {pending.length ? (
            <span className={styles.requestCount} aria-label={requestsCountLabel(pending.length)}>
              {pending.length}
            </span>
          ) : null}
        </h2>
      </div>
      <p className={styles.lead}>
        Владельцы зарегистрировались сами по ссылке и уже работают в кабинете. Подтвердите компанию или отклоните заявку.
      </p>
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
      {pending.length ? (
        <ul className={styles.requestList}>{pending.map((row) => item(row, 'pending'))}</ul>
      ) : (
        <p className={styles.hint}>Новых заявок нет.</p>
      )}
      {rejected.length ? (
        <>
          <button
            type="button"
            className={styles.ghost}
            aria-expanded={showRejected}
            onClick={() => setShowRejected((v) => !v)}
          >
            {showRejected ? 'Скрыть отклонённые' : `Отклонённые: ${rejected.length}`}
          </button>
          {showRejected ? <ul className={styles.requestList}>{rejected.map((row) => item(row, 'rejected'))}</ul> : null}
        </>
      ) : null}
    </section>
  );
}
