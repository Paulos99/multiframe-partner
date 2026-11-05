import { Skeleton } from './Skeleton';
import { m, AnimatePresence, motionPresets, usePrefersReducedMotion } from './motionBits';
import { useEffect, useState, type FormEvent } from 'react';
import {
  canManageStaff,
  ROLE_LABELS,
  STAFF_ROLES,
  type UserRole,
} from '../../../../packages/shared/partner';
import { Button } from '../ui/Button';
import { ActivationLinkButton } from './ActivationLinkButton';
import { canIssueLinks } from './activation';
import { NewPasswordButton } from './NewPasswordButton';
import { generatePassword, usePartner } from './PartnerContext';
import { navigateCompany, navigateStaff, parseStaffHash, type StaffRoute } from './projectRoute';
import styles from './partner.module.css';

/** Один экран сотрудников для владельца и менеджера компании. */
export function StaffPanel() {
  const api = usePartner();
  const reduce=usePrefersReducedMotion();
  const user = api.user;
  const [execLogin, setExecLogin] = useState('');
  const [execName, setExecName] = useState('');
  const [execRole, setExecRole] = useState<UserRole>('measurer');
  const [issued, setIssued] = useState<{ id: string; login: string; displayName: string; password: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [savingStaff, setSavingStaff] = useState(false);
  const [adding, setAdding] = useState(false);
  const [route, setRoute] = useState<StaffRoute>(() =>
    parseStaffHash(typeof window === 'undefined' ? '' : window.location.hash),
  );
  const [staffName, setStaffName] = useState('');
  const [nameErr, setNameErr] = useState<string | null>(null);
  const [nameSaving, setNameSaving] = useState(false);
  const staff = api.partnerListStaff();

  useEffect(() => {
    const sync = () => setRoute(parseStaffHash(window.location.hash));
    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);
    return () => {
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('popstate', sync);
    };
  }, []);

  async function onCreateStaff(e: FormEvent) {
    e.preventDefault();
    setIssued(null);
    setErr(null);
    setSavingStaff(true);
    try {
      // С сервером пароль не создаём: сотрудник задаст его сам по ссылке активации.
      const password = canIssueLinks() ? '' : generatePassword();
      const displayName = execName.trim() || execLogin.trim();
      const res = await api.partnerCreateStaff({
        login: execLogin.trim(),
        password,
        displayName,
        role: execRole,
      });
      setIssued({ id: res.id, login: res.login, displayName, password: res.password });
      setExecLogin('');
      setExecName('');
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Ошибка');
    } finally {
      setSavingStaff(false);
    }
  }

  const open = route.kind === 'person' ? staff.find((member) => member.id === route.staffId) || null : null;
  const openId = open?.id ?? null;
  const openName = open?.displayName ?? null;

  useEffect(() => {
    if (!openId || openName == null) return;
    setStaffName(openName);
    setNameErr(null);
  }, [openId, openName]);

  if (!user || !canManageStaff(user.role)) return null;

  if (route.kind === 'person') {
    return (
      <section className={styles.roomPage} aria-label="Сотрудник">
        <nav className={styles.crumbs} aria-label="Путь">
          <button type="button" onClick={() => navigateCompany('about', 'replace')}>
            Компания
          </button>
          <span aria-hidden="true">/</span>
          <button type="button" onClick={() => navigateStaff({ kind: 'list' }, 'replace')}>
            Сотрудники
          </button>
          <span aria-hidden="true">/</span>
          <span>{open?.displayName || 'Карточка'}</span>
        </nav>
        {api.staffLoading && !open ? <p className={styles.lead}>Открываем карточку…</p> : null}
        {!api.staffLoading && !open ? (
          <>
            <h1>Сотрудник не найден</h1>
            <button type="button" className={styles.ghost} onClick={() => navigateStaff({ kind: 'list' }, 'replace')}>
              К списку
            </button>
          </>
        ) : null}
        {open ? (
          <>
            <div className={styles.blockHead}>
              <div>
                <p className={styles.eyebrow}>Сотрудники</p>
                <h1>{open.displayName}</h1>
                <p className={styles.lead}>
                  {open.login} · {ROLE_LABELS[open.role] || open.role}
                </p>
              </div>
              <button type="button" className={styles.ghost} onClick={() => navigateStaff({ kind: 'list' }, 'replace')}>
                К списку
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
            {open.pendingActivation ? (
              <p className={styles.hint}>Пароль ещё не задан. Нажмите «Ссылка для входа» и отправьте её сотруднику.</p>
            ) : null}
            <div className={styles.rowActions}>
              <ActivationLinkButton userId={open.id} userName={open.displayName} />
              <NewPasswordButton staffId={open.id} staffName={open.displayName} />
            </div>
            {open.id === user.id ? null : (
              <button
                type="button"
                className={styles.danger}
                onClick={() => {
                  if (confirm(`Удалить сотрудника «${open.displayName}» (${open.login})?`)) {
                    void api.partnerDeleteStaff(open.id).then(() => navigateStaff({ kind: 'list' }, 'replace'));
                  }
                }}
              >
                Удалить
              </button>
            )}
          </>
        ) : null}
      </section>
    );
  }

  return (
    <section className={`${styles.card} ${styles.panelCard}`}>
      <h2>Сотрудники</h2>
      <p className={styles.lead}>
        {staff.length ? `${staff.length} в команде` : 'Пока никого нет'}. Карточка открывается своей страницей.
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
          <p className={styles.hint}>
            {canIssueLinks()
              ? 'Пароль вы не задаёте: после сохранения нажмите «Ссылка для входа» и отправьте её сотруднику. Он придумает пароль сам.'
              : 'Пароль создаётся при сохранении и показывается один раз.'}
          </p>
          {issued ? (
            <p className={styles.flash} role="status">
              {issued.password ? (
                <>
                  Сотрудник {issued.login}. Пароль: {issued.password}{' '}
                  <button type="button" className={styles.ghost} onClick={() => setIssued(null)}>
                    Скрыть пароль
                  </button>
                </>
              ) : (
                <>
                  Сотрудник {issued.login} создан. Пароля пока нет:{' '}
                  <ActivationLinkButton userId={issued.id} userName={issued.displayName} />{' '}
                  <button type="button" className={styles.ghost} onClick={() => setIssued(null)}>
                    Скрыть
                  </button>
                </>
              )}
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
              onClick={() => navigateStaff({ kind: 'person', staffId: ex.id })}
            >
              <strong>{ex.displayName}</strong>
              <div className={styles.hint}>
                {ex.login} · {ROLE_LABELS[ex.role] || ex.role}
                {ex.pendingActivation ? ' · ждёт активации' : ''}
              </div>
            </button>
          </m.div>
        ))}</AnimatePresence>
        {!api.staffLoading && !staff.length ? <p className={styles.lead}>Пока нет сотрудников</p> : null}
      </div>
    </section>
  );
}
