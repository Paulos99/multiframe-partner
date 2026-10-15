import { useState, type FormEvent } from 'react';
import { usePartner } from './PartnerContext';
import styles from './partner.module.css';

export function LoginScreen() {
  const { login, loading, error } = usePartner();
  const [loginName, setLoginName] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

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
      <form className={styles.card} onSubmit={(e) => void onSubmit(e)}>
        <h1>Кабинет партнёра MultiFrame</h1>
        <p className={styles.lead}>
          Проблемомер и калькулятор с корпоративными параметрами. Сессия сохраняется в браузере.
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
        <p className={styles.hint}>
          Демо: <code>admin</code> / <code>admin1234</code> · <code>partner1</code> /{' '}
          <code>demo1234</code> · сотрудник создаётся партнёром
        </p>
      </form>
    </div>
  );
}
