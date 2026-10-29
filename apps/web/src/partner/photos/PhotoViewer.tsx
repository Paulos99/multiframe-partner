import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PHOTO_CAPTION_MAX, PHOTO_STAGE_LABELS } from '../../../../../packages/shared/roomPhotos.js';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { PhotoCompare } from './PhotoCompare';
import { formatPhotoDate, groupByStage, type ViewPhoto } from './photoFormat';
import styles from './PhotoViewer.module.css';

type Props = {
  photos: readonly ViewPhoto[];
  startIndex?: number;
  /** Открыть сразу в сравнении «До / После». */
  startInCompare?: boolean;
  onClose: () => void;
  canDelete?: (photo: ViewPhoto) => boolean;
  onDelete?: (photo: ViewPhoto) => Promise<void>;
  canEditCaption?: (photo: ViewPhoto) => boolean;
  onCaption?: (photo: ViewPhoto, caption: string) => Promise<void>;
};

/** Полноэкранный просмотр фото: листание кнопками, стрелками клавиатуры и свайпом; сравнение «До / После». */
export function PhotoViewer({
  photos,
  startIndex = 0,
  startInCompare = false,
  onClose,
  canDelete,
  onDelete,
  canEditCaption,
  onCaption,
}: Props) {
  const [index, setIndex] = useState(startIndex);
  const [compare, setCompare] = useState(startInCompare);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [captionDraft, setCaptionDraft] = useState('');
  const closeRef = useRef<HTMLButtonElement>(null);
  const swipe = useRef<{ x: number; y: number } | null>(null);

  const total = photos.length;
  const safeIndex = Math.min(index, Math.max(0, total - 1));
  const photo = photos[safeIndex];
  const groups = useMemo(() => groupByStage(photos), [photos]);
  const canCompare = groups.before.length > 0 && groups.after.length > 0;

  useEffect(() => {
    if (!total) onClose();
  }, [total, onClose]);

  useEffect(() => {
    setCaptionDraft(photo?.caption || '');
    setError('');
  }, [photo?.id, photo?.caption]);

  const step = useCallback(
    (delta: number) => {
      if (total < 2) return;
      setIndex((current) => (Math.min(current, total - 1) + delta + total) % total);
    },
    [total],
  );

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (confirmDelete) return;
      const typing = (event.target as HTMLElement | null)?.tagName === 'INPUT';
      if (event.key === 'Escape') onClose();
      else if (!typing && !compare && event.key === 'ArrowLeft') step(-1);
      else if (!typing && !compare && event.key === 'ArrowRight') step(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirmDelete, compare, onClose, step]);

  if (!photo) return null;

  const deletable = Boolean(onDelete && canDelete?.(photo));
  const editable = Boolean(onCaption && canEditCaption?.(photo));
  const author = photo.authorName || '';

  const saveCaption = async () => {
    if (!onCaption) return;
    setBusy(true);
    setError('');
    try {
      await onCaption(photo, captionDraft);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить подпись');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!onDelete) return;
    setBusy(true);
    setError('');
    try {
      await onDelete(photo);
      setConfirmDelete(false);
    } catch (e) {
      setConfirmDelete(false);
      setError(e instanceof Error ? e.message : 'Не удалось удалить фото');
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className={styles.root} role="dialog" aria-modal="true" aria-label="Просмотр фото" data-testid="photo-viewer">
      <header className={styles.top}>
        <button ref={closeRef} type="button" className={styles.close} onClick={onClose} data-testid="photo-viewer-close">
          Закрыть
        </button>
        <p className={styles.counter} aria-live="polite">
          {compare ? 'До и после' : `${safeIndex + 1} из ${total}`}
        </p>
        {canCompare ? (
          <button
            type="button"
            className={styles.toggle}
            aria-pressed={compare}
            onClick={() => setCompare((value) => !value)}
            data-testid="photo-compare-toggle"
          >
            {compare ? 'Листать снимки' : 'Сравнить до и после'}
          </button>
        ) : (
          <span />
        )}
      </header>

      <div
        className={styles.stage}
        onPointerDown={(event) => {
          if (compare || event.pointerType === 'mouse') return;
          swipe.current = { x: event.clientX, y: event.clientY };
        }}
        onPointerUp={(event) => {
          const start = swipe.current;
          swipe.current = null;
          if (!start || compare) return;
          const dx = event.clientX - start.x;
          const dy = event.clientY - start.y;
          if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
        }}
      >
        {compare ? (
          <div className={styles.compareWrap}>
            <PhotoCompare befores={groups.before} afters={groups.after} tone="dark" />
          </div>
        ) : (
          <>
            <img
              key={photo.id}
              className={styles.image}
              src={photo.url}
              alt={photo.caption || `Фото, этап «${PHOTO_STAGE_LABELS[photo.stage]}»`}
              draggable={false}
              data-testid="photo-viewer-image"
            />
            {total > 1 ? (
              <>
                <button
                  type="button"
                  className={`${styles.nav} ${styles.prev}`}
                  aria-label="Предыдущее фото"
                  onClick={() => step(-1)}
                >
                  ‹
                </button>
                <button
                  type="button"
                  className={`${styles.nav} ${styles.next}`}
                  aria-label="Следующее фото"
                  onClick={() => step(1)}
                >
                  ›
                </button>
              </>
            ) : null}
          </>
        )}
      </div>

      {!compare ? (
        <footer className={styles.info}>
          <div className={styles.meta}>
            <span className={styles.chip} data-stage={photo.stage}>
              {PHOTO_STAGE_LABELS[photo.stage]}
            </span>
            <span>{formatPhotoDate(photo.createdAt)}</span>
            {author ? <span>{author}</span> : null}
          </div>
          {editable ? (
            <div className={styles.captionRow}>
              <input
                className={styles.captionInput}
                value={captionDraft}
                maxLength={PHOTO_CAPTION_MAX}
                placeholder="Подпись к фото"
                aria-label="Подпись к фото"
                onChange={(event) => setCaptionDraft(event.target.value)}
              />
              <button
                type="button"
                className={styles.action}
                disabled={busy || captionDraft.trim() === (photo.caption || '')}
                onClick={() => void saveCaption()}
              >
                Сохранить
              </button>
            </div>
          ) : photo.caption ? (
            <p className={styles.caption}>{photo.caption}</p>
          ) : null}
          {deletable ? (
            <button
              type="button"
              className={`${styles.action} ${styles.danger}`}
              disabled={busy}
              onClick={() => setConfirmDelete(true)}
              data-testid="photo-delete"
            >
              Удалить фото
            </button>
          ) : null}
          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}
        </footer>
      ) : null}

      <ConfirmDialog
        open={confirmDelete}
        title="Удалить это фото?"
        message="Фото пропадёт из отчёта. Вернуть его будет нельзя."
        confirmLabel="Удалить"
        busy={busy}
        onConfirm={() => void remove()}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>,
    document.body,
  );
}

