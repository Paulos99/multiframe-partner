import { useEffect, useRef, useState, type FormEvent } from 'react';
import { usePartner } from './PartnerContext';
import {
  apiProfile,
  apiUpdateProfile,
  apiChangePassword,
  apiUploadAvatar,
  hasRemoteApi,
} from './apiClient';
import { compressAvatar } from './avatar';
import { m, motionPresets, usePrefersReducedMotion } from './motionBits';
import styles from './ProfilePanel.module.css';

export function ProfilePanel({ onClose }: { onClose: () => void }) {
  const { user, acceptProfile } = usePartner();
  const [login, setLogin] = useState(user?.login || '');
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const reduce = usePrefersReducedMotion();
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  useEffect(() => {
    let alive = true;
    if (hasRemoteApi())
      void apiProfile()
        .then((p) => {
          if (alive) acceptProfile(p);
        })
        .catch(() => {});
    return () => {
      alive = false;
    };
  }, []); // session is fixed by the keyed menu
  async function run(action: () => Promise<void>, success: string) {
    if (busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await action();
      setMessage(success);
      setCurrent('');
      setPassword('');
      setConfirm('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить');
    } finally {
      setBusy(false);
    }
  }
  function saveLogin(event: FormEvent) {
    event.preventDefault();
    void run(
      async () => acceptProfile(await apiUpdateProfile(login, current)),
      'Логин обновлён',
    );
  }
  function savePassword(event: FormEvent) {
    event.preventDefault();
    if (password !== confirm) {
      setError('Пароли не совпадают');
      return;
    }
    void run(
      () => apiChangePassword(current, password),
      'Пароль обновлён. Остальные сессии завершатся при следующем запросе.',
    );
  }
  return (
    <m.dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby="profile-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      initial={reduce ? false : motionPresets.modal.initial}
      animate={motionPresets.modal.animate}
      exit={motionPresets.modal.exit}
    >
      <div className={styles.head}>
        <h2 id="profile-title">Мой профиль</h2>
        <button
          type="button"
          disabled={busy}
          onClick={onClose}
          aria-label="Закрыть профиль"
        >
          ×
        </button>
      </div>
      {!hasRemoteApi() ? (
        <p role="status">
          Редактирование профиля доступно при подключении к серверу.
        </p>
      ) : null}
      <fieldset disabled={busy || !hasRemoteApi()} className={styles.fields}>
        <div className={styles.photo}>
          {user?.avatarUrl ? (
            <img src={user.avatarUrl} alt="Фото профиля" />
          ) : (
            <span aria-hidden="true">
              {user?.displayName?.slice(0, 1) || '•'}
            </span>
          )}
          <label>
            Фото
            <input
              type="file"
              aria-label="Фото"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file)
                  void run(
                    async () =>
                      acceptProfile(
                        await apiUploadAvatar(await compressAvatar(file)),
                      ),
                    'Фото обновлено',
                  );
              }}
            />
            <small>JPEG, PNG или WebP. Сожмём до 256 px и 200 КБ.</small>
          </label>
        </div>
        <label>
          Текущий пароль
          <input
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </label>
        <form onSubmit={saveLogin}>
          <label>
            Логин
            <input
              value={login}
              autoComplete="username"
              pattern="[a-zA-Z0-9_.@-]{3,80}"
              required
              onChange={(e) => setLogin(e.target.value)}
            />
          </label>
          <button disabled={!current || login === user?.login}>
            Сохранить логин
          </button>
        </form>
        <form onSubmit={savePassword}>
          <label>
            Новый пароль
            <input
              type="password"
              autoComplete="new-password"
              minLength={10}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <label>
            Повторите пароль
            <input
              type="password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </label>
          <button disabled={!current || !password || !confirm}>
            Сменить пароль
          </button>
        </form>
      </fieldset>
      {busy ? <p role="status">Сохраняем…</p> : null}
      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}
      {message ? <p role="status">{message}</p> : null}
    </m.dialog>
  );
}
