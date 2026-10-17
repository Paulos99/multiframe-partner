import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '../ui/Button';
import { DemoLoginPicker, isDemoModeEnabled } from './DemoSwitcher';
import { FadeRise, ShakeBox } from './motionBits';
import { usePartner } from './PartnerContext';
import styles from './partner.module.css';

export function LoginScreen() {
  const { login, loading, error } = usePartner();
  const [loginName, setLoginName] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [shake, setShake] = useState(0);
  const demo = isDemoModeEnabled();
  const shownError = localError || error;

  useEffect(() => {
    if (shownError) setShake((n) => n + 1);
  }, [shownError]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLocalError(null);
    try {
      await login(loginName.trim(), password);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Не удалось войти');
    }
  }

  const form = (
    <form className={styles.card} onSubmit={(e) => void onSubmit(e)}>
      <h1>Кабинет партнёра MultiFrame</h1>
      <p className={styles.lead}>
        {demo
          ? 'Логин и пароль, если роли сверху не подходят.'
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
      {shownError ? (
        <p className={styles.error} role="alert">
          {shownError}
        </p>
      ) : null}
      <Button type="submit" fullWidth loading={loading} disabled={loading}>
        {loading ? 'Входим…' : 'Войти'}
      </Button>
      {!demo ? (
        <p className={styles.hint}>
          Демо: <code>admin</code>/<code>admin1234</code> · владелец <code>partner1</code>/
          <code>demo1234</code> · менеджер <code>sales1</code> · замерщик <code>exec1</code> ·
          монтажник <code>crew1</code> (пароль сотрудников <code>exec1234</code>)
        </p>
      ) : null}
    </form>
  );

  return (
    <div className={styles.shell}>
      <FadeRise className={styles.loginStack} blur>
        {demo ? <DemoLoginPicker /> : null}
        {demo ? (
          <>
            <button
              type="button"
              className={styles.ghost}
              aria-expanded={manualOpen}
              onClick={() => setManualOpen((v) => !v)}
            >
              {manualOpen ? 'Скрыть ручной вход' : 'Войти по логину'}
            </button>
            {manualOpen ? (
              <ShakeBox signal={shake} className={styles.loginStack}>
                {form}
              </ShakeBox>
            ) : null}
          </>
        ) : (
          <ShakeBox signal={shake} className={styles.loginStack}>
            {form}
          </ShakeBox>
        )}
      </FadeRise>
    </div>
  );
}
