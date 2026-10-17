import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { SessionProvider } from './state/SessionContext';
import { AppShell } from './app-shell/AppShell';
import { InstallAppButton } from './app-shell/InstallAppButton';
import { SmoothScroll } from './ui/SmoothScroll';
import { CookieNotice } from './analytics';
import { canSeePrices } from '../../../packages/shared/partner';
import { calcUrlFromOrg, PartnerProvider, usePartner } from './partner/PartnerContext';
import { LoginScreen } from './partner/LoginScreen';
import { CabinetScreen } from './partner/CabinetScreen';
import { DemoSwitcherFab } from './partner/DemoSwitcher';
import { SyncStatus } from './partner/SyncStatus';
import styles from './partner/partner.module.css';

type Route = 'cabinet' | 'problemomer' | 'calculator';

function ToolBar({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const apply = () => document.documentElement.style.setProperty('--mf-toolbar-h', `${el.offsetHeight}px`);
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.setProperty('--mf-toolbar-h', '0px');
    };
  }, []);
  return (
    <div className={styles.toolBar} ref={ref}>
      {children}
    </div>
  );
}

function ShellFrame({ children }: { children: ReactNode }) {
  return (
    <>
      <InstallAppButton />
      {children}
    </>
  );
}

function PartnerShell() {
  const { user, loading, noteTool, logout } = usePartner();
  const [route, setRoute] = useState<Route>('cabinet');
  const hidePrices = user ? !canSeePrices(user.role) : false;

  useEffect(() => {
    try {
      document.body.classList.toggle('theme-dark', localStorage.getItem('mf_theme') === 'dark');
    } catch {
      /* ignore */
    }
  }, []);

  const calcSrc = useMemo(() => {
    if (!user) return '';
    return calcUrlFromOrg(user.org, user.org?.companyName, { hidePrices });
  }, [
    user,
    hidePrices,
    user?.org?.panelPriceRub,
    user?.org?.pricePerM2,
    user?.org?.installPricePerM2,
    user?.org?.dowelPriceRub,
    user?.org?.dowelsPerPanel,
    user?.org?.companyName,
  ]);

  let body: ReactNode;
  if (loading && !user) {
    body = (
      <div className={styles.shell}>
        <p className={styles.lead}>Загрузка…</p>
      </div>
    );
  } else if (!user) {
    body = <LoginScreen />;
  } else if (route === 'cabinet') {
    body = (
      <>
        <CabinetScreen
          onNavigate={(r) => {
            if (r === 'calculator') noteTool('calculator');
            if (r === 'problemomer') noteTool('problemomer');
            setRoute(r);
          }}
        />
        <DemoSwitcherFab />
      </>
    );
  } else if (route === 'calculator') {

    body = (
      <div className={styles.toolHost}>
        <ToolBar>
          <button type="button" onClick={() => setRoute('cabinet')}>
            ← Кабинет
          </button>
          <button type="button" onClick={() => setRoute('problemomer')}>
            Проблемомер
          </button>
          <button type="button" className={styles.logoutBtn} onClick={logout} title="Смена сотрудника">
            Выйти
          </button>
          <SyncStatus />
          <span className={styles.toolBarMeta}>
            {user.org?.companyName || user.displayName}
            {!hidePrices && user.org?.panelPriceRub != null
              ? ` · РРЦ ${user.org.panelPriceRub} ₽`
              : hidePrices
                ? ' · без цен'
                : ''}
          </span>
        </ToolBar>
        {calcSrc ? (
          <iframe
            title="Калькулятор MultiFrame · партнёр"
            className={styles.calcFrame}
            src={calcSrc}
            allow="clipboard-write"
          />
        ) : (
          <div className={styles.shell}>
            <p className={styles.lead}>Нет параметров для калькулятора</p>
          </div>
        )}
        <DemoSwitcherFab />
      </div>
    );
  } else {
    body = (
    <div className={styles.toolHost}>
      <ToolBar>
        <button type="button" onClick={() => setRoute('cabinet')}>
          ← Кабинет
        </button>
        <button
          type="button"
          onClick={() => {
            noteTool('calculator');
            setRoute('calculator');
          }}
        >
          Калькулятор
        </button>
        <button type="button" className={styles.logoutBtn} onClick={logout} title="Смена сотрудника">
          Выйти
        </button>
        <SyncStatus />
        <span className={styles.toolBarMeta}>{user.org?.companyName || user.displayName}</span>
      </ToolBar>
      <SmoothScroll>
        <SessionProvider>
          <AppShell />
          <CookieNotice />
        </SessionProvider>
      </SmoothScroll>
      <DemoSwitcherFab />
    </div>
    );
  }

  return <ShellFrame>{body}</ShellFrame>;
}

export default function App() {
  return (
    <PartnerProvider>
      <PartnerShell />
    </PartnerProvider>
  );
}
