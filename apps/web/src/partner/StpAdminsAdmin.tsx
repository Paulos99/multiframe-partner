import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Button } from '../ui/Button';
import { Skeleton } from './Skeleton';
import { generatePassword } from './PartnerContext';
import { ActivationLinkButton } from './ActivationLinkButton';
import { canIssueLinks } from './activation';
import {
  createStpAdmin,
  deleteStpAdmin,
  listStpAdmins,
  resetStpAdminPassword,
  setStpAdminDisabled,
  type StpAdminRow,
} from './stpAdmins';
import styles from './partner.module.css';
import addStyles from './AdminPartners.module.css';

/** Блок администратора StP: список и добавление других администраторов сети. */
export function StpAdminsAdmin() {
  const [rows, setRows] = useState<StpAdminRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setRows(await listStpAdmins());
      setLoadError(null);
    } catch (ex) {
      setLoadError(ex instanceof Error ? ex.message : 'Не удалось загрузить администраторов');
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const activeCount = (rows || []).filter((row) => !row.loginDisabled).length;

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setSaving(true);
    try {
      const res = await createStpAdmin({ login, password, displayName });
      setNotice(
        res.password
          ? `Создан администратор ${res.login} · временный пароль: ${res.password}`
          : `Создан администратор ${res.login}. Пароля пока нет: нажмите «Ссылка для входа» в его строке.`,
      );
      setLogin('');
      setPassword('');
      setDisplayName('');
      setOpen(false);
      await reload();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Ошибка');
    } finally {
      setSaving(false);
    }
  }

  async function onReset(row: StpAdminRow) {
    try {
      const next = await resetStpAdminPassword(row.id, generatePassword());
      setErr(null);
      setNotice(`Новый пароль для ${row.login}: ${next}`);
    } catch (ex) {
      setNotice(null);
      setErr(ex instanceof Error ? ex.message : 'Ошибка');
    }
  }

  async function onToggle(row: StpAdminRow) {
    const nextDisabled = !row.loginDisabled;
    const label = nextDisabled ? 'отключить' : 'включить';
    if (!confirm(`${label[0].toUpperCase()}${label.slice(1)} вход для ${row.displayName} (${row.login})?`)) return;
    try {
      await setStpAdminDisabled(row.id, nextDisabled);
      setNotice(null);
      setErr(null);
      await reload();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Ошибка');
    }
  }

  async function onDelete(row: StpAdminRow) {
    if (!confirm(`Удалить администратора ${row.displayName} (${row.login})? Доступ пропадёт сразу.`)) return;
    try {
      await deleteStpAdmin(row.id);
      setNotice(null);
      setErr(null);
      await reload();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Ошибка');
    }
  }

  return (
    <div className={`${styles.card} ${styles.panelCard}`} data-section="stp-admins">
      <div className={addStyles.sectionHead}>
        <h2>Администраторы StP</h2>
        <Button
          variant={open ? 'secondary' : 'primary'}
          aria-expanded={open}
          aria-controls="admin-add-stp-admin"
          onClick={() => {
            setErr(null);
            setOpen((v) => !v);
          }}
        >
          {open ? 'Скрыть форму' : 'Добавить администратора'}
        </Button>
      </div>
      <p className={styles.hint}>
        Полный доступ ко всей сети. Заведите минимум двух человек: если один потеряет пароль, второй сможет
        восстановить доступ. Себя и последнего оставшегося администратора удалить или отключить нельзя.
      </p>
      {open ? (
        <div id="admin-add-stp-admin" className={addStyles.addPartnerWrap}>
          <form className={addStyles.addPartnerForm} onSubmit={(e) => void onCreate(e)}>
            <h3>Новый администратор</h3>
            <div className={styles.grid2}>
              <label className={styles.field}>
                Логин
                <input value={login} onChange={(e) => setLogin(e.target.value)} required autoComplete="off" />
              </label>
              <label className={styles.field}>
                Временный пароль
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required={!canIssueLinks()}
                  autoComplete="new-password"
                />
              </label>
              <label className={styles.field}>
                Имя
                <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
              </label>
            </div>
            {canIssueLinks() ? (
              <p className={styles.hint}>
                Пароль можно не задавать: нажмите «Ссылка для входа» в строке администратора, он придумает пароль сам.
              </p>
            ) : null}
            {err ? (
              <p className={styles.error} role="alert">
                {err}
              </p>
            ) : null}
            <Button type="submit" loading={saving} disabled={saving}>
              {saving ? 'Создаём…' : 'Создать'}
            </Button>
          </form>
        </div>
      ) : null}
      {rows === null && !loadError ? <Skeleton count={2} label="Загрузка администраторов StP" /> : null}
      {notice ? (
        <p className={styles.flash} role="status">
          {notice}
        </p>
      ) : null}
      {(err && !open) || loadError ? (
        <p className={styles.error} role="alert">
          {loadError || err}
        </p>
      ) : null}
      <div className={styles.table}>
        {(rows || []).map((row) => {
          const self = Boolean(row.isSelf);
          const lastActive = !row.loginDisabled && activeCount <= 1;
          const protect = self || lastActive;
          return (
            <div key={row.id} className={styles.tableRow} data-stp-admin={row.login}>
              <div>
                <strong>{row.displayName}</strong>
                <div className={styles.hint}>
                  {row.login}
                  {self ? ' · это вы' : ''}
                  {row.loginDisabled ? ' · вход отключён' : ''}
                  {row.pendingActivation ? ' · ждёт активации' : ''}
                  {row.createdAt
                    ? ` · создан ${new Date(row.createdAt).toLocaleDateString('ru-RU')}`
                    : ''}
                  {row.lastLogin ? ` · вход ${new Date(row.lastLogin).toLocaleDateString('ru-RU')}` : ''}
                </div>
              </div>
              <div className={styles.rowActions}>
                <ActivationLinkButton userId={row.id} userName={row.displayName} />
                <button
                  type="button"
                  className={styles.ghost}
                  disabled={Boolean(row.loginDisabled)}
                  onClick={() => void onReset(row)}
                >
                  Новый пароль
                </button>
                <button
                  type="button"
                  className={styles.ghost}
                  disabled={protect && !row.loginDisabled}
                  onClick={() => void onToggle(row)}
                >
                  {row.loginDisabled ? 'Включить' : 'Отключить'}
                </button>
                <button
                  type="button"
                  className={styles.danger}
                  disabled={protect}
                  onClick={() => void onDelete(row)}
                >
                  Удалить
                </button>
              </div>
            </div>
          );
        })}
        {rows && !rows.length ? <p className={styles.lead}>Пока нет администраторов</p> : null}
      </div>
    </div>
  );
}
