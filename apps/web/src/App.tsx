import { useState } from 'react';
import { SessionProvider } from './state/SessionContext';
import { AppShell } from './app-shell/AppShell';
import { SmoothScroll } from './ui/SmoothScroll';
import { CookieNotice } from './analytics';
import { PartnerProvider, usePartner } from './partner/PartnerContext';
import { LoginScreen } from './partner/LoginScreen';
import { CabinetScreen } from './partner/CabinetScreen';
import styles from './partner/partner.module.css';

type Route = 'cabinet' | 'problemomer' | 'calculator';

function PartnerShell() {
  const { user, loading } = usePartner();
  const [route, setRoute] = useState<Route>('cabinet');

  if (loading && !user) {
    return (
      <div className={styles.shell}>
        <p className={styles.lead}>Загрузка…</p>
      </div>
    );
  }

  if (!user) return <LoginScreen />;

  if (route === 'cabinet') {
    return <CabinetScreen onNavigate={setRoute} />;
  }

  // Calculator opens via full navigation from cabinet (calcUrlFromOrg).
  // Keep problemomer embed here.
  return (
    <div>
      <div className={styles.toolBar}>
        <button type="button" onClick={() => setRoute('cabinet')}>
          ← Кабинет
        </button>
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
