import { useMemo, useState } from 'react';
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
  const { partner, loading } = usePartner();
  const [route, setRoute] = useState<Route>('cabinet');

  const calcSrc = useMemo(() => {
    if (!partner) return '';
    const q = new URLSearchParams();
    if (partner.panelPriceRub != null) q.set('panelPrice', String(partner.panelPriceRub));
    if (partner.pricePerM2 != null) q.set('pricePerM2', String(partner.pricePerM2));
    if (partner.installPricePerM2 != null) q.set('installPerM2', String(partner.installPricePerM2));
    q.set('dowelsPerPanel', String(partner.dowelsPerPanel || 2));
    if (partner.dowelPriceRub != null) q.set('dowelPrice', String(partner.dowelPriceRub));
    if (partner.companyName) q.set('company', partner.companyName);
    const base = `${import.meta.env.BASE_URL}calculator/index.html`;
    return `${base}?${q.toString()}`;
  }, [partner]);

  if (loading && !partner) {
    return (
      <div className={styles.shell}>
        <p className={styles.lead}>Загрузка…</p>
      </div>
    );
  }

  if (!partner) return <LoginScreen />;

  if (route === 'cabinet') {
    return <CabinetScreen onNavigate={setRoute} />;
  }

  if (route === 'calculator') {
    return (
      <div>
        <div className={styles.toolBar}>
          <button type="button" onClick={() => setRoute('cabinet')}>
            ← Кабинет
          </button>
          <button type="button" onClick={() => setRoute('problemomer')}>
            Проблемомер
          </button>
        </div>
        <iframe title="Калькулятор MultiFrame" className={styles.calcFrame} src={calcSrc} />
      </div>
    );
  }

  return (
    <div>
      <div className={styles.toolBar}>
        <button type="button" onClick={() => setRoute('cabinet')}>
          ← Кабинет
        </button>
        <button type="button" onClick={() => setRoute('calculator')}>
          Калькулятор
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
