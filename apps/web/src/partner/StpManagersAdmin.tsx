import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Button } from '../ui/Button';
import { Skeleton } from './Skeleton';
import { generatePassword } from './PartnerContext';
import {
  createStpManager,
  deleteStpManager,
  listStpManagers,
  resetStpManagerPassword,
  type StpManagerRow,
} from './stpManagers';
import styles from './partner.module.css';
import addStyles from './AdminPartners.module.css';

/** Блок администратора StP: менеджеры StP с доступом к обучению и клиентским инструментам. */
export function StpManagersAdmin() {
  const [rows, setRows] = useState<StpManagerRow[] | null>(null);
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
      setRows(await listStpManagers());
      setLoadError(null);
    } catch (ex) {
      setLoadError(ex instanceof Error ? ex.message : 'Не удалось загрузить менеджеров');
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setSaving(true);
    try {
      const res = await createStpManager({ login, password, displayName });
      setNotice(`Создан менеджер StP ${res.login} · пароль: ${res.password}`);
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

  async function onReset(row: StpManagerRow) {
    try {
      const next = await resetStpManagerPassword(row.id, generatePassword());
      setErr(null);
      setNotice(`Новый пароль для ${row.login}: ${next}`);
    } catch (ex) {
      setNotice(null);
      setErr(ex instanceof Error ? ex.message : 'Ошибка');
    }
  }

  async function onDelete(row: StpManagerRow) {
    if (!confirm(`Удалить менеджера StP ${row.displayName} (${row.login})? Доступ пропадёт сразу.`)) return;
    try {
      await deleteStpManager(row.id);
      setNotice(null);
      await reload();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Ошибка');
    }
  }

  return (
    <div className={`${styles.card} ${styles.panelCard}`} data-section="stp-managers">
      <div className={addStyles.sectionHead}>
        <h2>Менеджеры StP</h2>
        <Button
          variant={open ? 'secondary' : 'primary'}
          aria-expanded={open}
          aria-controls="admin-add-stp-manager"
          onClick={() => {
            setErr(null);
            setOpen((v) => !v);
          }}
        >
          {open ? 'Скрыть форму' : 'Добавить менеджера'}
        </Button>
      </div>
      <p className={styles.hint}>
        Видят только «Обучение» и «Инструменты». Проектов, комнат, команды и цен партнёров у них нет.
      </p>
      {open ? (
        <div id="admin-add-stp-manager" className={addStyles.addPartnerWrap}>
          <form className={addStyles.addPartnerForm} onSubmit={(e) => void onCreate(e)}>
            <h3>Новый менеджер StP</h3>
            <div className={styles.grid2}>
              <label className={styles.field}>
                Логин
                <input value={login} onChange={(e) => setLogin(e.target.value)} required autoComplete="off" />
              </label>
              <label className={styles.field}>
                Пароль
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                />
              </label>
              <label className={styles.field}>
                Имя
                <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
              </label>
            </div>
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
      {rows === null && !loadError ? <Skeleton count={2} label="Загрузка менеджеров StP" /> : null}
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
        {(rows || []).map((row) => (
          <div key={row.id} className={styles.tableRow} data-stp-manager={row.login}>
            <div>
              <strong>{row.displayName}</strong>
              <div className={styles.hint}>
                {row.login}
                {row.lastLogin ? ` · вход ${new Date(row.lastLogin).toLocaleDateString('ru-RU')}` : ''}
              </div>
            </div>
            <div className={styles.rowActions}>
              <button type="button" className={styles.ghost} onClick={() => void onReset(row)}>
                Новый пароль
              </button>
              <button type="button" className={styles.danger} onClick={() => void onDelete(row)}>
                Удалить
              </button>
            </div>
          </div>
        ))}
        {rows && !rows.length ? <p className={styles.lead}>Пока нет менеджеров StP</p> : null}
      </div>
    </div>
  );
}
