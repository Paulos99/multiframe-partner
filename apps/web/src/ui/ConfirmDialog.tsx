import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, ModalSurface } from '../partner/motionBits';
import { Button } from './Button';
import styles from './ConfirmDialog.module.css';

/** Модальное подтверждение опасного действия: портал в body, Esc и клик по фону — отмена. */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const latest = useRef({ busy, onCancel });
  latest.current = { busy, onCancel };
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !latest.current.busy) latest.current.onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [open]);
  return createPortal(
    <AnimatePresence>
      {open ? (
        <div
          className={styles.backdrop}
          role="presentation"
          onClick={() => {
            if (!busy) onCancel();
          }}
        >
          <ModalSurface
            className={styles.dialog}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={titleId}
            exit={{ opacity: 0, scale: 0.98 }}
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id={titleId}>{title}</h2>
            {message ? <p>{message}</p> : null}
            <div className={styles.actions}>
              <button
                ref={cancelRef}
                type="button"
                className={styles.cancel}
                disabled={busy}
                onClick={onCancel}
              >
                Отмена
              </button>
              <Button variant="danger" loading={busy} onClick={onConfirm}>
                {confirmLabel}
              </Button>
            </div>
          </ModalSurface>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
