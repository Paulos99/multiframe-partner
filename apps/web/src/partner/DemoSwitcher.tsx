import { useState } from 'react';
import { DEMO_ACCOUNTS } from './demoSeed';
import { usePartner } from './PartnerContext';
import styles from './partner.module.css';

export function isDemoModeEnabled(): boolean {
  try {
    if (import.meta.env.VITE_DEMO_MODE === 'true') return true;
    if (typeof window !== 'undefined') {
      const q = new URLSearchParams(window.location.search);
      if (q.get('demo') === '1') return true;
      if (localStorage.getItem('mf_demo_mode') === '1') return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

export function DemoLoginPicker() {
  const { login, loading } = usePartner();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  if (!isDemoModeEnabled()) return null;

  async function enter(loginName: string, password: string) {
    setErr(null);
    setBusy(loginName);
    try {
      await login(loginName, password);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Не удалось войти');
    } finally {
      setBusy(null);
    }
  }

  const stp = DEMO_ACCOUNTS.filter((a) => a.role === 'admin');
  const companyA = DEMO_ACCOUNTS.filter((a) => a.company === 'Потолки Столицы');
  const companyB = DEMO_ACCOUNTS.filter((a) => a.company === 'Северный Потолок');

  return (
    <div className={styles.demoPicker}>
      <h2>Демо-режим</h2>
      <p className={styles.lead}>
        Один клик — вход в кабинет роли. Для показа руководству.
      </p>
      {err ? (
        <p className={styles.error} role="alert">
          {err}
        </p>
      ) : null}
      <div className={styles.demoGroup}>
        <span className={styles.demoGroupTitle}>StP</span>
        <div className={styles.demoButtons}>
          {stp.map((a) => (
            <button
              key={a.login}
              type="button"
              className={styles.demoBtn}
              disabled={loading || busy != null}
              onClick={() => void enter(a.login, a.password)}
            >
              {busy === a.login ? '…' : a.label}
            </button>
          ))}
        </div>
      </div>
      <div className={styles.demoGroup}>
        <span className={styles.demoGroupTitle}>Потолки Столицы · Москва</span>
        <div className={styles.demoButtons}>
          {companyA.map((a) => (
            <button
              key={a.login}
              type="button"
              className={styles.demoBtn}
              disabled={loading || busy != null}
              onClick={() => void enter(a.login, a.password)}
            >
              {busy === a.login ? '…' : a.label.replace(' · Потолки Столицы', '')}
            </button>
          ))}
        </div>
      </div>
      <div className={styles.demoGroup}>
        <span className={styles.demoGroupTitle}>Северный Потолок · СПб</span>
        <div className={styles.demoButtons}>
          {companyB.map((a) => (
            <button
              key={a.login}
              type="button"
              className={styles.demoBtn}
              disabled={loading || busy != null}
              onClick={() => void enter(a.login, a.password)}
            >
              {busy === a.login ? '…' : a.label.replace(' · Северный Потолок', '')}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function DemoSwitcherFab() {
  const { user, login, loading } = usePartner();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!isDemoModeEnabled() || !user) return null;

  async function switchTo(loginName: string, password: string) {
    setBusy(true);
    try {
      await login(loginName, password);
      setOpen(false);
    } catch {
      /* keep open */
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.demoFabWrap}>
      {open ? (
        <div className={styles.demoFabPanel} role="dialog" aria-label="Демо-режим">
          <div className={styles.demoFabHead}>
            <strong>Демо · сменить роль</strong>
            <button type="button" className={styles.ghost} onClick={() => setOpen(false)}>
              ✕
            </button>
          </div>
          <div className={styles.demoFabList}>
            {DEMO_ACCOUNTS.map((a) => (
              <button
                key={a.login}
                type="button"
                className={styles.demoBtn}
                data-active={user.login === a.login ? '1' : undefined}
                disabled={busy || loading || user.login === a.login}
                onClick={() => void switchTo(a.login, a.password)}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <button
        type="button"
        className={styles.demoFab}
        onClick={() => setOpen((v) => !v)}
        title="Демо-режим"
      >
        Демо
      </button>
    </div>
  );
}
