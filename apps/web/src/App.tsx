import { PageTransition } from './partner/motionBits';
import { Skeleton } from './partner/Skeleton';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { SessionProvider } from './state/SessionContext';
import { AppShell } from './app-shell/AppShell';
import { InstallPromptHost } from './app-shell/InstallAppButton';
import { SmoothScroll } from './ui/SmoothScroll';
import { CookieNotice } from './analytics';
import { canCreateObjects, type SessionUser } from '../../../packages/shared/partner';
import { isCabinetCalcMessage, withAreaChoice, type CabinetCalcMessage } from './partner/cabinetCalc';
import { SaveDestination } from './partner/commercial/SaveDestination';
import { chosenArea, saveSummary, type SaveDraftView, type SaveIntent } from './partner/commercial/saveDestination';
import { claimSave, creationIdempotencyKey, releaseSave } from './partner/idempotency';
import { buildEstimateFromOrg } from './partner/estimate';
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
  backLabel,
  onSave,
  saveLabel = 'Куда сохранить?',
}: {
  route: 'problemomer' | 'calculator';
  company: string;
  caption: string;
  notice: string | null;
  onCabinet: () => void;
  onLogout: () => void;
  backLabel: string;
  onSave?: (() => void) | null;
  saveLabel?: string;
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
    <>
    <div className={styles.toolBar}>
      <button type="button" className={`${styles.toolIconBtn} ${styles.toolBack}`} onClick={onCabinet} aria-label={backLabel}>
        <ChevronLeftIcon />
        <span>{backLabel}</span>
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
    {onSave ? (
      <div className={styles.toolSaveRow}>
        <button type="button" className={`${styles.primary} ${styles.toolSaveBtn}`} onClick={onSave}>
          {saveLabel}
        </button>
      </div>
    ) : null}
    </>
  );
}

function PartnerShell() {
  const {
    user,
    loading,
    noteTool,
    logout,
    objects,
    projects,
    calcRequest,
    attachCalculation,
    requestCalculator,
    diagnosisRequest,
    clearDiagnosis,
    openObject,
    enterToday,
    createProject,
    saveObject,
    unsavedConsult,
    rememberConsult,
  } = usePartner();
  const [route, setRoute] = useState<Route>('cabinet');
  const [calcObjectId, setCalcObjectId] = useState<string | null>(null);
  const [calcNotice, setCalcNotice] = useState<string | null>(null);
  const [calcDraft, setCalcDraft] = useState<CabinetCalcMessage | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [consultOpen, setConsultOpen] = useState(false);
  const [linkedRoomId, setLinkedRoomId] = useState<string | null>(null);
  const [returnRoomId, setReturnRoomId] = useState<string | null>(null);
  const linkedRoomRef = useRef<string | null>(null);
  const returnRoomRef = useRef<string | null>(null);
  const saveLock = useRef(false);

  function rememberLinkedRoom(id: string | null) {
    linkedRoomRef.current = id;
    setLinkedRoomId(id);
  }

  function rememberReturnRoom(id: string | null) {
    returnRoomRef.current = id;
    setReturnRoomId(id);
  }

  useEffect(() => {
    if (user) return;
    rememberLinkedRoom(null);
    rememberReturnRoom(null);
    setCalcObjectId(null);
    setCalcNotice(null);
    setRoute('cabinet');
  }, [user]);

  useEffect(() => {
    if (!calcRequest || !user) return;
    rememberLinkedRoom(calcRequest.objectId);
    rememberReturnRoom(calcRequest.objectId);
    setCalcObjectId(calcRequest.objectId);
    setCalcNotice(null);
    if (user) noteTool('calculator');
    setRoute('calculator');
  }, [calcRequest, noteTool, user]);

  useEffect(() => {
    if (!diagnosisRequest || !user) return;
    rememberReturnRoom(diagnosisRequest.objectId);
    noteTool('problemomer');
    setRoute('problemomer');
  }, [diagnosisRequest, noteTool, user]);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (!isCabinetCalcMessage(event.data)) return;
      if (!user || !canCreateObjects(user.role)) return;
      const areaOnly = Boolean(event.data.areaEstimate || event.data.inputMode === 'area' || event.data.hasScheme === false);
      const area = Number(event.data.areaM2);
      setCalcDraft(event.data);
      if (!(area > 0)) {
        setCalcNotice('Площадь должна быть больше нуля');
        return;
      }
      const linked = Boolean(linkedRoomRef.current);
      setCalcNotice(
        linked
          ? 'Расчёт готов. В комнату он попадёт после «Сохранить в комнату».'
          : areaOnly
            ? 'Предварительный расчёт готов. Комната не создана — выберите, куда сохранить.'
            : 'Смета готова. Комната не создана — выберите, куда сохранить.',
      );
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [user]);

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

  function leaveTool() {
    const room = returnRoomRef.current;
    if (room) openObject(room);
    else enterToday();
    setRoute('cabinet');
  }

  function saveKey(intent: SaveIntent, draft: CabinetCalcMessage): string {
    return creationIdempotencyKey(
      JSON.stringify({
        area: draft.areaM2,
        panels: draft.panels,
        mode: intent.mode,
        roomId: intent.roomId,
        projectName: intent.projectName.trim(),
        roomName: intent.roomName.trim(),
        phone: intent.phone.trim(),
        address: intent.address.trim(),
        areaChoice: intent.areaChoice,
      }),
    );
  }

  async function saveIntoLinkedRoom() {
    if (!user || !calcDraft || !linkedRoomRef.current) return;
    if (!claimSave(saveLock)) return;
    const roomId = linkedRoomRef.current;
    setSaveBusy(true);
    try {
      const saved = await attachCalculation(calcDraft, roomId);
      if (!saved) throw new Error('Не удалось записать расчёт в комнату');
      setCalcDraft(null);
      setCalcNotice('Расчёт записан в комнату');
      rememberReturnRoom(saved.id);
    } catch (error) {
      setCalcNotice(error instanceof Error ? error.message : 'Не удалось сохранить');
    } finally {
      releaseSave(saveLock);
      setSaveBusy(false);
    }
  }

  async function confirmCalcSave(intent: SaveIntent) {
    if (!user || !calcDraft) return;
    if (!claimSave(saveLock)) return;
    const key = saveKey(intent, calcDraft);
    const area = chosenArea(intent, calcDraft.areaM2 ?? null);
    const message =
      intent.areaChoice === 'room' && area != null ? withAreaChoice(calcDraft, area, user.org) : { ...calcDraft, areaM2: area };
    setSaveBusy(true);
    try {
      let roomId = intent.roomId;
      let known = roomId ? objects.find((obj) => obj.id === roomId) || null : null;
      if (intent.mode === 'new') {
        const project = await createProject(
          {
            name: intent.projectName.trim(),
            clientName: intent.projectName.trim(),
            clientPhone: intent.phone.trim(),
            address: intent.address.trim(),
            city: user.org?.city || '',
          },
          key,
        );
        known = await saveObject({
          projectId: project.id,
          roomName: intent.roomName.trim(),
          clientName: intent.projectName.trim(),
          clientPhone: intent.phone.trim(),
          address: intent.address.trim(),
          city: user.org?.city || '',
          status: 'measured',
          room: { areaM2: message.areaM2 ?? null, roomTypeCustom: intent.roomName.trim() },
          clientSummary:
            message.areaEstimate || message.inputMode === 'area' || message.hasScheme === false
              ? `Предварительный расчёт · ${message.areaM2 ?? '—'} м² · без схемы`
              : `Расчёт со схемой · ${message.areaM2 ?? '—'} м²`,
        }, `${key}:room`);
        roomId = known.id;
      }
      if (!roomId) return;
      const saved = await attachCalculation(message, roomId, known);
      if (!saved) throw new Error('Не удалось записать расчёт в комнату');
      setCalcDraft(null);
      setSaveOpen(false);
      setCalcNotice(null);
      rememberReturnRoom(saved.id);
      rememberLinkedRoom(saved.id);
      openObject(saved.id);
      setRoute('cabinet');
    } catch (error) {
      setCalcNotice(error instanceof Error ? error.message : 'Не удалось сохранить');
    } finally {
      releaseSave(saveLock);
      setSaveBusy(false);
    }
  }

  async function confirmConsultSave(intent: SaveIntent) {
    if (!user || !unsavedConsult) return;
    if (!claimSave(saveLock)) return;
    const key = creationIdempotencyKey(
      JSON.stringify({
        area: unsavedConsult.areaM2,
        summary: unsavedConsult.summary,
        mode: intent.mode,
        roomId: intent.roomId,
        projectName: intent.projectName.trim(),
        roomName: intent.roomName.trim(),
      }),
    );
    setSaveBusy(true);
    try {
      const area = chosenArea(intent, unsavedConsult.areaM2);
      const rebuilt = area != null ? buildEstimateFromOrg(area, user.org) : null;
      const estimate = rebuilt
        ? {
            panels: rebuilt.panels,
            dowels: rebuilt.dowels,
            panelsCost: rebuilt.panelsCost,
            installCost: rebuilt.installCost,
            dowelsCost: rebuilt.dowelsCost,
            totalCost: rebuilt.totalCost,
          }
        : unsavedConsult.totalCost != null
          ? {
              panels: unsavedConsult.panels || 0,
              dowels: 0,
              panelsCost: unsavedConsult.totalCost,
              totalCost: unsavedConsult.totalCost,
            }
          : null;
      let roomId = intent.roomId;
      if (intent.mode === 'new') {
        const project = await createProject(
          {
            name: intent.projectName.trim(),
            clientName: intent.projectName.trim(),
            clientPhone: intent.phone.trim(),
            address: intent.address.trim(),
            city: user.org?.city || '',
          },
          key,
        );
        const created = await saveObject({
          projectId: project.id,
          roomName: intent.roomName.trim(),
          clientName: intent.projectName.trim(),
          clientPhone: intent.phone.trim(),
          address: intent.address.trim(),
          city: user.org?.city || '',
          status: 'measured',
          clientSummary: unsavedConsult.summary,
          room: { areaM2: area, roomTypeCustom: intent.roomName.trim() },
          estimate,
        }, `${key}:room`);
        roomId = created.id;
      } else if (roomId) {
        const existing = objects.find((obj) => obj.id === roomId);
        await saveObject({
          ...(existing || {}),
          id: roomId,
          clientSummary: unsavedConsult.summary || existing?.clientSummary || '',
          room: { ...(existing?.room || {}), areaM2: area },
          estimate: estimate || existing?.estimate || null,
        });
      }
      rememberConsult(null);
      setConsultOpen(false);
      if (roomId) openObject(roomId);
    } catch (error) {
      setCalcNotice(error instanceof Error ? error.message : 'Не удалось сохранить');
    } finally {
      releaseSave(saveLock);
      setSaveBusy(false);
    }
  }

  const consultView: SaveDraftView | null = unsavedConsult
    ? {
        tool: 'problemomer',
        areaM2: unsavedConsult.areaM2,
        totalCost: unsavedConsult.totalCost,
        hasProfile: true,
        preliminary: unsavedConsult.totalCost != null,
        hasScheme: false,
      }
    : null;

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
        {calcDraft ? (
          <div className={styles.unsavedBar}>
            <p>{saveSummary(calcDraftView(calcDraft)).join(' · ') || 'Расчёт ещё не записан в комнату.'}</p>
            <button
              type="button"
              className={styles.primary}
              disabled={saveBusy}
              onClick={() => {
                if (linkedRoomId) void saveIntoLinkedRoom();
                else setSaveOpen(true);
              }}
            >
              {linkedRoomId ? 'Сохранить в комнату' : 'Куда сохранить?'}
            </button>
          </div>
        ) : null}
        {consultView ? (
          <div className={styles.unsavedBar}>
            <p>Результат консультации ещё не записан в комнату.</p>
            <button
              type="button"
              className={styles.primary}
              disabled={saveBusy}
              onClick={() => {
                if (!returnRoomId) {
                  setConsultOpen(true);
                  return;
                }
                const room = objects.find((item) => item.id === returnRoomId);
                void confirmConsultSave({
                  mode: 'existing',
                  projectId: room?.projectId || null,
                  roomId: returnRoomId,
                  projectName: '',
                  roomName: room?.roomName || '',
                  phone: '',
                  address: '',
                  areaChoice: null,
                  roomAreaM2: room?.room.areaM2 ?? null,
                });
              }}
            >
              {returnRoomId ? 'Сохранить в комнату' : 'Куда сохранить?'}
            </button>
          </div>
        ) : null}
        <CabinetScreen
          onNavigate={(r) => {
            if (r === 'calculator') {
              rememberReturnRoom(null);
              rememberLinkedRoom(null);
              enterToday();
              requestCalculator(null);
              return;
            }
            if (r === 'problemomer') {
              rememberReturnRoom(null);
              enterToday();
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
        backLabel={returnRoomId ? 'Назад в комнату' : 'Назад'}
        saveLabel={linkedRoomId ? 'Сохранить в комнату' : 'Куда сохранить?'}
        onSave={
          route === 'calculator' && calcDraft
            ? () => {
                if (saveLock.current) return;
                if (linkedRoomId) void saveIntoLinkedRoom();
                else setSaveOpen(true);
              }
            : null
        }
        onCabinet={leaveTool}
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

  return (
    <ShellFrame install={!user || route === 'cabinet'}>
      <PageTransition pageKey={`${user?.id || 'login'}-${route}`}>{body}</PageTransition>
      {saveOpen && calcDraft ? (
        <SaveDestination
          presentation="dialog"
          draft={calcDraftView(calcDraft)}
          projects={projects}
          rooms={objects}
          busy={saveBusy}
          notice={calcNotice}
          onCancel={() => setSaveOpen(false)}
          onConfirm={confirmCalcSave}
        />
      ) : null}
      {consultOpen && consultView ? (
        <SaveDestination
          presentation="dialog"
          draft={consultView}
          projects={projects}
          rooms={objects}
          busy={saveBusy}
          onCancel={() => setConsultOpen(false)}
          onConfirm={confirmConsultSave}
        />
      ) : null}
    </ShellFrame>
  );
}

function calcDraftView(message: CabinetCalcMessage): SaveDraftView {
  const area = Number(message.areaM2);
  const cost = Number(message.panelsCost);
  const areaOnly = Boolean(message.areaEstimate || message.inputMode === 'area' || message.hasScheme === false);
  return {
    tool: 'calculator',
    areaM2: Number.isFinite(area) ? area : null,
    totalCost: Number.isFinite(cost) ? cost : null,
    hasProfile: false,
    preliminary: areaOnly,
    hasScheme: !areaOnly,
  };
}

export default function App() {
  return (
    <PartnerProvider>
      <PartnerShell />
    </PartnerProvider>
  );
}
