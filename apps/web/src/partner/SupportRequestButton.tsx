import { useState } from 'react';
import type { SupportCategory } from '../../../../packages/shared/support';
import { apiCreateSupportCase, hasRemoteApi, isApiError } from './apiClient';
import { usePartner } from './PartnerContext';
import {
  SUPPORT_CATEGORIES,
  SupportPayloadError,
  assertSupportRequestSafe,
  saveLocalSupportCase,
} from './signals/supportRequest';
import styles from './partner.module.css';

/** Заявка без карточки клиента: только категория и модуль. */
export function SupportRequestButton({
  module = null,
  orgId = null,
}: {
  module?: string | null;
  orgId?: string | null;
}) {
  const api = usePartner();
  const user = api.user;
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<SupportCategory>('sales');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setErr(null);
    setNotice(null);
    const payload = { category, module };
    try {
      assertSupportRequestSafe(payload);
    } catch (ex) {
      setErr(ex instanceof SupportPayloadError ? ex.message : 'Проверьте заявку');
      return;
    }
    setBusy(true);
    const actor = { id: user?.id ?? null, orgId: user?.orgId ?? orgId, role: user?.role ?? null };
    try {
      if (hasRemoteApi()) {
        try {
          await apiCreateSupportCase({ category, module, orgId: actor.orgId });
          setNotice('Заявка отправлена в StP');
        } catch (ex) {
          if (!isApiError(ex) || ex.status !== 0) throw ex;
          saveLocalSupportCase(payload, actor);
          setNotice('Нет сети: заявка сохранена на устройстве');
        }
      } else {
        saveLocalSupportCase(payload, actor);
        setNotice('Заявка сохранена на устройстве');
      }
      setOpen(false);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Не удалось отправить заявку');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.hintCard} data-testid="support-request">
      <button
        type="button"
        className={styles.ghost}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        Нужна помощь StP
      </button>
      {open ? (
        <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
          <label className={styles.field}>
            Категория
            <select value={category} onChange={(e) => setCategory(e.target.value as SupportCategory)}>
              {SUPPORT_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <p className={styles.hint}>Контакты и данные клиента в заявку не передаются.</p>
          <button type="button" className={styles.primary} disabled={busy} onClick={() => void submit()}>
            {busy ? 'Отправляем…' : 'Отправить'}
          </button>
        </div>
      ) : null}
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
    </div>
  );
}
