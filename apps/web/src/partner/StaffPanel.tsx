import { Skeleton } from './Skeleton';
import { m, AnimatePresence, motionPresets, usePrefersReducedMotion } from './motionBits';
import { useEffect, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  canManageStaff,
  ROLE_LABELS,
  STAFF_ROLES,
  type UserRole,
} from '../../../../packages/shared/partner';
import { Button } from '../ui/Button';
import { NewPasswordButton } from './NewPasswordButton';
import { generatePassword, usePartner } from './PartnerContext';
import styles from './partner.module.css';

/** Один экран сотрудников для владельца и менеджера компании. */
export function StaffPanel() {
  const api = usePartner();
  const reduce=usePrefersReducedMotion();
  const user = api.user;
  const [execLogin, setExecLogin] = useState('');
  const [execName, setExecName] = useState('');
  const [execRole, setExecRole] = useState<UserRole>('measurer');
  const [issued, setIssued] = useState<{ login: string; password: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [savingStaff, setSavingStaff] = useState(false);
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [staffName, setStaffName] = useState('');
  const [nameErr, setNameErr] = useState<string | null>(null);
  const [nameSaving, setNameSaving] = useState(false);
  const staff = api.partnerListStaff();

  useEffect(() => {
    if (!openId) return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      setOpenId(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openId]);

  if (!user || !canManageStaff(user.role)) return null;

  async function onCreateStaff(e: FormEvent) {
    e.preventDefault();
    setIssued(null);
    setErr(null);
    setSavingStaff(true);
    try {
      const password = generatePassword();
      const res = await api.partnerCreateStaff({
        login: execLogin.trim(),
        password,
        displayName: execName.trim() || execLogin.trim(),
        role: execRole,
      });
      setIssued({ login: res.login, password: res.password });
      setExecLogin('');
      setExecName('');
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Ошибка');
    } finally {
      setSavingStaff(false);
    }
  }

  const open = staff.find((member) => member.id === openId) || null;

  return (
    <section className={`${styles.card} ${styles.panelCard}`}>
      <h2>Сотрудники</h2>
      <p className={styles.lead}>
        {staff.length ? `${staff.length} в команде` : 'Пока никого нет'}. Карточка открывается по нажатию.
      </p>
      <button type="button" className={styles.primary} onClick={() => setAdding((open) => !open)}>
        {adding ? 'Закрыть' : 'Добавить'}
      </button>
      {adding ? (
        <form onSubmit={(e) => void onCreateStaff(e)}>
          <div className={styles.grid2}>
            <label className={styles.field}>
              Имя
              <input
                value={execName}
                onChange={(e) => setExecName(e.target.value)}
                placeholder="Например, Иван Петров"
                maxLength={80}
              />
            </label>
            <label className={styles.field}>
              Роль
              <select value={execRole} onChange={(e) => setExecRole(e.target.value as UserRole)}>
                {STAFF_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              Логин
              <input
                value={execLogin}
                onChange={(e) => setExecLogin(e.target.value)}
                required
                autoComplete="off"
              />
            </label>
          </div>
          <p className={styles.hint}>Пароль создаётся при сохранении и показывается один раз.</p>
          {issued ? (
            <p className={styles.flash} role="status">
              Сотрудник {issued.login}. Пароль: {issued.password}{' '}
              <button type="button" className={styles.ghost} onClick={() => setIssued(null)}>
                Скрыть пароль
              </button>
            </p>
          ) : null}
          {err ? (
            <p className={styles.error} role="alert">
              {err}
            </p>
          ) : null}
          <Button type="submit" loading={savingStaff} disabled={savingStaff}>
            {savingStaff ? 'Создаём…' : 'Создать сотрудника'}
          </Button>
        </form>
      ) : null}
      {api.staffLoading && !staff.length ? <Skeleton count={3} label="Загрузка сотрудников"/> : null}
      <div className={styles.table}><AnimatePresence initial={false}>
        {staff.map((ex) => (
          <m.div layout={!reduce} initial={reduce?false:motionPresets.page.initial} animate={motionPresets.page.animate} exit={reduce?undefined:motionPresets.page.exit} key={ex.id} className={styles.tableRow}>
            <button
              type="button"
              className={styles.ghost}
              aria-expanded={openId === ex.id}
              onClick={() => {
                setStaffName(ex.displayName);
                setNameErr(null);
                setOpenId(ex.id);
              }}
            >
              <strong>{ex.displayName}</strong>
              <div className={styles.hint}>
                {ex.login} · {ROLE_LABELS[ex.role] || ex.role}
              </div>
            </button>
          </m.div>
        ))}</AnimatePresence>
        {!api.staffLoading && !staff.length ? <p className={styles.lead}>Пока нет сотрудников</p> : null}
      </div>
      {open ? createPortal(
        <>
          <button type="button" className={styles.drawerBackdrop} aria-label="Закрыть карточку" onClick={() => setOpenId(null)} />
          <aside className={styles.drawer} role="dialog" aria-label={open.displayName}>
            <div className={styles.drawerHead}>
              <div>
                <h3>{open.displayName}</h3>
                <p className={styles.lead}>
                  {open.login} · {ROLE_LABELS[open.role] || open.role}
                </p>
              </div>
              <button type="button" className={styles.ghost} onClick={() => setOpenId(null)}>
                Закрыть
              </button>
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                setNameErr(null);
                setNameSaving(true);
                void api
                  .renameStaff(open.id, staffName)
                  .then((saved) => setStaffName(saved.displayName))
                  .catch((ex) => setNameErr(ex instanceof Error ? ex.message : 'Не удалось сохранить имя'))
                  .finally(() => setNameSaving(false));
              }}
            >
              <label className={styles.field}>
                Имя
                <input
                  aria-label="Имя сотрудника"
                  value={staffName}
                  maxLength={80}
                  onChange={(event) => setStaffName(event.target.value)}
                />
              </label>
              {nameErr ? (
                <p className={styles.error} role="alert">
                  {nameErr}
                </p>
              ) : null}
              <Button type="submit" loading={nameSaving} disabled={nameSaving || staffName.trim() === open.displayName.trim()}>
                Сохранить имя
              </Button>
            </form>
            <NewPasswordButton staffId={open.id} staffName={open.displayName} />
            {open.id === user.id ? null : (
              <button
                type="button"
                className={styles.danger}
                onClick={() => {
                  if (confirm(`Удалить сотрудника «${open.displayName}» (${open.login})?`)) {
                    void api.partnerDeleteStaff(open.id);
                    setOpenId(null);
                  }
                }}
              >
                Удалить
              </button>
            )}
          </aside>
        </>,
        document.body,
      ) : null}
    </section>
  );
}
