import { m, motionPresets, usePrefersReducedMotion } from './motionBits';
import { useEffect, useId, useState } from 'react';
import type { DemoAccount } from './demoSeed';
import { DEMO_ACCOUNTS } from './demoSeed';
import { ShakeBox } from './motionBits';
import { usePartner } from './PartnerContext';
import styles from './DemoSwitcher.module.css';
import { CloseIcon } from '../icons';
import { isDemoModeEnabled } from './demoMode';

export { isDemoModeEnabled };

export type DemoGroup = {
  id: 'stp' | 'capital';
  title: string;
  place: string;
  accounts: DemoAccount[];
};

export function demoGroups(accounts: DemoAccount[] = DEMO_ACCOUNTS): DemoGroup[] {
  return [
    {
      id: 'stp',
      title: 'StP',
      place: 'Сеть',
      accounts: accounts.filter((account) => account.role === 'admin' || account.role === 'stp_manager'),
    },
    {
      id: 'capital',
      title: 'Потолки Столицы',
      place: 'Москва',
      accounts: accounts.filter((account) => account.company === 'Потолки Столицы'),
    },
  ];
}

export function demoRoleLabel(account: DemoAccount): string {
  if (account.role === 'admin') return 'Админ StP';
  return account.label.replace(/ · Потолки Столицы$/u, '');
}

export function demoRoleHint(account: DemoAccount): string {
  switch (account.role) {
    case 'admin':
      return 'Сеть и компании';
    case 'stp_manager':
      return 'Обучение и инструменты';
    case 'owner':
      return 'Прайс и команда';
    case 'sales':
      return 'Проекты и КП';
    case 'measurer':
      return 'Замер комнаты';
    case 'crew':
      return demoRoleLabel(account).includes('2') ? 'Вторая бригада' : 'Задания на монтаж';
    default:
      return '';
  }
}

function RoleButton({
  account,
  active,
  pending,
  disabled,
  compact,
  onPick,
}: {
  account: DemoAccount;
  active: boolean;
  pending: boolean;
  disabled: boolean;
  compact: boolean;
  onPick: (account: DemoAccount) => void;
}) {
  const label = demoRoleLabel(account);
  return (
    <button
      type="button"
      className={compact ? styles.roleCompact : styles.role}
      data-active={active ? '1' : undefined}
      data-busy={pending ? '1' : undefined}
      aria-busy={pending || undefined}
      disabled={disabled || active}
      onClick={() => onPick(account)}
    >
      <span className={styles.roleName}>
        {pending ? <span className={styles.spinner} aria-hidden="true" /> : null}
        {label}
        {active ? <span className={styles.now}>Сейчас</span> : null}
      </span>
      <span className={styles.roleHint}>{pending ? 'Входим…' : demoRoleHint(account)}</span>
    </button>
  );
}

export function DemoRoleGroups({
  activeLogin,
  busyLogin,
  disabled,
  compact = false,
  onPick,
}: {
  activeLogin?: string | null;
  busyLogin: string | null;
  disabled: boolean;
  compact?: boolean;
  onPick: (account: DemoAccount) => void;
}) {
  const prefix = useId();
  return (
    <div className={styles.groups}>
      {demoGroups().map((group) => (
        <section key={group.id} className={styles.group} aria-labelledby={`${prefix}-${group.id}`}>
          <div className={styles.groupHead}>
            <h3 id={`${prefix}-${group.id}`}>{group.title}</h3>
            <span className={styles.place}>{group.place}</span>
          </div>
          <div className={group.accounts.length > 1 && !compact ? styles.roles : styles.rolesSingle}>
            {group.accounts.map((account) => (
              <RoleButton
                key={account.login}
                account={account}
                active={activeLogin === account.login}
                pending={busyLogin === account.login}
                disabled={disabled}
                compact={compact}
                onPick={onPick}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function DemoLoginPicker() {
  const { login, loading } = usePartner();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [shake, setShake] = useState(0);

  useEffect(() => {
    if (err) setShake((n) => n + 1);
  }, [err]);

  if (!isDemoModeEnabled()) return null;

  async function enter(account: DemoAccount) {
    setErr(null);
    setBusy(account.login);
    try {
      await login(account.login, account.password, { demoAccount: true });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Не удалось войти');
    } finally {
      setBusy(null);
    }
  }

  return (
    <ShakeBox signal={shake} className={styles.picker}>
      <h2 className="srOnly">Роли для входа</h2>
      {busy ? (
        <p className={styles.status} role="status">
          <span className={styles.spinner} aria-hidden="true" />
          Входим…
        </p>
      ) : null}
      {err ? (
        <p className={styles.error} role="alert">
          {err}
        </p>
      ) : null}
      <DemoRoleGroups busyLogin={busy} disabled={loading || busy != null} onPick={(account) => void enter(account)} />
    </ShakeBox>
  );
}

export function DemoSwitcherFab({ inline = false, menu = false }: { inline?: boolean; menu?: boolean }) {
  const reduce=usePrefersReducedMotion();
  const { user, login, loading } = usePartner();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  if (!isDemoModeEnabled() || !user) return null;

  async function switchTo(account: DemoAccount) {
    setErr(null);
    setBusy(account.login);
    try {
      await login(account.login, account.password, { demoAccount: true });
      setOpen(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Не удалось войти');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={menu ? styles.menuOnly : inline ? styles.inlineWrap : styles.fabWrap}>
      {open ? (
        <m.div className={styles.panel} role="dialog" initial={reduce?false:motionPresets.modal.initial} animate={motionPresets.modal.animate} aria-label="Сменить роль">
          <div className={styles.panelHead}>
            <h2>Сменить роль</h2>
            <button type="button" className={styles.close} onClick={() => setOpen(false)} aria-label="Закрыть">
              <CloseIcon size="1em" />
            </button>
          </div>
          {busy ? (
            <p className={styles.status} role="status">
              <span className={styles.spinner} aria-hidden="true" />
              Входим…
            </p>
          ) : null}
          {err ? (
            <p className={styles.error} role="alert">
              {err}
            </p>
          ) : null}
          <DemoRoleGroups
            compact
            activeLogin={user.login}
            busyLogin={busy}
            disabled={loading || busy != null}
            onPick={(account) => void switchTo(account)}
          />
        </m.div>
      ) : null}
      <button
        type="button"
        className={menu ? styles.menuBtn : inline ? styles.inlineBtn : styles.fab}
        onClick={() => setOpen((value) => !value)}
        title="Сменить роль"
        aria-expanded={open}
      >
        {menu ? 'Сменить роль' : 'Демо'}
      </button>
    </div>
  );
}
