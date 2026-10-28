import { useEffect, useRef, useState } from 'react';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { useSession } from '../state/SessionContext';
import { usePartner } from './PartnerContext';
import {
  ApiError,
  apiCreateRoomShare,
  apiDisableRoomShare,
  hasRemoteApi,
  isApiError,
  type RoomShareLink,
} from './apiClient';
import { canCreateClientLink, canDisableClientLink, clientLinkUrl } from './clientLink';
import styles from './ClientLinkPanel.module.css';

type Phase = 'idle' | 'loading' | 'ready' | 'off' | 'error';

function failureText(err: unknown): string {
  if (isApiError(err) && err instanceof ApiError) {
    if (err.status === 404) return 'Комната ещё не отправлена на сервер. Подождите синхронизации и повторите.';
    if (err.status === 0) return 'Нет сети. Повторите, когда появится связь.';
    if (err.message) return err.message;
  }
  return 'Не удалось получить ссылку. Повторите чуть позже.';
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * «Ссылка для клиента» на экране результата комнаты.
 * Открывается тут же на странице, не боковой панелью.
 */
export function ClientLinkButton() {
  const { user, diagnosisRequest } = usePartner();
  const { session } = useSession();
  const objectId = diagnosisRequest?.objectId ?? null;
  const allowed = Boolean(objectId && canCreateClientLink(user?.role) && hasRemoteApi());

  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [link, setLink] = useState<RoomShareLink | null>(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [confirmOff, setConfirmOff] = useState(false);
  const [busyOff, setBusyOff] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const noteTimer = useRef<number>(0);

  useEffect(() => () => window.clearTimeout(noteTimer.current), []);

  if (!allowed || !objectId) return null;

  const url = link?.enabled && link.token ? clientLinkUrl(link.token) : '';
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  function flash(text: string) {
    setNote(text);
    window.clearTimeout(noteTimer.current);
    noteTimer.current = window.setTimeout(() => setNote(''), 2600);
  }

  async function issue() {
    if (!objectId) return;
    setPhase('loading');
    setError('');
    try {
      // Снимок обновляется при каждом открытии: клиент видит то же, что менеджер на экране.
      const next = await apiCreateRoomShare(objectId, session.answers.room as unknown as Record<string, unknown>);
      setLink(next);
      setPhase('ready');
    } catch (err) {
      setError(failureText(err));
      setPhase('error');
    }
  }

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    void issue();
  }

  async function onCopy() {
    if (!url) return;
    const ok = await copyText(url);
    if (!ok) inputRef.current?.select();
    flash(ok ? 'Ссылка скопирована' : 'Выделите ссылку и скопируйте её вручную');
  }

  async function onShare() {
    if (!url) return;
    try {
      await navigator.share({ title: 'Результаты Проблемомера по вашей комнате', url });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      void onCopy();
    }
  }

  async function onDisable() {
    if (!objectId) return;
    setBusyOff(true);
    try {
      await apiDisableRoomShare(objectId);
      setLink({ enabled: false, token: null, disabled: true });
      setPhase('off');
      setConfirmOff(false);
    } catch (err) {
      setConfirmOff(false);
      setError(failureText(err));
      setPhase('error');
    } finally {
      setBusyOff(false);
    }
  }

  return (
    <>
      <Button
        variant="secondary"
        onClick={toggle}
        aria-expanded={open}
        aria-controls="client-link-panel"
        data-testid="client-link-button"
      >
        Ссылка для клиента
      </Button>
      {open ? (
        <section
          id="client-link-panel"
          className={styles.panel}
          aria-label="Ссылка для клиента"
          data-testid="client-link-panel"
        >
          <h2>Ссылка для клиента</h2>
          <p className={styles.lead}>
            Клиент откроет результаты этой комнаты без входа: параметры, показатели и звук до и после.
            Цен, имени, телефона и адреса на странице нет.
          </p>

          {phase === 'loading' ? <p role="status">Готовим ссылку…</p> : null}

          {phase === 'ready' && url ? (
            <>
              <div className={styles.row}>
                <input
                  ref={inputRef}
                  className={styles.input}
                  readOnly
                  value={url}
                  aria-label="Ссылка для клиента"
                  data-testid="client-link-url"
                  onFocus={(event) => event.currentTarget.select()}
                />
                <Button onClick={() => void onCopy()} data-testid="client-link-copy">
                  Скопировать
                </Button>
                {canShare ? (
                  <Button variant="secondary" onClick={() => void onShare()}>
                    Отправить
                  </Button>
                ) : null}
              </div>
              <p className={styles.hint}>
                На странице клиента — то, что вы видите сейчас. Изменили ответы — откройте «Ссылку для
                клиента» ещё раз, и страница обновится.
              </p>
              <div className={styles.row}>
                <a className={styles.open} href={url} target="_blank" rel="noopener noreferrer">
                  Открыть как клиент
                </a>
                {canDisableClientLink(user?.role) ? (
                  <Button
                    variant="ghost"
                    onClick={() => setConfirmOff(true)}
                    data-testid="client-link-disable"
                  >
                    Отключить ссылку
                  </Button>
                ) : null}
              </div>
            </>
          ) : null}

          {phase === 'off' ? (
            <>
              <p role="status" data-testid="client-link-off">
                Ссылка отключена. Прежний адрес больше не открывается.
              </p>
              <div className={styles.row}>
                <Button variant="secondary" onClick={() => void issue()}>
                  Выдать новую ссылку
                </Button>
              </div>
            </>
          ) : null}

          {phase === 'error' ? (
            <>
              <p role="alert" className={styles.error}>
                {error}
              </p>
              <div className={styles.row}>
                <Button variant="secondary" onClick={() => void issue()}>
                  Повторить
                </Button>
              </div>
            </>
          ) : null}

          <p className={styles.note} role="status" aria-live="polite">
            {note}
          </p>
        </section>
      ) : null}
      <ConfirmDialog
        open={confirmOff}
        title="Отключить ссылку?"
        message="Клиент больше не сможет открыть страницу по этому адресу. Позже можно выдать новую ссылку."
        confirmLabel="Отключить"
        busy={busyOff}
        onConfirm={() => void onDisable()}
        onCancel={() => setConfirmOff(false)}
      />
    </>
  );
}
