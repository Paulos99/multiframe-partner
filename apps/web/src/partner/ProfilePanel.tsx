import { useEffect, useId, useRef, useState, type DragEvent, type FormEvent } from 'react';
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
import { Button } from '../ui/Button';
import styles from './ProfilePanel.module.css';
import { CloseIcon, EyeIcon as EyeGlyph, EyeOffIcon as EyeOffGlyph } from '../icons';

type Pending = 'login' | 'password';

const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export function ProfilePanel({ onClose }: { onClose: () => void }) {
  const { user, acceptProfile } = usePartner();
  const [login, setLogin] = useState(user?.login || '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState<Pending | null>(null);
  const [fileName, setFileName] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const loginBtn = useRef<HTMLButtonElement>(null);
  const passwordBtn = useRef<HTMLButtonElement>(null);
  const reduce = usePrefersReducedMotion();
  const remote = hasRemoteApi();

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

  /** Фото меняется по токену сессии, без текущего пароля. */
  async function uploadPhoto(file: File | undefined) {
    if (!file || busy || !remote) return;
    setError('');
    setMessage('');
    if (!AVATAR_TYPES.includes(file.type)) {
      setError('Нужен файл JPEG, PNG или WebP');
      return;
    }
    setFileName(file.name);
    setBusy(true);
    try {
      acceptProfile(await apiUploadAvatar(await compressAvatar(file)));
      setMessage('Фото обновлено');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить фото');
    } finally {
      setBusy(false);
    }
  }

  function askLogin(event: FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');
    setPending('login');
  }

  function askPassword(event: FormEvent) {
    event.preventDefault();
    setMessage('');
    if (password !== confirm) {
      setError('Пароли не совпадают');
      return;
    }
    setError('');
    setPending('password');
  }

  /** Вызывается из окна подтверждения; ошибка показывается там же. */
  async function confirmWith(current: string) {
    if (pending === 'login') {
      acceptProfile(await apiUpdateProfile(login, current));
      setMessage('Логин обновлён');
    } else if (pending === 'password') {
      await apiChangePassword(current, password);
      setPassword('');
      setConfirm('');
      setMessage('Пароль обновлён. Остальные сессии завершатся при следующем запросе.');
    }
  }

  function closeConfirm() {
    const back = pending === 'login' ? loginBtn.current : passwordBtn.current;
    setPending(null);
    // Фокус возвращается на кнопку, которая открыла подтверждение.
    window.requestAnimationFrame(() => back?.focus());
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragOver(false);
    void uploadPhoto(event.dataTransfer.files?.[0]);
  }

  return (
    <m.dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby="profile-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy && !pending) onClose();
      }}
      initial={reduce ? false : motionPresets.modal.initial}
      animate={motionPresets.modal.animate}
      exit={motionPresets.modal.exit}
    >
      <div className={styles.head}>
        <h2 id="profile-title">Мой профиль</h2>
        <button
          type="button"
          className={styles.close}
          disabled={busy}
          onClick={onClose}
          aria-label="Закрыть профиль"
        >
          <CloseIcon size="1em" />
        </button>
      </div>
      {!remote ? (
        <p role="status">Редактирование профиля доступно при подключении к серверу.</p>
      ) : null}
      <fieldset disabled={busy || !remote} className={styles.fields}>
        <div className={styles.photo}>
          <div
            className={styles.avatar}
            data-drag={dragOver ? 'true' : undefined}
            title="Перетащите фото сюда"
            onDragOver={(e) => {
              if (!remote) return;
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
          >
            {user?.avatarUrl ? (
              <img src={user.avatarUrl} alt="Фото профиля" />
            ) : (
              <span aria-hidden="true">{user?.displayName?.slice(0, 1) || '•'}</span>
            )}
          </div>
          <div className={styles.photoSide}>
            <input
              ref={fileRef}
              className={styles.fileInput}
              type="file"
              aria-label="Фото"
              accept={AVATAR_TYPES.join(',')}
              tabIndex={-1}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                void uploadPhoto(file);
              }}
            />
            <div className={styles.fileRow}>
              <Button
                variant="secondary"
                disabled={busy || !remote}
                onClick={() => fileRef.current?.click()}
              >
                Загрузить фото
              </Button>
              <span className={styles.fileName} aria-live="polite">
                {fileName || 'Файл не выбран'}
              </span>
            </div>
            <small>JPEG, PNG или WebP. Сожмём до 256 px и 200 КБ. Можно перетащить на фото.</small>
          </div>
        </div>
        <form onSubmit={askLogin}>
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
          <button
            ref={loginBtn}
            className={styles.action}
            disabled={!login.trim() || login === user?.login}
          >
            Сохранить логин
          </button>
        </form>
        <form onSubmit={askPassword}>
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
          <button
            ref={passwordBtn}
            className={styles.action}
            disabled={!password || !confirm}
          >
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
      {pending ? (
        <ConfirmPassword
          title={pending === 'login' ? 'Сохранить новый логин' : 'Сменить пароль'}
          note={
            pending === 'login'
              ? `Новый логин: ${login}. Введите текущий пароль, чтобы подтвердить.`
              : 'Введите текущий пароль, чтобы подтвердить смену.'
          }
          submitLabel={pending === 'login' ? 'Сохранить логин' : 'Сменить пароль'}
          onConfirm={confirmWith}
          onClose={closeConfirm}
        />
      ) : null}
    </m.dialog>
  );
}

/** Небольшое окно «Текущий пароль»: показать/скрыть, Enter, ошибка под полем, фокус. */
function ConfirmPassword({
  title,
  note,
  submitLabel,
  onConfirm,
  onClose,
}: {
  title: string;
  note: string;
  submitLabel: string;
  onConfirm: (current: string) => Promise<void>;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const reduce = usePrefersReducedMotion();
  const titleId = useId();
  const errorId = useId();

  useEffect(() => {
    const element = ref.current;
    element?.showModal();
    input.current?.focus();
    return () => element?.close();
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!value || busy) return;
    setBusy(true);
    setError('');
    try {
      await onConfirm(value);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить');
      setBusy(false);
      window.requestAnimationFrame(() => {
        input.current?.focus();
        input.current?.select();
      });
    }
  }

  return (
    <m.dialog
      ref={ref}
      className={styles.confirm}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!busy) onClose();
      }}
      initial={reduce ? false : motionPresets.modal.initial}
      animate={motionPresets.modal.animate}
    >
      <form onSubmit={submit} className={styles.confirmForm}>
        <h3 id={titleId}>{title}</h3>
        <p className={styles.confirmNote}>{note}</p>
        <label className={styles.confirmLabel}>
          Текущий пароль
          <span className={styles.secret}>
            <input
              ref={input}
              type={show ? 'text' : 'password'}
              autoComplete="current-password"
              value={value}
              required
              aria-invalid={error ? 'true' : undefined}
              aria-describedby={error ? errorId : undefined}
              onChange={(e) => {
                setValue(e.target.value);
                if (error) setError('');
              }}
            />
            <button
              type="button"
              className={styles.eye}
              aria-pressed={show}
              aria-label={show ? 'Скрыть пароль' : 'Показать пароль'}
              onClick={() => {
                setShow((v) => !v);
                input.current?.focus();
              }}
            >
              {show ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </span>
        </label>
        {error ? (
          <p id={errorId} role="alert" className={styles.error}>
            {error}
          </p>
        ) : null}
        <div className={styles.confirmActions}>
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" loading={busy} disabled={!value || busy}>
            {submitLabel}
          </Button>
        </div>
      </form>
    </m.dialog>
  );
}

function EyeIcon() {
  return <EyeGlyph />;
}

function EyeOffIcon() {
  return <EyeOffGlyph />;
}
