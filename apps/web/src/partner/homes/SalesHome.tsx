import { useMemo, useState } from 'react';
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
import { CommercialPanel } from '../commercial/CommercialPanel';
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
  const [catalog, setCatalog] = useState(() => api.cabinetEntry === 'room' && Boolean(api.openedObjectId));
  const [focusProjectId, setFocusProjectId] = useState<string | null>(null);
  const [focusRoomId, setFocusRoomId] = useState<string | null>(() =>
    api.cabinetEntry === 'room' ? api.openedObjectId : null,
  );
  const [openedProjectId, setOpenedProjectId] = useState<string | null>(null);
  const { deals, loading: dealsLoading, refresh } = useCommercialDeals({
    user,
    objects: api.objects,
    projects: api.projects,
  });

  const actions = useMemo(
    () => nextActionsForRole('sales', api.objects, deals),
    [api.objects, deals],
  );
  const queueLoading = Boolean(api.objectsLoading || dealsLoading);
  const openedDealId = useMemo(() => {
    if (!openedProjectId) return null;
    return (
      deals.find((deal) => deal.projectId === openedProjectId && !deal.outcome)?.id ||
      deals.find((deal) => deal.projectId === openedProjectId)?.id ||
      null
    );
  }, [deals, openedProjectId]);

  function openAction(action: NextAction) {
    setFocusProjectId(action.projectId || null);
    setFocusRoomId(action.objectId || null);
    if (action.objectId) api.openObject(action.objectId);
    setCatalog(true);
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
      {tab === 'deals' ? (
        <TabPanel>
          <FadeRise key={catalog ? 'catalog' : 'today'}>
            {catalog ? (
              <div className={styles.salesHome}>
                <button
                  type="button"
                  className={styles.salesLink}
                  onClick={() => {
                    api.enterToday();
                    setCatalog(false);
                  }}
                >
                  К сегодняшним задачам
                </button>
                <RoleWorkspace
                  focusProjectId={focusProjectId}
                  focusRoomId={focusRoomId}
                  onOpened={(selection) => setOpenedProjectId(selection.projectId)}
                  onCreate={() => onNavigate('problemomer')}
                />
                {openedProjectId ? (
                  <CommercialPanel
                    projectId={openedProjectId}
                    dealId={openedDealId}
                    staff={staff.map((person) => ({
                      id: person.id,
                      label: person.displayName || person.login,
                      role: person.role,
                    }))}
                    onDealChanged={refresh}
                    dealsLoading={dealsLoading}
                  />
                ) : (
                  <p className={styles.lead}>Откройте проект — коммерческие действия относятся к нему.</p>
                )}
              </div>
            ) : (
              <div className={styles.salesHome}>
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
                <button type="button" className={styles.salesLink} onClick={() => setCatalog(true)}>
                  Все проекты
                </button>
                <SupportRequestButton module="sales_home" />
              </div>
            )}
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
