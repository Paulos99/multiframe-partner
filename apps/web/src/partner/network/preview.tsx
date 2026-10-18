import { useMemo, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { isStaffRole, aggregateAnalyticsDashboard, type AnalyticsEvent } from '../../../../../packages/shared/partner';
import '../../styles/global.css';
import {
  getAnalyticsFocusOrg,
  getAnalyticsPeriod,
  rangeFromYmd,
  setAnalyticsFocusOrg,
  setAnalyticsPeriod,
  subscribeAnalyticsFocusOrg,
  subscribeAnalyticsPeriod,
} from '../analytics';
import {
  buildLocalDemoAnalytics,
  buildLocalDemoObjects,
  buildLocalDemoOrgs,
  buildLocalDemoUsers,
} from '../demoSeed';
import { buildCompanyCards, type CompanyCardModel } from './companyCards';
import { PartnerNetworkBoard } from './PartnerNetwork';

const users = buildLocalDemoUsers();
const orgs = buildLocalDemoOrgs();
const partners = users
  .filter((user) => user.role === 'owner')
  .map((user) => ({
    user,
    org: orgs.find((org) => org.id === user.orgId),
    executorCount: users.filter((member) => isStaffRole(member.role) && member.orgId === user.orgId).length,
  }));
const objects = buildLocalDemoObjects().map((object) => ({
  orgId: object.orgId,
  status: object.status,
  objectStage: object.room.objectStage ?? null,
}));
const events = buildLocalDemoAnalytics() as AnalyticsEvent[];

function Preview() {
  const empty = new URLSearchParams(window.location.search).has('empty');
  const period = useSyncExternalStore(subscribeAnalyticsPeriod, getAnalyticsPeriod, getAnalyticsPeriod);
  const focusOrg = useSyncExternalStore(subscribeAnalyticsFocusOrg, getAnalyticsFocusOrg, getAnalyticsFocusOrg);
  const [opened, setOpened] = useState('');
  const companies = useMemo(() => {
    if (empty) return [];
    const { from, to } = rangeFromYmd(period.fromYmd, period.toYmd);
    const dash = aggregateAnalyticsDashboard(events, { source: 'local', from, to });
    return buildCompanyCards({ partners, objects, activity: dash.partners });
  }, [empty, period.fromYmd, period.toYmd]);

  function openCompany(company: CompanyCardModel) {
    setAnalyticsFocusOrg(company.orgId);
    setOpened(company.companyName);
  }

  return (
    <main className="previewShell">
      <PartnerNetworkBoard
        count={empty ? 0 : partners.length}
        companies={companies}
        fromYmd={period.fromYmd}
        toYmd={period.toYmd}
        onPeriodChange={setAnalyticsPeriod}
        selectedOrgId={focusOrg}
        activityCaption="Активность из локальных фикстур"
        onOpenCompany={openCompany}
        onPartners={() => setOpened('список партнёров')}
        onAdd={() => setOpened('новый партнёр')}
        onLearning={() => setOpened('материалы')}
      />
      <p className="previewLive" data-opened={opened}>
        {opened ? `Открыто: ${opened}` : ''}
      </p>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<Preview />);
