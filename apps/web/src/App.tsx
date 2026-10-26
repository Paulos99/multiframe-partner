import { PageTransition } from './partner/motionBits';
import { Skeleton } from './partner/Skeleton';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { SessionProvider } from './state/SessionContext';
import { AppShell } from './app-shell/AppShell';
import { InstallPromptHost } from './app-shell/InstallAppButton';
import { SmoothScroll } from './ui/SmoothScroll';
import { CookieNotice } from './analytics';
import { canCreateObjects, type SessionUser } from '../../../packages/shared/partner';
import { isCabinetCalcMessage } from './partner/cabinetCalc';
import { offerFieldCalc } from './partner/field/fieldCalcGate';
import { calcUrlFromOrg, PartnerProvider, usePartner } from './partner/PartnerContext';
import { LoginScreen } from './partner/LoginScreen';
import { CabinetScreen } from './partner/CabinetScreen';
import { DemoSwitcherFab } from './partner/DemoSwitcher';
import { SyncStatus } from './partner/SyncStatus';
import { applyStoredTheme } from './app-shell/theme';
import styles from './partner/partner.module.css';
import { ChevronLeftIcon, MoreIcon } from './icons';

type Route = 'cabinet' | 'problemomer' | 'calculator';

function ShellFrame({ children, install }: { children: ReactNode; install: boolean }) {
  return <InstallPromptHost enabled={install}>{children}</InstallPromptHost>;
}

function toolCaption(user: SessionUser): string {
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
  onLogout,
}: {
  route: 'problemomer' | 'calculator';
  company: string;
  caption: string;
  notice: string | null;
  onCabinet: () => void;
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
        <ChevronLeftIcon />
      </button>
      {/* Переключатель инструментов убран: оба открываются из вкладки «Инструменты». */}
      <span className={styles.toolTitle}>{route === 'calculator' ? 'Калькулятор' : 'Проблемомер'}</span>
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
          <MoreIcon />
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
  const { user, loading, noteTool, logout, objects, calcRequest, attachCalculation, requestCalculator, diagnosisRequest, clearDiagnosis } = usePartner();
  const [route, setRoute] = useState<Route>('cabinet');
  const [calcObjectId, setCalcObjectId] = useState<string | null>(null);
  const [calcNotice, setCalcNotice] = useState<string | null>(null);
  const linkedObjectId = useRef<string | null>(null);

  useEffect(() => {
    if (user) return;
    linkedObjectId.current = null;
    setCalcObjectId(null);
    setCalcNotice(null);
    setRoute('cabinet');
  }, [user]);

  useEffect(() => {
    if (!calcRequest || !user) return;
    linkedObjectId.current = calcRequest.objectId;
    setCalcObjectId(calcRequest.objectId);
    setCalcNotice(null);
    if (user) noteTool('calculator');
    setRoute('calculator');
  }, [calcRequest, noteTool, user]);

  useEffect(() => {
    if (!diagnosisRequest || !user) return;
    noteTool('problemomer');
    setRoute('problemomer');
  }, [diagnosisRequest, noteTool, user]);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (!isCabinetCalcMessage(event.data)) return;
      if (offerFieldCalc(event.data, user?.role, user?.org, (message) => setCalcNotice(message))) {
        setCalcNotice('Расчёт по замеру отправляется в комнату');
        return;
      }
      if (!user || !canCreateObjects(user.role)) return;
      if (event.data.areaEstimate || event.data.inputMode === 'area' || event.data.hasScheme === false) return;
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
    applyStoredTheme();
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

  const calcClientName = calcObjectId
    ? objects.find((obj) => obj.id === calcObjectId)?.clientName || ''
    : '';

  const calcSrc = useMemo(() => {
    if (!user) return '';
    return calcUrlFromOrg(user.org, user.org?.companyName, {
      objectId: calcObjectId,
      clientName: calcClientName,
      areaM2: calcRequest?.objectId === calcObjectId ? calcRequest?.areaM2 : null,
    });
  }, [
    user,
    calcObjectId,
    calcClientName,
    calcRequest,
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
        <Skeleton kind="page" count={3} label="Загрузка кабинета"/>
      </div>
    );
  } else if (!user) {
    body = <LoginScreen />;
  } else if (route === 'cabinet') {
    body = (
      <>
        <CabinetScreen
          onNavigate={(r) => {
            if (r === 'calculator') {
              requestCalculator(null);
              return;
            }
            if (r === 'problemomer') {
              clearDiagnosis();
              noteTool('problemomer');
            }
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
        caption={toolCaption(user)}
        notice={route === 'calculator' ? calcNotice : null}
        onCabinet={() => setRoute('cabinet')}
        onLogout={logout}
      />
    );
    body =
      route === 'calculator' ? (
        <div className={styles.toolHost}>
          {chrome}
          {calcNotice ? <p className={styles.toolNotice} role="status">{calcNotice}</p> : null}
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

  return <ShellFrame install={!user || route === 'cabinet'}><PageTransition pageKey={`${user?.id||'login'}-${route}`}>{body}</PageTransition></ShellFrame>;
}

export default function App() {
  return (
    <PartnerProvider>
      <PartnerShell />
    </PartnerProvider>
  );
}
