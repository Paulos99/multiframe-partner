import { Skeleton } from './Skeleton';
import { m, AnimatePresence, motionPresets, usePrefersReducedMotion } from './motionBits';
import { useState, type FormEvent } from 'react';
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
  const [execPassword, setExecPassword] = useState(() => generatePassword());
  const [execName, setExecName] = useState('');
  const [execRole, setExecRole] = useState<UserRole>('measurer');
  const [execCreated, setExecCreated] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [savingStaff, setSavingStaff] = useState(false);
  const staff = api.partnerListStaff();

  if (!user || !canManageStaff(user.role)) return null;

  async function onCreateStaff(e: FormEvent) {
    e.preventDefault();
    setExecCreated(null);
    setErr(null);
    setSavingStaff(true);
    try {
      const password = execPassword.trim() || generatePassword();
      const res = await api.partnerCreateStaff({
        login: execLogin.trim(),
        password,
        displayName: execName.trim() || execLogin.trim(),
        role: execRole,
      });
      setExecCreated(`${ROLE_LABELS[res.role]} ${res.login} · пароль: ${res.password}`);
      setExecLogin('');
      setExecPassword(generatePassword());
      setExecName('');
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Ошибка');
    } finally {
      setSavingStaff(false);
    }
  }

  return (
    <form className={`${styles.card} ${styles.panelCard}`} onSubmit={(e) => void onCreateStaff(e)}>
      <h2>Сотрудники</h2>
      <p className={styles.lead}>
        Менеджер ведёт сделки и КП, замерщик сохраняет объекты, у каждого монтажника свой вход и
        свои задания. Цены монтажник не видит — только спецификацию и схемы.
      </p>
      <div className={styles.grid2}>
        <label className={styles.field}>
          Имя / подпись
          <input
            value={execName}
            onChange={(e) => setExecName(e.target.value)}
            placeholder="Например, Иван · замер"
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
        <label className={`${styles.field} ${styles.passwordField}`}>
          Пароль
          <div className={styles.passwordRow}>
            <input
              type="text"
              value={execPassword}
              onChange={(e) => setExecPassword(e.target.value)}
              required
              autoComplete="new-password"
              spellCheck={false}
            />
            <button
              type="button"
              className={styles.ghost}
              onClick={() => setExecPassword(generatePassword())}
            >
              Сгенерировать
            </button>
          </div>
        </label>
      </div>
      {execCreated ? (
        <p className={styles.flash} role="status">
          {execCreated}
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
      {api.staffLoading && !staff.length ? <Skeleton count={3} label="Загрузка сотрудников"/> : null}
      <div className={styles.table}><AnimatePresence initial={false}>
        {staff.map((ex) => (
          <m.div layout={!reduce} initial={reduce?false:motionPresets.page.initial} animate={motionPresets.page.animate} exit={reduce?undefined:motionPresets.page.exit} key={ex.id} className={styles.tableRow}>
            <div>
              <strong>{ex.displayName}</strong>
              <div className={styles.hint}>
                {ex.login} · {ROLE_LABELS[ex.role] || ex.role}
              </div>
            </div>
            <div className={styles.rowActions}>
              <NewPasswordButton staffId={ex.id} staffName={ex.displayName} />
              {ex.id === user.id ? null : (
                <button
                  type="button"
                  className={styles.danger}
                  onClick={() => {
                    if (confirm(`Удалить сотрудника «${ex.displayName}» (${ex.login})?`)) {
                      void api.partnerDeleteStaff(ex.id);
                    }
                  }}
                >
                  Удалить
                </button>
              )}
            </div>
          </m.div>
        ))}</AnimatePresence>
        {!api.staffLoading && !staff.length ? <p className={styles.lead}>Пока нет сотрудников</p> : null}
      </div>
    </form>
  );
}
