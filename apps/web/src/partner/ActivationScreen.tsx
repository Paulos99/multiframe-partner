import { useState, type FormEvent } from 'react';
import { PASSWORD_MIN } from '../../../../packages/shared/passwordPolicy.js';
import { Button } from '../ui/Button';
import { FadeRise } from './motionBits';
import { apiActivate, passwordProblem, removeActivationFromUrl } from './activation';
import styles from './LoginScreen.module.css';

/** Экран по ссылке активации: только пароль. После успеха токен убирается из адреса. */
export function ActivationScreen({
  token,
  onDone,
  onCancel,
}: {
  token: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const problem = passwordProblem(password);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiActivate(token, password);
      removeActivationFromUrl();
      onDone();
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'Не удалось задать пароль');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.shell}>
      <FadeRise className={styles.stack} blur>
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
            <h1>Активация аккаунта</h1>
            <p className={styles.lead}>Придумайте пароль для входа в кабинет. Ссылка сработает один раз.</p>
          </header>
          <form className={styles.form} onSubmit={(event) => void onSubmit(event)}>
            <label className={styles.field}>
              Новый пароль
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                required
              />
            </label>
            <p className={styles.lead}>Не короче {PASSWORD_MIN} символов, без пробелов по краям.</p>
            {error ? (
              <p className={styles.error} role="alert">
                {error}
              </p>
            ) : null}
            <Button type="submit" fullWidth loading={busy} disabled={busy}>
              {busy ? 'Сохраняем…' : 'Задать пароль'}
            </Button>
            <button
              type="button"
              className={styles.manual}
              onClick={() => {
                removeActivationFromUrl();
                onCancel();
              }}
            >
              Ко входу
            </button>
          </form>
        </section>
      </FadeRise>
    </div>
  );
}
