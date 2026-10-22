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
import { EntryPoints } from '../commercial/EntryPoints';
import { WorkToday } from '../commercial/WorkToday';
import { nextActionsForRole } from '../commercial/nextActions';
import { CommercialPanel } from '../commercial/CommercialPanel';

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
  const actions = useMemo(
    () => nextActionsForRole('sales', api.objects, []),
    [api.objects],
  );

  const salesNav: SideItem[] = [
    { id: 'deals', label: `Сделки · ${api.objects.length}`, active: tab === 'deals', onSelect: () => setTab('deals') },
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
      {tab === 'deals' ? (
        <TabPanel>
          <WorkToday actions={actions} />
          <EntryPoints
            onSelect={(_id, route) => {
              if (route === 'calculator') onOpenCalc();
              else onNavigate('problemomer');
            }}
          />
          <CommercialPanel
            projectId={api.objects[0]?.projectId || null}
            dealId={null}
            staff={staff.map((s) => ({
              id: s.id,
              label: s.displayName || s.login,
              role: s.role,
            }))}
          />
          <RoleWorkspace onCreate={() => onNavigate('problemomer')} />
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
