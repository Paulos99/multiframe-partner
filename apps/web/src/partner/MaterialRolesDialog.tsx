import { useEffect, useId, useRef, useState } from 'react';
import type { MaterialRole } from '../../../../packages/shared/materialsLib.js';
import { Button } from '../ui/Button';
import { m, motionPresets, usePrefersReducedMotion } from './motionBits';
import { ROLE_OPTIONS, rolesFromChoice, rolesLabel, type FolderLimit, type MaterialRoles } from './materialRoles';
import dialogStyles from './MaterialsContextMenu.module.css';
import styles from './MaterialRolesDialog.module.css';

/**
 * Окно «Кто видит»: все роли или только выбранные. Админ StP видит всё всегда.
 * Внутри папки с ограничением роли вне папки выключены: материал не может быть виден шире папки.
 */
export function MaterialRolesDialog({
  title,
  initial,
  limit,
  isFolder = false,
  confirmLabel = 'Сохранить',
  onConfirm,
  onClose,
}: {
  title: string;
  initial: MaterialRoles | undefined;
  limit: FolderLimit;
  isFolder?: boolean;
  confirmLabel?: string;
  /** true — окно закрывается; false — остаётся (ошибку показывает экран). */
  onConfirm: (roles: MaterialRoles) => Promise<boolean> | boolean;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const reduce = usePrefersReducedMotion();
  const titleId = useId();
  const noteId = useId();
  const [all, setAll] = useState(initial == null);
  const [picked, setPicked] = useState<Set<MaterialRole>>(
    () => new Set(initial ?? (limit ? limit.roles : ROLE_OPTIONS.map((o) => o.role))),
  );
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const element = ref.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  const allowed = (role: MaterialRole) => !limit || limit.roles.includes(role);

  function toggle(role: MaterialRole) {
    setProblem(null);
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(role)) next.delete(role);
      else next.add(role);
      return next;
    });
  }

  function confirm() {
    const chosen = [...picked].filter(allowed);
    if (!all && !chosen.length) {
      setProblem('Выберите хотя бы одну роль');
      return;
    }
    setBusy(true);
    void Promise.resolve(onConfirm(rolesFromChoice(all, chosen))).then((ok) => {
      if (ok) onClose();
      else setBusy(false);
    });
  }

  return (
    <m.dialog
      ref={ref}
      className={dialogStyles.dialog}
      aria-labelledby={titleId}
      aria-describedby={noteId}
      data-testid="material-roles-dialog"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      initial={reduce ? false : motionPresets.modal.initial}
      animate={motionPresets.modal.animate}
    >
      <h3 id={titleId}>{title}</h3>
      <div id={noteId} className={dialogStyles.note}>
        {limit ? (
          <p className={styles.limit}>
            Папка «{limit.folderName}» видна только: {rolesLabel(limit.roles)}. Материал внутри не может быть виден шире папки.
          </p>
        ) : null}
        <p className={styles.hint}>
          {isFolder ? 'Правило папки действует на всё, что в ней лежит. ' : ''}Админ StP видит всё.
        </p>
      </div>
      <fieldset className={styles.choice}>
        <legend className={styles.legend}>Кто видит</legend>
        <label className={styles.option}>
          <input type="radio" name={`${titleId}-mode`} checked={all} onChange={() => setAll(true)} />
          <span>{limit ? 'Все, кому видна папка' : 'Все роли'}</span>
        </label>
        <label className={styles.option}>
          <input type="radio" name={`${titleId}-mode`} checked={!all} onChange={() => setAll(false)} />
          <span>Только выбранные роли</span>
        </label>
        <div className={styles.roles} aria-label="Роли" role="group">
          {ROLE_OPTIONS.map((option) => {
            const enabled = !all && allowed(option.role);
            return (
              <label key={option.role} className={enabled ? styles.role : styles.roleOff}>
                <input
                  type="checkbox"
                  checked={allowed(option.role) && (all || picked.has(option.role))}
                  disabled={!enabled}
                  onChange={() => toggle(option.role)}
                />
                <span>{option.label}</span>
                {!allowed(option.role) ? <span className={styles.why}>не видит папку</span> : null}
              </label>
            );
          })}
        </div>
      </fieldset>
      {problem ? (
        <p className={styles.problem} role="alert">
          {problem}
        </p>
      ) : null}
      <div className={dialogStyles.actions}>
        <Button variant="ghost" disabled={busy} onClick={onClose}>
          Отмена
        </Button>
        <Button loading={busy} disabled={busy} onClick={confirm}>
          {confirmLabel}
        </Button>
      </div>
    </m.dialog>
  );
}
