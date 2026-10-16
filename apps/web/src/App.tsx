import { useEffect, useMemo, useState } from 'react';
import { SessionProvider } from './state/SessionContext';
import { AppShell } from './app-shell/AppShell';
import { SmoothScroll } from './ui/SmoothScroll';
import { CookieNotice } from './analytics';
import { canSeePrices } from '../../../packages/shared/partner';
import { calcUrlFromOrg, PartnerProvider, usePartner } from './partner/PartnerContext';
import { LoginScreen } from './partner/LoginScreen';
import { CabinetScreen } from './partner/CabinetScreen';
import styles from './partner/partner.module.css';

type Route = 'cabinet' | 'problemomer' | 'calculator';

function PartnerShell() {
  const { user, loading, noteTool, logout, pendingSyncCount, flushObjectQueue } = usePartner();
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

  if (loading && !user) {
    return (
      <div className={styles.shell}>
        <p className={styles.lead}>Загрузка…</p>
      </div>
    );
  }

  if (!user) return <LoginScreen />;

  if (route === 'cabinet') {
    return (
      <CabinetScreen
        onNavigate={(r) => {
          if (r === 'calculator') noteTool('calculator');
          if (r === 'problemomer') noteTool('problemomer');
          setRoute(r);
        }}
      />
    );
  }

  if (route === 'calculator') {
    return (
      <div className={styles.toolHost}>
        <div className={styles.toolBar}>
          <button type="button" onClick={() => setRoute('cabinet')}>
            ← Кабинет
          </button>
          <button type="button" onClick={() => setRoute('problemomer')}>
            Проблемомер
          </button>
          <button type="button" className={styles.logoutBtn} onClick={logout} title="Смена сотрудника">
            Выйти
          </button>
          <span className={styles.toolBarMeta}>
            {user.org?.companyName || user.displayName}
            {!hidePrices && user.org?.panelPriceRub != null
              ? ` · РРЦ ${user.org.panelPriceRub} ₽`
              : hidePrices
                ? ' · без цен'
                : ''}
            {pendingSyncCount > 0 ? ` · ↻ ${pendingSyncCount}` : ''}
          </span>
        </div>
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
      </div>
    );
  }

  return (
    <div className={styles.toolHost}>
      <div className={styles.toolBar}>
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
        {pendingSyncCount > 0 ? (
          <button type="button" onClick={() => void flushObjectQueue()}>
            ↻ {pendingSyncCount}
          </button>
        ) : null}
        <span className={styles.toolBarMeta}>{user.org?.companyName || user.displayName}</span>
      </div>
      <SmoothScroll>
        <SessionProvider>
          <AppShell />
          <CookieNotice />
        </SessionProvider>
      </SmoothScroll>
    </div>
  );
}

export default function App() {
  return (
    <PartnerProvider>
      <PartnerShell />
    </PartnerProvider>
  );
}
