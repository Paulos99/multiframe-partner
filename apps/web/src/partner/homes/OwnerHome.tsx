import { useMemo, useState, type FormEvent } from 'react';
import {
  OFFICIAL_PANEL_PRICE_RUB,
  OFFICIAL_PRICE_PER_M2,
} from '../../../../../packages/shared/partner';
import { Button } from '../../ui/Button';
import { AnalyticsDashboard } from '../AnalyticsDashboard';
import { CityField } from '../CityField';
import { HelpTrainingPanel } from '../HelpTrainingPanel';
import { RoleWorkspace } from '../RoleOverview';
import { StaffPanel } from '../StaffPanel';
import { usePartner } from '../PartnerContext';
import { InstallAppButton } from '../../app-shell/InstallAppButton';
import { CabinetChrome, type SideItem } from '../../app-shell/CabinetChrome';
import { ToolsPanel } from '../ToolsPanel';
import { consumeReturnToTools } from '../toolsReturn';
import { EntryPoints } from '../commercial/EntryPoints';
import { WorkToday } from '../commercial/WorkToday';
import { SupportRequestButton } from '../SupportRequestButton';
import { nextActionsForRole } from '../commercial/nextActions';
import { CommercialPanel } from '../commercial/CommercialPanel';
import { useCommercialDeals } from '../commercial/useCommercialDeals';

import {
  roleHeading,
  SyncBadge,
  withToolsItem,
  InstallHint,
  TabPanel,
  FrameBody,
  profileOf,
  type CabinetRoute,
} from './cabinetShared';
import styles from '../partner.module.css';

type Route = CabinetRoute;
type OwnerTab = 'objects' | 'company' | 'staff' | 'analytics' | 'help' | 'tools';
export function OwnerHome({
  onNavigate,
  onOpenCalc,
}: {
  onNavigate: (r: Route) => void;
  onOpenCalc: () => void;
}) {
  const api = usePartner();
  const user = api.user!;
  const [tab, setTab] = useState<OwnerTab>(() => (consumeReturnToTools() ? 'tools' : 'objects'));
  const [openedProjectId, setOpenedProjectId] = useState<string | null>(null);
  const { deals, loading: dealsLoading, refresh } = useCommercialDeals({
    user,
    objects: api.objects,
    projects: api.projects,
  });
  const actions = useMemo(
    () => nextActionsForRole('owner', api.objects, deals),
    [api.objects, deals],
  );
  const [companyName, setCompanyName] = useState(user.org?.companyName || '');
  const [city, setCity] = useState(user.org?.city || '');
  const [panelPriceRub, setPanelPriceRub] = useState(
    String(user.org?.panelPriceRub ?? OFFICIAL_PANEL_PRICE_RUB),
  );
  const [pricePerM2, setPricePerM2] = useState(
    String(user.org?.pricePerM2 ?? OFFICIAL_PRICE_PER_M2),
  );
  const [installPricePerM2, setInstallPricePerM2] = useState(
    user.org?.installPricePerM2 != null ? String(user.org.installPricePerM2) : '',
  );
  const [dowelsPerPanel, setDowelsPerPanel] = useState(String(user.org?.dowelsPerPanel || 2));
  const [dowelPriceRub, setDowelPriceRub] = useState(
    user.org?.dowelPriceRub != null ? String(user.org.dowelPriceRub) : '',
  );
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [savingOrg, setSavingOrg] = useState(false);
  const staff = api.partnerListStaff();

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    setErr(null);
    setSavingOrg(true);
    try {
      await api.saveOrg({
        companyName: companyName.trim(),
        city: city.trim(),
        panelPriceRub: Math.max(0, Number(panelPriceRub) || OFFICIAL_PANEL_PRICE_RUB),
        pricePerM2: Math.max(0, Number(pricePerM2) || OFFICIAL_PRICE_PER_M2),
        installPricePerM2: installPricePerM2 === '' ? null : Number(installPricePerM2),
        dowelsPerPanel: Math.max(1, Number(dowelsPerPanel) || 2),
        dowelPriceRub: dowelPriceRub === '' ? null : Number(dowelPriceRub),
      });
      setMsg(api.remote ? 'Сохранено в облаке' : 'Сохранено в этом браузере');
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Ошибка');
    } finally {
      setSavingOrg(false);
    }
  }

  const ownerNav: SideItem[] = [
    { id: 'objects', label: `Объекты · ${api.objects.length}`, active: tab === 'objects', onSelect: () => setTab('objects') },
    { id: 'company', label: 'Компания', active: tab === 'company', onSelect: () => setTab('company') },
    { id: 'staff', label: `Сотрудники · ${staff.length}`, active: tab === 'staff', onSelect: () => setTab('staff') },
    { id: 'analytics', label: 'Аналитика', active: tab === 'analytics', onSelect: () => setTab('analytics') },
    { id: 'help', label: 'Обучение', active: tab === 'help', onSelect: () => setTab('help') },
  ];

  return (
    <CabinetChrome
      title={roleHeading('owner', user)}
      lead={
        <>
          Сегодня в работе · прайс и команда
          {user.org?.city ? ` · ${user.org.city}` : ''}
        </>
      }
      items={withToolsItem(ownerNav, tab === 'tools', () => setTab('tools'))}
      extra={
        <>
          <SyncBadge />
          <InstallAppButton />
        </>
      }
      profile={profileOf(user, api.logout)}
    >
      <FrameBody>
      {tab === 'objects' ? (
        <TabPanel>
          {/* Kanban first: objects tab must keep the board in the first viewport
              (drag/delete e2e and day-to-day use). Commercial blocks follow. */}
          <WorkToday
            actions={actions}
            onOpen={(action) => {
              if (action.objectId) api.openObject(action.objectId);
            }}
          />
          <SupportRequestButton module="owner_home" />
          <RoleWorkspace
            onCreate={() => onNavigate('problemomer')}
            onOpened={(selection) => setOpenedProjectId(selection.projectId)}
          />
          <EntryPoints
            onSelect={(_id, route) => {
              if (route === 'calculator') onOpenCalc();
              else onNavigate('problemomer');
            }}
          />
          <CommercialPanel
            projectId={openedProjectId}
            dealId={
              deals.find((deal) => deal.projectId === openedProjectId && !deal.outcome)?.id ||
              deals.find((deal) => deal.projectId === openedProjectId)?.id ||
              null
            }
            staff={staff.map((s) => ({
              id: s.id,
              label: s.displayName || s.login,
              role: s.role,
            }))}
            onDealChanged={refresh}
            dealsLoading={dealsLoading}
          />
        </TabPanel>
      ) : null}

      {tab === 'company' ? (
        <TabPanel>
          <form className={`${styles.card} ${styles.panelCard}`} onSubmit={(e) => void onSave(e)}>
            <h2>Параметры компании</h2>
            <label className={styles.field}>
              Название компании (в PDF и КП)
              <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
            </label>
            <label className={styles.field}>
              Город в сети STP MultiFrame партнёра
              <CityField value={city} onChange={setCity} />
            </label>
            <div className={styles.grid2}>
              <label className={styles.field}>
                РРЦ панели, ₽
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={panelPriceRub}
                  onChange={(e) => setPanelPriceRub(e.target.value)}
                />
                <span className={styles.hint}>Официальная РРЦ {OFFICIAL_PANEL_PRICE_RUB} ₽</span>
              </label>
              <label className={styles.field}>
                РРЦ за м², ₽
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={pricePerM2}
                  onChange={(e) => setPricePerM2(e.target.value)}
                />
                <span className={styles.hint}>Официальная РРЦ {OFFICIAL_PRICE_PER_M2} ₽/м²</span>
              </label>
              <label className={styles.field}>
                Монтаж, ₽/м²
                <input
                  type="number"
                  min={0}
                  step={1}
                  placeholder="пусто = не показывать"
                  value={installPricePerM2}
                  onChange={(e) => setInstallPricePerM2(e.target.value)}
                />
              </label>
              <label className={styles.field}>
                Дюбелей на панель
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={dowelsPerPanel}
                  onChange={(e) => setDowelsPerPanel(e.target.value)}
                />
                <span className={styles.hint}>Запас 15% уже заложен</span>
              </label>
              <label className={styles.field}>
                Цена дюбеля, ₽
                <input
                  type="number"
                  min={0}
                  step={1}
                  placeholder="пусто = только количество"
                  value={dowelPriceRub}
                  onChange={(e) => setDowelPriceRub(e.target.value)}
                />
              </label>
            </div>
            {msg ? (
              <p className={styles.flash} role="status">
                {msg}
              </p>
            ) : null}
            {err && tab === 'company' ? (
              <p className={styles.error} role="alert">
                {err}
              </p>
            ) : null}
            <Button type="submit" loading={savingOrg} disabled={savingOrg}>
              {savingOrg ? 'Сохраняем…' : 'Сохранить'}
            </Button>
          </form>
          <InstallHint />
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
          <HelpTrainingPanel role="owner" />
        </TabPanel>
      ) : null}
      </FrameBody>
    </CabinetChrome>
  );
}
