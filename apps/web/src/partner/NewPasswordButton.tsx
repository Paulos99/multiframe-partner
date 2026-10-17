import { useState } from 'react';
import { generatePassword } from './localStore';
import { usePartner } from './PartnerContext';
import styles from './partner.module.css';

/** Set or generate a password and show it once. The current password is never displayed. */
export function NewPasswordButton({ staffId, staffName }: { staffId: string; staffName: string }) {
  const api = usePartner();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [once, setOnce] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function close() {
    setOpen(false);
    setValue('');
    setErr(null);
    setOnce(null);
  }

  async function apply(next: string) {
    const password = next.trim();
    if (password.length < 6) {
      setErr('Минимум 6 символов или нажмите «Сгенерировать».');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const shown = await api.partnerResetStaffPassword(staffId, password);
      setOnce(shown);
      setValue('');
      setOpen(false);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Не удалось сменить пароль');
    } finally {
      setBusy(false);
    }
  }

  if (once) {
    return (
      <div className={styles.oncePassword} role="status">
        <p>
          Новый пароль для {staffName}. Покажите его сейчас — повторно посмотреть нельзя.
        </p>
        <input readOnly value={once} aria-label="Новый пароль" onFocus={(e) => e.currentTarget.select()} />
        <button type="button" className={styles.ghost} onClick={close}>
          Скрыть
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <button type="button" className={styles.ghost} onClick={() => setOpen(true)}>
        Новый пароль
      </button>
    );
  }

  return (
    <div className={styles.oncePassword}>
      <label className={styles.field}>
        Новый пароль для {staffName}
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoComplete="new-password"
          spellCheck={false}
          placeholder="Задайте или сгенерируйте"
        />
      </label>
      {err ? (
        <p className={styles.error} role="alert">
          {err}
        </p>
      ) : null}
      <div className={styles.rowActions}>
        <button
          type="button"
          className={styles.ghost}
          onClick={() => {
            setErr(null);
            setValue(generatePassword());
          }}
        >
          Сгенерировать
        </button>
        <button type="button" className={styles.primary} disabled={busy} onClick={() => void apply(value)}>
          {busy ? 'Сохраняем…' : 'Сохранить'}
        </button>
        <button type="button" className={styles.ghost} onClick={close}>
          Отмена
        </button>
      </div>
    </div>
  );
}
