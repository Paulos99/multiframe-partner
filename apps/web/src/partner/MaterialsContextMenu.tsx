import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { PublicMaterial } from '../../../../packages/shared/materialsLib.js';
import { Button } from '../ui/Button';
import { m, motionPresets, usePrefersReducedMotion } from './motionBits';
import styles from './MaterialsContextMenu.module.css';

export type MenuItem = { label: string; danger?: boolean; onSelect: () => void };

/** Что внутри папки (рекурсивно): сколько файлов и вложенных папок удалится вместе с ней. */
export function folderContents(items: PublicMaterial[], folderId: string): { files: number; folders: number } {
  const ids = new Set([folderId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const item of items) {
      if (item.parentId && ids.has(item.parentId) && !ids.has(item.id)) {
        ids.add(item.id);
        grew = true;
      }
    }
  }
  ids.delete(folderId);
  let files = 0;
  let folders = 0;
  for (const item of items) {
    if (!ids.has(item.id)) continue;
    if (item.kind === 'folder') folders += 1;
    else files += 1;
  }
  return { files, folders };
}

function plural(n: number, one: string, few: string, many: string) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export function contentsLabel({ files, folders }: { files: number; folders: number }): string {
  if (!files && !folders) return 'Папка пустая.';
  const parts: string[] = [];
  if (files) parts.push(`${files} ${plural(files, 'файл', 'файла', 'файлов')}`);
  if (folders) parts.push(`${folders} ${plural(folders, 'вложенная папка', 'вложенные папки', 'вложенных папок')}`);
  return `Вместе с ней удалятся ${parts.join(' и ')}.`;
}

/**
 * Контекстное меню по правому клику мышью. Позиция — у курсора, не выходит за экран.
 * Закрывается по Esc, клику вне меню, прокрутке и изменению размера окна.
 */
export function ContextMenu({
  x,
  y,
  label,
  items,
  onClose,
}: {
  x: number;
  y: number;
  label: string;
  items: MenuItem[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = usePrefersReducedMotion();
  const [pos, setPos] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setPos({
      left: Math.max(8, Math.min(x, window.innerWidth - width - 8)),
      top: Math.max(8, Math.min(y, window.innerHeight - height - 8)),
    });
    el.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
  }, [x, y]);

  useEffect(() => {
    const away = (event: Event) => {
      if (ref.current && event.target instanceof Node && ref.current.contains(event.target)) return;
      onClose();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener('pointerdown', away, true);
    document.addEventListener('contextmenu', away, true);
    document.addEventListener('keydown', key);
    window.addEventListener('resize', onClose);
    window.addEventListener('scroll', onClose, true);
    return () => {
      document.removeEventListener('pointerdown', away, true);
      document.removeEventListener('contextmenu', away, true);
      document.removeEventListener('keydown', key);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('scroll', onClose, true);
    };
  }, [onClose]);

  function move(event: React.KeyboardEvent) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const buttons = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') || []);
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = (at + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next]?.focus();
  }

  return (
    <m.div
      ref={ref}
      role="menu"
      aria-label={label}
      className={styles.menu}
      style={{ left: pos.left, top: pos.top }}
      onKeyDown={move}
      onContextMenu={(event) => event.preventDefault()}
      initial={reduce ? false : { opacity: 0, scale: 0.96, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={reduce ? { duration: 0 } : { duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          className={item.danger ? styles.dangerItem : styles.item}
          onClick={() => {
            onClose();
            item.onSelect();
          }}
        >
          {item.label}
        </button>
      ))}
    </m.div>
  );
}

/** Подтверждение удаления папки: название, что удалится, красная кнопка. */
export function DeleteFolderDialog({
  folder,
  contents,
  onConfirm,
  onClose,
}: {
  folder: PublicMaterial;
  contents: { files: number; folders: number };
  onConfirm: () => Promise<boolean>;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const reduce = usePrefersReducedMotion();
  const titleId = useId();
  const noteId = useId();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const element = ref.current;
    element?.showModal();
    // Фокус на «Отмена»: случайный Enter не удалит папку.
    element?.querySelector<HTMLButtonElement>('[data-cancel]')?.focus();
    return () => element?.close();
  }, []);

  return (
    <m.dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby={titleId}
      aria-describedby={noteId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      initial={reduce ? false : motionPresets.modal.initial}
      animate={motionPresets.modal.animate}
    >
      <h3 id={titleId}>Удалить папку «{folder.name}»?</h3>
      <p id={noteId} className={styles.note}>
        {contentsLabel(contents)} Файлы удалятся из хранилища у всех партнёров, отменить нельзя.
      </p>
      <div className={styles.actions}>
        <Button data-cancel="" variant="ghost" disabled={busy} onClick={onClose}>
          Отмена
        </Button>
        <Button
          variant="danger"
          loading={busy}
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void onConfirm().then((ok) => {
              if (ok) onClose();
              else setBusy(false);
            });
          }}
        >
          Удалить папку
        </Button>
      </div>
    </m.dialog>
  );
}
