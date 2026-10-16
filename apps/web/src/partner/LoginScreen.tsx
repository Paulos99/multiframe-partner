import { useState, type FormEvent } from 'react';
import { DemoLoginPicker, isDemoModeEnabled } from './DemoSwitcher';
import { usePartner } from './PartnerContext';
import styles from './partner.module.css';

export function LoginScreen() {
  const { login, loading, error } = usePartner();
  const [loginName, setLoginName] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const demo = isDemoModeEnabled();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLocalError(null);
    try {
      await login(loginName.trim(), password);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Не удалось войти');
    }
  }

  return (
    <div className={styles.shell}>
      {demo ? <DemoLoginPicker /> : null}
      <form className={styles.card} onSubmit={(e) => void onSubmit(e)}>
        <h1>Кабинет партнёра MultiFrame</h1>
        <p className={styles.lead}>
          {demo
            ? 'Или войдите вручную по логину и паролю.'
            : 'Проблемомер, калькулятор и объекты компании. На общем планшете после работы нажмите «Выйти».'}
        </p>
        <label className={styles.field}>
          Логин
          <input
            value={loginName}
            onChange={(e) => setLoginName(e.target.value)}
            autoComplete="username"
            required
          />
        </label>
        <label className={styles.field}>
          Пароль
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        {(localError || error) && (
          <p className={styles.error} role="alert">
            {localError || error}
          </p>
        )}
        <button type="submit" className={styles.primary} disabled={loading}>
          {loading ? 'Входим…' : 'Войти'}
        </button>
        {!demo ? (
          <p className={styles.hint}>
            Демо: <code>admin</code>/<code>admin1234</code> · владелец <code>partner1</code>/
            <code>demo1234</code> · менеджер <code>sales1</code> · замерщик <code>exec1</code> ·
            бригада <code>crew1</code> (пароль сотрудников <code>exec1234</code>)
          </p>
        ) : null}
      </form>
    </div>
  );
}
