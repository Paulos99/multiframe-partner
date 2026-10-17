import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { SessionProvider } from './state/SessionContext';
import { AppShell } from './app-shell/AppShell';
import { InstallPromptHost } from './app-shell/InstallAppButton';
import { SmoothScroll } from './ui/SmoothScroll';
import { CookieNotice } from './analytics';
import { canCreateObjects, canSeePrices, type SessionUser } from '../../../packages/shared/partner';
import { isCabinetCalcMessage } from './partner/cabinetCalc';
import { calcUrlFromOrg, PartnerProvider, usePartner } from './partner/PartnerContext';
import { LoginScreen } from './partner/LoginScreen';
import { CabinetScreen } from './partner/CabinetScreen';
import { DemoSwitcherFab } from './partner/DemoSwitcher';
import { SyncStatus } from './partner/SyncStatus';
import styles from './partner/partner.module.css';

type Route = 'cabinet' | 'problemomer' | 'calculator';

function ShellFrame({ children, install }: { children: ReactNode; install: boolean }) {
  return <InstallPromptHost enabled={install}>{children}</InstallPromptHost>;
}

function toolCaption(user: SessionUser, hidePrices: boolean): string {
  if (hidePrices) return 'Режим монтажника · только количество';
  const org = user.org;
  const bits: string[] = [];
  if (org?.panelPriceRub != null) bits.push(`РРЦ ${org.panelPriceRub} ₽/панель`);
  if (org?.pricePerM2 != null) bits.push(`${org.pricePerM2} ₽/м²`);
  if (org?.installPricePerM2 != null) bits.push(`монтаж ${org.installPricePerM2} ₽/м²`);
  return bits.length ? bits.join(' · ') : 'Цены компании';
}

function concealCalcBanner(frame: HTMLIFrameElement) {
  try {
    const doc = frame.contentDocument;
    if (!doc?.head || doc.getElementById('mf-shell-hides-banner')) return;
    const style = doc.createElement('style');
    style.id = 'mf-shell-hides-banner';
    style.textContent = '#partnerCalcBanner{display:none !important}';
    doc.head.appendChild(style);
  } catch {
    /* калькулятор ещё не готов */
  }
}

function ToolChrome({
  route,
  company,
  caption,
  notice,
  onCabinet,
  onProblemomer,
  onCalculator,
  onLogout,
}: {
  route: 'problemomer' | 'calculator';
  company: string;
  caption: string;
  notice: string | null;
  onCabinet: () => void;
  onProblemomer: () => void;
  onCalculator: () => void;
  onLogout: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    function onPointer(event: PointerEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) setMenu(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setMenu(false);
    }
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  return (
    <div className={styles.toolBar}>
      <button type="button" className={styles.toolIconBtn} onClick={onCabinet} aria-label="Кабинет">
        <svg viewBox="0 0 24 24" aria-hidden>
          <path
            d="M14.5 5.5 8 12l6.5 6.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <div className={styles.toolSwitch} role="tablist" aria-label="Инструмент">
        <button
          type="button"
          role="tab"
          aria-selected={route === 'problemomer'}
          onClick={onProblemomer}
        >
          Проблемомер
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={route === 'calculator'}
          onClick={onCalculator}
        >
          Калькулятор
        </button>
      </div>
      <SyncStatus compact />
      <DemoSwitcherFab inline />
      <div className={styles.toolMenuWrap} ref={wrapRef}>
        <button
          type="button"
          className={styles.toolIconBtn}
          aria-label="Компания и выход"
          aria-expanded={menu}
          aria-haspopup="menu"
          onClick={() => setMenu((v) => !v)}
        >
          ⋯
        </button>
        {menu ? (
          <div className={styles.toolMenu} role="menu">
            <p className={styles.toolMenuCompany}>{company}</p>
            <p className={styles.toolMenuCaption}>{caption}</p>
            {notice ? <p className={styles.toolMenuNotice}>{notice}</p> : null}
            <button type="button" className={styles.logoutBtn} onClick={onLogout}>
              Выйти
            </button>
          </div>
        ) : null}
      </div>
      <p className="srOnly" aria-live="polite">
        {notice || ''}
      </p>
    </div>
  );
}

function PartnerShell() {
  const { user, loading, noteTool, logout, calcRequest, attachCalculation } = usePartner();
  const [route, setRoute] = useState<Route>('cabinet');
  const [calcObjectId, setCalcObjectId] = useState<string | null>(null);
  const [calcNotice, setCalcNotice] = useState<string | null>(null);
  const linkedObjectId = useRef<string | null>(null);
  const hidePrices = user ? !canSeePrices(user.role) : false;

  useEffect(() => {
    if (!calcRequest) return;
    linkedObjectId.current = calcRequest.objectId;
    setCalcObjectId(calcRequest.objectId);
    setCalcNotice(null);
    if (user) noteTool('calculator');
    setRoute('calculator');
  }, [calcRequest, noteTool, user]);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (!isCabinetCalcMessage(event.data)) return;
      if (!user || !canCreateObjects(user.role)) return;
      const target = linkedObjectId.current || event.data.objectId || null;
      setCalcNotice('Сохраняем объект и PDF…');
      void attachCalculation(event.data, target)
        .then((obj) => {
          if (obj) linkedObjectId.current = obj.id;
          setCalcNotice(obj ? 'Объект в кабинете обновлён, PDF приложен' : 'Не удалось сохранить');
        })
        .catch(() => setCalcNotice('Не удалось сохранить объект'));
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [user, attachCalculation]);

  useEffect(() => {
    try {
      document.body.classList.toggle('theme-dark', localStorage.getItem('mf_theme') === 'dark');
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (route === 'cabinet' || !user) return;
    const root = document.documentElement;
    const prevHtml = root.style.overflow;
    const prevBody = document.body.style.overflow;
    root.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    window.scrollTo(0, 0);
    return () => {
      root.style.overflow = prevHtml;
      document.body.style.overflow = prevBody;
    };
  }, [route, user]);

  const calcSrc = useMemo(() => {
    if (!user) return '';
    return calcUrlFromOrg(user.org, user.org?.companyName, { hidePrices, objectId: calcObjectId });
  }, [
    user,
    hidePrices,
    calcObjectId,
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
  } else {
    const chrome = (
      <ToolChrome
        route={route}
        company={user.org?.companyName || user.displayName}
        caption={toolCaption(user, hidePrices)}
        notice={route === 'calculator' ? calcNotice : null}
        onCabinet={() => setRoute('cabinet')}
        onProblemomer={() => {
          noteTool('problemomer');
          setRoute('problemomer');
        }}
        onCalculator={() => {
          noteTool('calculator');
          setRoute('calculator');
        }}
        onLogout={logout}
      />
    );
    body =
      route === 'calculator' ? (
        <div className={styles.toolHost}>
          {chrome}
          <div className={styles.toolBody}>
            {calcSrc ? (
              <iframe
                key={calcRequest?.nonce || 'calc'}
                title="Калькулятор MultiFrame · партнёр"
                className={styles.calcFrame}
                src={calcSrc}
                allow="clipboard-write"
                onLoad={(event) => concealCalcBanner(event.currentTarget)}
              />
            ) : (
              <div className={styles.shell}>
                <p className={styles.lead}>Нет параметров для калькулятора</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className={styles.toolHost}>
          {chrome}
          <div className={styles.toolBody}>
            <div className={styles.toolFill}>
              <SmoothScroll>
                <SessionProvider>
                  <AppShell />
                  <CookieNotice />
                </SessionProvider>
              </SmoothScroll>
            </div>
          </div>
        </div>
      );
  }

  return <ShellFrame install={!user || route === 'cabinet'}>{body}</ShellFrame>;
}

export default function App() {
  return (
    <PartnerProvider>
      <PartnerShell />
    </PartnerProvider>
  );
}
