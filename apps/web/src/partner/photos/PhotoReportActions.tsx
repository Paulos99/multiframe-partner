import { useEffect, useMemo, useRef, useState } from 'react';
import type { UserRole } from '../../../../../packages/shared/partner';
import { apiCreateRoomShare, apiGetRoomShare } from '../apiClient';
import { canCreateClientLink, clientLinkUrl } from '../clientLink';
import { copyText } from '../ClientLinkPanel';
import { triggerDownload } from '../../state/reportPdf';
import { PhotoPdfError, openPdfBlob, renderPhotoReportPdf, type PdfSourcePhoto } from './photoReportPdf';
import styles from './PhotoReportActions.module.css';

const SHARE_TITLE = 'Фотоотчёт по вашей комнате';

type Built = { blob: Blob; filename: string; url: string | null };

function failure(err: unknown): string {
  if (err instanceof PhotoPdfError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return 'Не удалось собрать PDF. Повторите чуть позже.';
}

/** Ссылка клиента на эту комнату: берём уже выданную и обновляем снимок, создаём, если её нет. Отключённую не оживляем. */
async function clientUrlFor(
  objectId: string,
  role: UserRole | undefined,
  answers: Record<string, unknown> | null | undefined,
): Promise<string | null> {
  try {
    let link = await apiGetRoomShare(objectId);
    if (!link.disabled && canCreateClientLink(role) && answers) link = await apiCreateRoomShare(objectId, answers);
    return link.enabled && link.token ? clientLinkUrl(link.token) : null;
  } catch {
    return null;
  }
}

/**
 * «Открыть PDF» и «Отправить клиенту» под фотоотчётом комнаты. В PDF фото по этапам, название комнаты и дата, без цен и подписей.
 * «Отправить клиенту» отдаёт системному меню PDF и ссылку клиента (если показ клиенту включён); без меню — скачивает PDF и копирует ссылку.
 */
export function PhotoReportActions({
  objectId,
  roomName,
  photos,
  role,
  clientVisible,
  answers,
  compact = false,
}: {
  objectId: string;
  roomName: string;
  photos: readonly PdfSourcePhoto[];
  role: UserRole | undefined;
  clientVisible: boolean;
  answers?: Record<string, unknown> | null;
  compact?: boolean;
}) {
  const [busy, setBusy] = useState<'' | 'open' | 'send'>('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const built = useRef<Built | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const signature = useMemo(() => photos.map((p) => `${p.stage}:${p.createdAt}:${p.thumbUrl.length}`).join('|'), [photos]);
  useEffect(() => {
    built.current = null;
  }, [signature, roomName, clientVisible]);

  const canSend = canCreateClientLink(role);
  if (!photos.length) return null;

  const make = async (): Promise<Built> => {
    const pdf = await renderPhotoReportPdf({ roomName, photos });
    const url = clientVisible ? await clientUrlFor(objectId, role, answers) : null;
    return { ...pdf, url };
  };

  const openPdf = async () => {
    // Вкладку открываем сразу, пока жив жест пользователя: иначе браузер её заблокирует.
    const tab = window.open('', '_blank');
    if (tab) tab.document.title = 'Собираем PDF…';
    setBusy('open');
    setError('');
    setNote('');
    try {
      const pdf = built.current ?? (await renderPhotoReportPdf({ roomName, photos }));
      openPdfBlob(pdf.blob, pdf.filename, tab);
    } catch (e) {
      tab?.close();
      if (alive.current) setError(failure(e));
    } finally {
      if (alive.current) setBusy('');
    }
  };

  const send = async () => {
    setBusy('send');
    setError('');
    setNote('');
    try {
      const pdf = built.current ?? (await make());
      built.current = pdf;
      const file = new File([pdf.blob], pdf.filename, { type: 'application/pdf' });
      const text = pdf.url ? `Фотоотчёт по комнате «${roomName}»: ${pdf.url}` : `Фотоотчёт по комнате «${roomName}»`;
      const canFiles = typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
      if (typeof navigator.share === 'function' && (canFiles || pdf.url)) {
        try {
          await navigator.share(canFiles ? { title: SHARE_TITLE, text, files: [file] } : { title: SHARE_TITLE, url: pdf.url! });
          return;
        } catch (e) {
          if (e instanceof DOMException && e.name === 'AbortError') return;
          if (e instanceof DOMException && e.name === 'NotAllowedError' && alive.current) {
            // Сборка заняла больше времени, чем браузер держит жест. PDF готов: следующее нажатие отправляет сразу.
            setNote('PDF готов. Нажмите «Отправить клиенту» ещё раз.');
            return;
          }
        }
      }
      triggerDownload(pdf.blob, pdf.filename);
      const copied = pdf.url ? await copyText(pdf.url) : false;
      if (alive.current) {
        setNote(
          pdf.url
            ? copied
              ? 'PDF сохранён, ссылка для клиента скопирована.'
              : `PDF сохранён. Ссылка для клиента: ${pdf.url}`
            : clientVisible
              ? 'PDF сохранён. Ссылки для клиента нет: нужен Проблемомер этой комнаты.'
              : 'PDF сохранён. Показ фото клиенту выключен, ссылку не прикладываем.',
        );
      }
    } catch (e) {
      if (alive.current) setError(failure(e));
    } finally {
      if (alive.current) setBusy('');
    }
  };

  return (
    <div className={compact ? styles.rowCompact : styles.row} data-testid="photo-report-actions">
      <button
        type="button"
        className={styles.ghost}
        onClick={() => void openPdf()}
        disabled={busy !== ''}
        aria-busy={busy === 'open'}
        data-testid="photo-pdf-open"
      >
        {busy === 'open' ? 'Собираем PDF…' : 'Открыть PDF'}
      </button>
      {canSend ? (
        <button
          type="button"
          className={styles.primary}
          onClick={() => void send()}
          disabled={busy !== ''}
          aria-busy={busy === 'send'}
          data-testid="photo-pdf-send"
        >
          {busy === 'send' ? 'Готовим…' : 'Отправить клиенту'}
        </button>
      ) : null}
      {note ? (
        <p className={styles.note} role="status" data-testid="photo-pdf-note">
          {note}
        </p>
      ) : null}
      {error ? (
        <p className={styles.error} role="alert" data-testid="photo-pdf-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** На странице клиента: «Скачать PDF» с теми же снимками, что он видит. */
export function ClientPdfButton({ roomName, photos }: { roomName: string; photos: readonly PdfSourcePhoto[] }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!photos.length) return null;
  const download = async () => {
    setBusy(true);
    setError('');
    try {
      const pdf = await renderPhotoReportPdf({ roomName, photos });
      triggerDownload(pdf.blob, pdf.filename);
    } catch (e) {
      setError(failure(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={styles.rowCompact}>
      <button type="button" className={styles.clientBtn} onClick={() => void download()} disabled={busy} data-testid="client-pdf-download">
        {busy ? 'Собираем PDF…' : 'Скачать PDF'}
      </button>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
