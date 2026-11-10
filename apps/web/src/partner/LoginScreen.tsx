import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '../ui/Button';
import { FadeRise, ShakeBox } from './motionBits';
import { usePartner } from './PartnerContext';
import { openRegister } from './registration';
import styles from './LoginScreen.module.css';

export function LoginScreen({ notice }: { notice?: string } = {}) {
  const { login, loading, error, remote } = usePartner();
  const [loginName, setLoginName] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [shake, setShake] = useState(0);
  const shownError = localError || error;

  useEffect(() => {
    if (!shownError) return;
    setShake((n) => n + 1);
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

  return (
    <div className={styles.shell}>
      <FadeRise className={styles.stack} blur>
        <ShakeBox signal={shake} className={styles.stack}>
          <section className={styles.card}>
            <header className={styles.brand}>
              <img
                className={styles.logo}
                src={`${import.meta.env.BASE_URL}logo-multiframe.png`}
                alt="MultiFrame"
                width={1024}
                height={173}
                decoding="async"
              />
              <h1>Кабинет партнёра</h1>
              <p className={styles.lead}>Проблемомер, калькулятор и проекты компании.</p>
            </header>
            {notice ? (
              <p className={styles.notice} role="status">
                {notice}
              </p>
            ) : null}
            <form className={styles.form} onSubmit={(event) => void onSubmit(event)}>
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
            </form>
            {remote ? (
              <div className={styles.divider}>
                <p className={styles.hint}>Владелец компании и ещё нет кабинета?</p>
                <button type="button" className={styles.linkButton} onClick={openRegister}>
                  Зарегистрироваться
                </button>
              </div>
            ) : null}
          </section>
        </ShakeBox>
      </FadeRise>
    </div>
  );
}
