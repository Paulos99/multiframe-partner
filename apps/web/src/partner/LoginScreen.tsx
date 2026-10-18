import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '../ui/Button';
import { DemoLoginPicker, isDemoModeEnabled } from './DemoSwitcher';
import { FadeRise, ShakeBox } from './motionBits';
import { usePartner } from './PartnerContext';
import styles from './LoginScreen.module.css';

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

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLocalError(null);
    try {
      await login(loginName.trim(), password);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Не удалось войти');
    }
  }

  const fields = (
    <>
      <label className={styles.field}>
        Логин
        <input
          value={loginName}
          onChange={(event) => setLoginName(event.target.value)}
          autoComplete="username"
          required
        />
      </label>
      <label className={styles.field}>
        Пароль
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
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
    </>
  );

  return (
    <div className={styles.shell}>
      <FadeRise className={styles.stack} blur>
        <ShakeBox signal={shake} className={styles.stack}>
          <section className={styles.card}>
            <header className={styles.brand}>
              <span className={styles.logoBox}>
                <img
                  className={styles.logo}
                  src={`${import.meta.env.BASE_URL}logo-stp.png`}
                  alt="StP MultiFrame"
                />
              </span>
              <h1>Кабинет партнёра</h1>
              <p className={styles.lead}>
                {demo ? 'Выберите роль, чтобы открыть кабинет.' : 'Проблемомер, калькулятор и объекты компании.'}
              </p>
            </header>
            {demo ? <DemoLoginPicker /> : null}
            {demo ? (
              <>
                <button
                  type="button"
                  className={styles.manual}
                  aria-expanded={manualOpen}
                  onClick={() => setManualOpen((value) => !value)}
                >
                  {manualOpen ? 'Скрыть форму' : 'Войти по логину'}
                </button>
                {manualOpen ? (
                  <form className={styles.form} onSubmit={(event) => void onSubmit(event)}>
                    <h2>Вход по логину</h2>
                    {fields}
                  </form>
                ) : null}
              </>
            ) : (
              <form className={styles.form} onSubmit={(event) => void onSubmit(event)}>
                {fields}
                <p className={styles.hint}>
                  Демо: <code>admin</code>/<code>admin1234</code> · владелец <code>partner1</code>/
                  <code>demo1234</code> · менеджер <code>sales1</code> · замерщик <code>exec1</code> ·
                  монтажник <code>crew1</code> (пароль сотрудников <code>exec1234</code>)
                </p>
              </form>
            )}
          </section>
        </ShakeBox>
      </FadeRise>
    </div>
  );
}
