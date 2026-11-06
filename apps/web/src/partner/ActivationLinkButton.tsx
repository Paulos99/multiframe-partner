import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../ui/Button';
import { activationUrl, apiIssueActivation, canIssueLinks } from './activation';
import dialogStyles from './CloseDialog.module.css';
import styles from './partner.module.css';

/** Окно «Ссылка активации»: поле только для чтения и «Скопировать». Ссылку приложение само не отправляет. */
export function ActivationLinkDialog({
  url,
  name,
  onClose,
}: {
  url: string;
  name: string;
  onClose: () => void;
}) {
  const titleId = useId();
  const field = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);

  useEffect(() => {
    field.current?.select();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function copy() {
    setCopyError(false);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      field.current?.select();
      const ok = typeof document.execCommand === 'function' && document.execCommand('copy');
      setCopied(ok);
      setCopyError(!ok);
    }
  }

  return createPortal(
    <div className={dialogStyles.backdrop} role="presentation" onClick={onClose}>
      <div
        className={dialogStyles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-activation-dialog
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id={titleId}>Ссылка активации</h2>
        <p className={dialogStyles.lead}>
          Для «{name}». Ссылка одноразовая и действует 24 часа. Приложение её не отправляет: перешлите её
          сотруднику сами. По ссылке он задаст логин и пароль, а прежние входы закроются. Новая ссылка отменяет
          прежнюю.
        </p>
        <input
          ref={field}
          className={styles.activationLink}
          readOnly
          value={url}
          aria-label="Ссылка активации"
          onFocus={(event) => event.currentTarget.select()}
        />
        {copyError ? (
          <p className={dialogStyles.error} role="alert">
            Не удалось скопировать. Выделите ссылку и скопируйте вручную.
          </p>
        ) : null}
        <p className="srOnly" role="status" aria-live="polite">
          {copied ? 'Ссылка скопирована' : ''}
        </p>
        <div className={dialogStyles.actions}>
          <button type="button" className={dialogStyles.cancel} onClick={onClose}>
            Закрыть
          </button>
          <Button onClick={() => void copy()}>{copied ? 'Скопировано' : 'Скопировать'}</Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Кнопка «Ссылка для входа» для сохранённого пользователя. Она же сбрасывает пароль. */
export function ActivationLinkButton({
  userId,
  userName,
  className,
}: {
  userId: string;
  userName: string;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  if (!canIssueLinks()) return null;

  async function issue() {
    setBusy(true);
    setErr(null);
    try {
      const res = await apiIssueActivation(userId);
      setUrl(activationUrl(res.path));
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Не удалось создать ссылку');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className={className ?? styles.ghost} disabled={busy} onClick={() => void issue()}>
        {busy ? 'Создаём…' : 'Ссылка для входа'}
      </button>
      {err ? (
        <span className={styles.error} role="alert">
          {err}
        </span>
      ) : null}
      {url ? <ActivationLinkDialog url={url} name={userName} onClose={() => setUrl(null)} /> : null}
    </>
  );
}
