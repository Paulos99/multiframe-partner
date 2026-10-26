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
import { EntryPoints } from '../commercial/EntryPoints';
import { WorkToday } from '../commercial/WorkToday';
import { nextActionsForRole } from '../commercial/nextActions';
import { DealIndex } from '../commercial/DealIndex';
import { DealScreen } from '../commercial/DealScreen';
import { projectsOf, roomsOf } from '../commercial/commercialPort';
import { sessionBook } from '../commercial/demoBook';
import { SupportRequestButton } from '../SupportRequestButton';
import { useCommercialDeals } from '../commercial/useCommercialDeals';

import {
  roleHeading,
  SyncBadge,
  withToolsItem,
  TabPanel,
  FrameBody,
  profileOf,
  type CabinetRoute,
} from './cabinetShared';

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
  const { deals, refresh } = useCommercialDeals({
    user,
    objects: api.objects,
    projects: api.projects,
  });
  const [openedProject, setOpenedProject] = useState<string | null>(null);
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

  const openDeals = deals.filter((d) => !d.outcome).length;

  const salesNav: SideItem[] = [
    {
      id: 'deals',
      label: `Сделки · ${openDeals || api.objects.length}`,
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
      lead="Сегодня в работе · сделки и КП"
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
      {tab === 'deals' && openedProject ? (
        <DealScreen
          projectId={openedProject}
          catalog={catalog}
          demo={demo}
          role={user.role}
          onBack={() => setOpenedProject(null)}
          onChanged={refresh}
        />
      ) : null}
      {tab === 'deals' && !openedProject ? (
        <TabPanel>
          <WorkToday
            actions={actions}
            onOpen={(action) => {
              const projectId = action.projectId || deals.find((deal) => deal.id === action.dealId)?.projectId;
              if (projectId) setOpenedProject(projectId);
            }}
          />
          <DealIndex projects={catalog.projects} deals={deals} onOpen={setOpenedProject} />
          <SupportRequestButton module="sales_home" />
          <RoleWorkspace onCreate={() => onNavigate('problemomer')} />
          <EntryPoints
            onSelect={(_id, route) => {
              if (route === 'calculator') onOpenCalc();
              else onNavigate('problemomer');
            }}
          />
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
            onProblemomer={() => onNavigate('problemomer')}
            onCalculator={onOpenCalc}
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
