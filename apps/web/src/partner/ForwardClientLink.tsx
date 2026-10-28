import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '../ui/Button';
import { useSession } from '../state/SessionContext';
import { usePartner } from './PartnerContext';
import { apiCreateRoomShare, hasRemoteApi } from './apiClient';
import { canCreateClientLink, canDisableClientLink, clientLinkUrl } from './clientLink';
import { copyText, failureText } from './ClientLinkPanel';
import styles from './partner.module.css';

const SHARE_TITLE = 'Результаты Проблемомера по вашей комнате';

/**
 * Внизу результата рядом с «Сохранить»: «Переслать» берёт ссылку клиента (создаёт, если её нет)
 * и открывает системное меню отправки; без него копирует ссылку.
 * Отключённую ссылку не оживляет: предлагает «Выдать новую ссылку».
 */
export function ForwardLinkRow({ objectId, children }: { objectId: string; children: ReactNode }) {
  const { user, objects } = usePartner();
  const { session } = useSession();
  const [busy, setBusy] = useState(false);
  const [off, setOff] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const timer = useRef<number>(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const role = user?.role;
  const visible = hasRemoteApi() && canCreateClientLink(role);
  const room = objects.find((item) => item.id === objectId);
  const onServer = Boolean(room) && !room?.pendingSync;

  function flash(text: string) {
    setNote(text);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setNote(''), 3000);
  }

  async function forward(renew = false) {
    setBusy(true);
    setError('');
    setNote('');
    try {
      const link = await apiCreateRoomShare(
        objectId,
        session.answers.room as unknown as Record<string, unknown>,
        renew,
      );
      if (!link.enabled || !link.token) {
        setOff(true);
        return;
      }
      setOff(false);
      const url = clientLinkUrl(link.token);
      if (typeof navigator.share === 'function') {
        try {
          await navigator.share({ title: SHARE_TITLE, url });
          return;
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') return;
        }
      }
      flash((await copyText(url)) ? 'Ссылка скопирована' : 'Не удалось скопировать. Ссылка есть в блоке «Ссылка для клиента» выше.');
    } catch (err) {
      setError(failureText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className={styles.actionRow}>
        {children}
        {visible ? (
          <Button
            type="button"
            variant="secondary"
            fullWidth
            loading={busy}
            disabled={busy || !onServer}
            onClick={() => void forward()}
            data-testid="forward-link"
          >
            Переслать
          </Button>
        ) : null}
      </div>
      {visible && !onServer ? (
        <p className={styles.hint} data-testid="forward-reason">
          Переслать можно после того, как комната отправится на сервер.
        </p>
      ) : null}
      {off ? (
        <div data-testid="forward-off" role="status">
          <p className={styles.hint}>Ссылка отключена, старый адрес не откроется.</p>
          {canDisableClientLink(role) ? (
            <Button type="button" variant="secondary" loading={busy} onClick={() => void forward(true)} data-testid="forward-renew">
              Выдать новую ссылку
            </Button>
          ) : (
            <p className={styles.hint}>Новую ссылку выдаёт владелец или менеджер.</p>
          )}
        </div>
      ) : null}
      {note ? (
        <p className={styles.flash} role="status" data-testid="forward-note">
          {note}
        </p>
      ) : null}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}
