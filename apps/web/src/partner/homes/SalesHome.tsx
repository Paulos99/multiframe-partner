import { useMemo, useState } from 'react';
import { isDemoModeEnabled } from '../DemoSwitcher';
import { HelpTrainingPanel } from '../HelpTrainingPanel';
import { RoleWorkspace } from '../RoleOverview';
import { StaffPanel } from '../StaffPanel';
import { AnalyticsDashboard } from '../AnalyticsDashboard';
import { usePartner } from '../PartnerContext';
import { InstallAppButton } from '../../app-shell/InstallAppButton';
import { CabinetChrome, type SideItem } from '../../app-shell/CabinetChrome';
import { ToolsPanel } from '../ToolsPanel';
import { consumeReturnToTools } from '../toolsReturn';
import { WorkToday } from '../commercial/WorkToday';
import { nextActionsForRole, type NextAction } from '../commercial/nextActions';
import { DealIndex } from '../commercial/DealIndex';
import { DealScreen } from '../commercial/DealScreen';
import { projectsOf, roomsOf } from '../commercial/commercialPort';
import { sessionBook } from '../commercial/demoBook';
import { SupportRequestButton } from '../SupportRequestButton';
import { useCommercialDeals } from '../commercial/useCommercialDeals';
import { FadeRise } from '../motionBits';
import { SyncStatus } from '../SyncStatus';

import {
  roleHeading,
  SyncBadge,
  withToolsItem,
  TabPanel,
  FrameBody,
  profileOf,
  type CabinetRoute,
} from './cabinetShared';
import styles from '../partner.module.css';

type Route = CabinetRoute;
export function SalesHome({
  onNavigate,
  onOpenCalc,
}: {
  onNavigate: (r: Route) => void;
  onOpenCalc: () => void;
}) {
  const api = usePartner();
  const user = api.user!;
  const staff = api.partnerListStaff();
  const [tab, setTab] = useState<'deals' | 'staff' | 'analytics' | 'help' | 'tools'>(() =>
    consumeReturnToTools() ? 'tools' : 'deals',
  );
  const [openedProject, setOpenedProject] = useState<string | null>(null);
  const [indexOpen, setIndexOpen] = useState(false);
  const [roomOpen, setRoomOpen] = useState(() => api.cabinetEntry === 'room' && Boolean(api.openedObjectId));
  const [focusProjectId, setFocusProjectId] = useState<string | null>(null);
  const [focusRoomId, setFocusRoomId] = useState<string | null>(() =>
    api.cabinetEntry === 'room' ? api.openedObjectId : null,
  );
  const { deals, loading: dealsLoading, refresh } = useCommercialDeals({
    user,
    objects: api.objects,
    projects: api.projects,
  });
  const demo = isDemoModeEnabled();
  const catalog = useMemo(
    () =>
      demo
        ? { projects: sessionBook().listProjects(), rooms: [] }
        : { projects: projectsOf(api.projects), rooms: roomsOf(api.objects) },
    [demo, api.projects, api.objects],
  );

  const actions = useMemo(
    () => nextActionsForRole('sales', api.objects, deals),
    [api.objects, deals],
  );
  const queueLoading = Boolean(api.objectsLoading || dealsLoading);

  function knownProject(projectId: string | null): string | null {
    if (!projectId) return null;
    if (!demo || catalog.projects.some((project) => project.id === projectId)) return projectId;
    return catalog.projects.find((project) => project.id === 'prj_before')?.id || catalog.projects[0]?.id || null;
  }

  function openDeal(projectId: string) {
    setRoomOpen(false);
    setIndexOpen(false);
    setOpenedProject(projectId);
  }

  function openAction(action: NextAction) {
    const fromDeal = action.dealId ? deals.find((deal) => deal.id === action.dealId)?.projectId : null;
    const fromRoom = action.objectId ? api.objects.find((obj) => obj.id === action.objectId)?.projectId : null;
    const projectId = knownProject(action.projectId || fromDeal || fromRoom || null);
    if (projectId) {
      openDeal(projectId);
      return;
    }
    if (action.objectId) {
      setFocusProjectId(null);
      setFocusRoomId(action.objectId);
      api.openObject(action.objectId);
      setOpenedProject(null);
      setIndexOpen(false);
      setRoomOpen(true);
    }
  }

  const salesNav: SideItem[] = [
    {
      id: 'deals',
      label: queueLoading ? 'Сегодня' : actions.length ? `Сегодня · ${actions.length}` : 'Сегодня',
      active: tab === 'deals',
      onSelect: () => setTab('deals'),
    },
    { id: 'staff', label: `Сотрудники · ${staff.length}`, active: tab === 'staff', onSelect: () => setTab('staff') },
    { id: 'analytics', label: 'Аналитика', active: tab === 'analytics', onSelect: () => setTab('analytics') },
    { id: 'help', label: 'Обучение', active: tab === 'help', onSelect: () => setTab('help') },
  ];

  return (
    <CabinetChrome
      title={roleHeading('sales', user)}
      lead="Сегодня · Продажи"
      items={withToolsItem(salesNav, tab === 'tools', () => setTab('tools'))}
      extra={
        <>
          <SyncBadge />
          <InstallAppButton />
        </>
      }
      profile={profileOf(user, api.logout)}
    >
      <FrameBody>
      {tab === 'deals' && roomOpen ? (
        <div className={styles.salesHome}>
          <button
            type="button"
            className={styles.salesLink}
            onClick={() => {
              api.enterToday();
              setRoomOpen(false);
            }}
          >
            К сегодняшним задачам
          </button>
          <RoleWorkspace
            focusProjectId={focusProjectId}
            focusRoomId={focusRoomId}
            onCreate={() => onNavigate('problemomer')}
          />
        </div>
      ) : null}
      {tab === 'deals' && !roomOpen && openedProject ? (
        <DealScreen
          projectId={openedProject}
          catalog={catalog}
          demo={demo}
          role={user.role}
          onBack={() => setOpenedProject(null)}
          onChanged={refresh}
        />
      ) : null}
      {tab === 'deals' && !roomOpen && !openedProject ? (
        <TabPanel>
          <FadeRise key={indexOpen ? 'index' : 'today'}>
            <div className={styles.salesHome}>
              {indexOpen ? (
                <>
                  <button type="button" className={styles.salesLink} onClick={() => setIndexOpen(false)}>
                    К сегодняшним задачам
                  </button>
                  <DealIndex projects={catalog.projects} deals={deals} onOpen={openDeal} />
                </>
              ) : (
                <>
                  <div className={styles.salesSync}>
                    <SyncStatus />
                  </div>
                  <WorkToday
                    title="Сегодня · Продажи"
                    actions={actions}
                    loading={queueLoading}
                    empty="Нет срочных задач — можно начать новую консультацию"
                    onOpen={openAction}
                  />
                  {!api.online ? (
                    <p className={styles.flash} role="status">
                      Нет сети. Показаны задачи, сохранённые на устройстве. Они могут быть неполными.
                    </p>
                  ) : null}
                  <div className={styles.salesDock}>
                    <button
                      type="button"
                      className={styles.primary}
                      onClick={() => {
                        api.enterToday();
                        onNavigate('problemomer');
                      }}
                    >
                      Проблемомер
                    </button>
                    <button
                      type="button"
                      className={styles.primary}
                      onClick={() => {
                        api.enterToday();
                        onOpenCalc();
                      }}
                    >
                      Калькулятор
                    </button>
                  </div>
                  <button type="button" className={styles.salesLink} onClick={() => setIndexOpen(true)}>
                    Все проекты
                  </button>
                  <SupportRequestButton module="sales_home" />
                </>
              )}
            </div>
          </FadeRise>
        </TabPanel>
      ) : null}
      {tab === 'staff' ? (
        <TabPanel>
          <StaffPanel />
        </TabPanel>
      ) : null}
      {tab === 'analytics' ? (
        <TabPanel>
          <AnalyticsDashboard mode="partner" />
        </TabPanel>
      ) : null}
      {tab === 'tools' ? (
        <TabPanel>
          <ToolsPanel
            onProblemomer={() => {
              api.enterToday();
              onNavigate('problemomer');
            }}
            onCalculator={() => {
              api.enterToday();
              onOpenCalc();
            }}
          />
        </TabPanel>
      ) : null}

      {tab === 'help' ? (
        <TabPanel>
          <HelpTrainingPanel role="sales" />
        </TabPanel>
      ) : null}
      </FrameBody>
    </CabinetChrome>
  );
}
