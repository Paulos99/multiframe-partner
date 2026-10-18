import { Skeleton } from './Skeleton';
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  OFFICIAL_PANEL_PRICE_RUB,
  OFFICIAL_PRICE_PER_M2,
  PARTNER_NETWORK_NAME,
  ROLE_LABELS,
  type SessionUser,
  type UserRole,
} from '../../../../packages/shared/partner';
import { Button } from '../ui/Button';
import { AnalyticsDashboard } from './AnalyticsDashboard';
import { CityField } from './CityField';
import { citiesReady, isKnownCity, loadCities } from './cityCatalog';
import { HelpTrainingPanel } from './HelpTrainingPanel';
import { RoleWorkspace } from './RoleOverview';
import { AnimatePresence, FadeRise, m, motionPresets } from './motionBits';
import { ObjectsPanel } from './ObjectsPanel';
import { StaffPanel } from './StaffPanel';
import { generatePassword, usePartner } from './PartnerContext';
import { SyncStatus } from './SyncStatus';
import { InstallAppButton } from '../app-shell/InstallAppButton';
import { CabinetChrome, type SideItem } from '../app-shell/CabinetChrome';
import { ToolsPanel } from './ToolsPanel';
import { consumeReturnToTools } from './toolsReturn';
import styles from './partner.module.css';
import addStyles from './AdminPartners.module.css';

function roleHeading(role: UserRole, user: SessionUser): string {
  const company = user.org?.companyName?.trim();
  return company ? `${ROLE_LABELS[role]} · ${company}` : user.displayName || ROLE_LABELS[role];
}

type Route = 'cabinet' | 'problemomer' | 'calculator';

function SyncBadge() {
  return <SyncStatus compact />;
}

/** Вкладки админа плюс «Инструменты» (отдельный тип, чтобы не спорить с правками списка вкладок). */
type AdminView = AdminTab | 'tools';

/** Пункт меню «Инструменты» — вторым, чтобы на телефоне был виден без прокрутки панели. */
function withToolsItem(items: SideItem[], active: boolean, onSelect: () => void): SideItem[] {
  const tools: SideItem = { id: 'tools', label: 'Инструменты', active, onSelect };
  return [...items.slice(0, 1), tools, ...items.slice(1)];
}

function InstallHint() {
  return (
    <div className={styles.hintCard}>
      <h2>Офлайн на планшете / телефоне</h2>
      <p className={styles.lead}>
        Установите кабинет на устройство: в Chrome — «Установить приложение», на iPhone —
        «Поделиться → На экран Домой». После первого открытия прайс и объекты доступны без сети;
        отправка на сервер встаёт в очередь.
      </p>
    </div>
  );
}

function TabPanel({ children }: { children: ReactNode }) {
  return <FadeRise className={styles.tabPanel}>{children}</FadeRise>;
}

function FrameBody({ children }: { children: ReactNode }) {
  return <div className={`${styles.shellWide} ${styles.framed}`}>{children}</div>;
}

function profileOf(user: SessionUser, onLogout: () => void) {
  return {
    name: user.displayName,
    role: ROLE_LABELS[user.role],
    company: user.org?.companyName,
    onLogout,
  };
}

type AdminTab = 'partners' | 'projects' | 'analytics' | 'help';

function AdminCabinet({ onNavigate }: { onNavigate: (r: Route) => void }) {
  const api = usePartner();
  const partners = useMemo(() => api.adminListPartners(), [api]);
  const [tab, setTab] = useState<AdminView>(() => (consumeReturnToTools() ? 'tools' : 'analytics'));
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [city, setCity] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [catalogReady, setCatalogReady] = useState(citiesReady());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCity, setEditCity] = useState('');
  const [savingCity, setSavingCity] = useState(false);

  useEffect(() => {
    let live = true;
    void loadCities().then(() => {
      if (live) setCatalogReady(true);
    });
    return () => {
      live = false;
    };
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setSaving(true);
    try {
      const res = await api.adminCreatePartner({ login, password, companyName, city });
      setNotice(`Создан партнёр ${res.login} · пароль: ${res.password}`);
      setLogin('');
      setPassword('');
      setCompanyName('');
      setCity('');
      setAddOpen(false);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Ошибка');
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(id: string, loginName: string, company: string, executorCount: number) {
    const ok = confirm(
      `Удалить «${company}» (${loginName})?\n` +
        `Будут удалены организация и ${executorCount} сотрудник(ов). Это необратимо.`,
    );
    if (!ok) return;
    try {
      await api.adminDeletePartner(id);
    } catch (ex) {
      alert(ex instanceof Error ? ex.message : 'Ошибка');
    }
  }

  const adminNav: SideItem[] = [
    { id: 'analytics', label: 'Аналитика', active: tab === 'analytics', onSelect: () => setTab('analytics') },
    { id: 'partners', label: `Партнёры · ${partners.length}`, active: tab === 'partners', onSelect: () => setTab('partners') },
    { id: 'projects', label: 'Проекты', active: tab === 'projects', onSelect: () => setTab('projects') },
    { id: 'help', label: 'Обучение', active: tab === 'help', onSelect: () => setTab('help') },
  ];

  return (
    <CabinetChrome
      title={PARTNER_NETWORK_NAME}
      lead={
        <>
          Партнёры по регионам, официальные РРЦ и сетевая аналитика.
          {api.remote ? ' · облако' : ' · локальный режим'}
        </>
      }
      items={withToolsItem(adminNav, tab === 'tools', () => setTab('tools'))}
      extra={
        <>
          <SyncBadge />
          <InstallAppButton />
        </>
      }
      profile={profileOf(api.user!, api.logout)}
    >
      <FrameBody>
      {tab === 'partners' ? (
        <TabPanel>
          <div className={`${styles.card} ${styles.panelCard}`}>
            <div className={addStyles.sectionHead}>
              <h2>Партнёры сети</h2>
              <Button
                variant={addOpen ? 'secondary' : 'primary'}
                aria-expanded={addOpen}
                aria-controls="admin-add-partner"
                onClick={() => {
                  setErr(null);
                  setAddOpen((v) => !v);
                }}
              >
                {addOpen ? 'Свернуть' : 'Добавить'}
              </Button>
            </div>
            <AnimatePresence initial={false}>
              {addOpen ? (
                <m.div
                  key="add-partner"
                  id="admin-add-partner"
                  className={addStyles.addPartnerWrap}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={motionPresets.transition}
                >
                  <form className={addStyles.addPartnerForm} onSubmit={(e) => void onCreate(e)}>
                    <h3>Новый партнёр</h3>
                    <div className={styles.grid2}>
                      <label className={styles.field}>
                        Логин владельца
                        <input value={login} onChange={(e) => setLogin(e.target.value)} required />
                      </label>
                      <label className={styles.field}>
                        Пароль
                        <input
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          required
                          autoComplete="new-password"
                        />
                      </label>
                      <label className={styles.field}>
                        Компания
                        <input
                          value={companyName}
                          onChange={(e) => setCompanyName(e.target.value)}
                          required
                        />
                      </label>
                      <label className={styles.field}>
                        Город
                        <CityField value={city} onChange={setCity} />
                      </label>
                    </div>
                    {err ? (
                      <p className={styles.error} role="alert">
                        {err}
                      </p>
                    ) : null}
                    <Button type="submit" loading={saving} disabled={saving}>
                      {saving ? 'Создаём…' : 'Создать'}
                    </Button>
                  </form>
                </m.div>
              ) : null}
            </AnimatePresence>
            {api.partnersLoading && !partners.length ? <Skeleton count={3} label="Загрузка партнёров"/> : null}
            {notice ? (
              <p className={styles.flash} role="status">
                {notice}
              </p>
            ) : null}
            {err && !addOpen ? (
              <p className={styles.error} role="alert">
                {err}
              </p>
            ) : null}
            <div className={styles.table}>
              {partners.map((p) => {
                const cityName = p.org?.settings.city?.trim() || '';
                const cityBad = catalogReady && Boolean(cityName) && !isKnownCity(cityName);
                return (
                <div key={p.user.id} className={`${styles.tableRow} ${cityBad ? styles.tableRowWarn : ''}`}>
                  <div>
                    <strong>{p.org?.settings.companyName || p.user.displayName}</strong>
                    <div className={styles.hint}>
                      {p.user.login}
                      {cityName ? (
                        <>
                          {' · '}
                          <span className={cityBad ? styles.cityBadText : undefined}>{cityName}</span>
                        </>
                      ) : (
                        ' · город не указан'
                      )}
                      {cityBad ? <span className={styles.cityBadge}>не из справочника</span> : null}
                      {' · '}сотрудников: {p.executorCount}
                      {p.lastLogin
                        ? ` · вход ${new Date(p.lastLogin).toLocaleDateString('ru-RU')}`
                        : ''}
                    </div>
                  </div>
                  <div className={styles.rowActions}>
                    <button
                      type="button"
                      className={styles.ghost}
                      onClick={() => {
                        setErr(null);
                        setEditingId(p.user.id);
                        setEditCity(cityName);
                      }}
                    >
                      {cityBad ? 'Исправить город' : 'Город'}
                    </button>
                    <button
                      type="button"
                      className={styles.ghost}
                      onClick={() => {
                        const pw = generatePassword();
                        void api
                          .adminResetPassword(p.user.id, pw)
                          .then((next) => {
                            setErr(null);
                            setNotice(`Новый пароль для ${p.user.login}: ${next}`);
                          })
                          .catch((ex) => {
                            setNotice(null);
                            setErr(ex instanceof Error ? ex.message : 'Ошибка');
                          });
                      }}
                    >
                      Новый пароль
                    </button>
                    <button
                      type="button"
                      className={styles.danger}
                      onClick={() =>
                        void onDelete(
                          p.user.id,
                          p.user.login,
                          p.org?.settings.companyName || p.user.displayName,
                          p.executorCount,
                        )
                      }
                    >
                      Удалить
                    </button>
                  </div>
                  {editingId === p.user.id ? (
                    <div className={styles.cityEdit}>
                      <label className={styles.field}>
                        Город
                        <CityField value={editCity} onChange={setEditCity} />
                      </label>
                      <div className={styles.rowActions}>
                        <button
                          type="button"
                          className={styles.primary}
                          disabled={savingCity}
                          onClick={() => {
                            setSavingCity(true);
                            setErr(null);
                            void api
                              .adminUpdatePartnerCity(p.user.id, editCity)
                              .then((saved) => {
                                setNotice(`Город обновлён: ${saved || 'не указан'}`);
                                setEditingId(null);
                              })
                              .catch((ex) => {
                                setErr(ex instanceof Error ? ex.message : 'Ошибка');
                              })
                              .finally(() => setSavingCity(false));
                          }}
                        >
                          {savingCity ? 'Сохраняем…' : 'Сохранить город'}
                        </button>
                        <button
                          type="button"
                          className={styles.ghost}
                          onClick={() => setEditingId(null)}
                        >
                          Отмена
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
                );
              })}
              {!partners.length ? <p className={styles.lead}>Пока нет партнёров</p> : null}
            </div>
          </div>
          <InstallHint />
        </TabPanel>
      ) : null}

      {tab === 'analytics' ? (
        <TabPanel>
          <AnalyticsDashboard mode="admin" />
        </TabPanel>
      ) : null}

      {tab === 'projects' ? (
        <TabPanel>
          <ObjectsPanel />
        </TabPanel>
      ) : null}

      {tab === 'tools' ? (
        <TabPanel>
          <ToolsPanel
            onProblemomer={() => onNavigate('problemomer')}
            onCalculator={() => onNavigate('calculator')}
          />
        </TabPanel>
      ) : null}

      {tab === 'help' ? (
        <TabPanel>
          <HelpTrainingPanel role="admin" />
        </TabPanel>
      ) : null}
      </FrameBody>
    </CabinetChrome>
  );
}

type OwnerTab = 'objects' | 'company' | 'staff' | 'analytics' | 'help' | 'tools';

function OwnerCabinet({
  onNavigate,
  onOpenCalc,
}: {
  onNavigate: (r: Route) => void;
  onOpenCalc: () => void;
}) {
  const api = usePartner();
  const user = api.user!;
  const [tab, setTab] = useState<OwnerTab>(() => (consumeReturnToTools() ? 'tools' : 'objects'));
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
          Прайс, команда, объекты и воронка компании
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
          <RoleWorkspace onCreate={() => onNavigate('problemomer')} />
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

function SalesCabinet({
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

  const salesNav: SideItem[] = [
    { id: 'deals', label: `Сделки · ${api.objects.length}`, active: tab === 'deals', onSelect: () => setTab('deals') },
    { id: 'staff', label: `Сотрудники · ${staff.length}`, active: tab === 'staff', onSelect: () => setTab('staff') },
    { id: 'analytics', label: 'Аналитика', active: tab === 'analytics', onSelect: () => setTab('analytics') },
    { id: 'help', label: 'Обучение', active: tab === 'help', onSelect: () => setTab('help') },
  ];

  return (
    <CabinetChrome
      title={roleHeading('sales', user)}
      lead="Сделки, КП и отправка клиенту"
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

function MeasurerCabinet({
  onNavigate,
  onOpenCalc,
}: {
  onNavigate: (r: Route) => void;
  onOpenCalc: () => void;
}) {
  const api = usePartner();
  const user = api.user!;
  const [view, setView] = useState<'home' | 'tools' | 'help'>(() =>
    consumeReturnToTools() ? 'tools' : 'home',
  );

  return (
    <CabinetChrome
      title={roleHeading('measurer', user)}
      lead="Замер за 5–10 минут"
      mode="buttons"
      items={[
        { id: 'objects', label: 'Объекты', active: view === 'home', onSelect: () => setView('home') },
        { id: 'tools', label: 'Инструменты', active: view === 'tools', onSelect: () => setView('tools') },
        { id: 'help', label: 'Обучение', active: view === 'help', onSelect: () => setView('help') },
      ]}
      extra={
        <>
          <SyncBadge />
          <InstallAppButton />
        </>
      }
      profile={profileOf(user, api.logout)}
    >
      <FrameBody>
      {view === 'tools' ? (
        <ToolsPanel
          onProblemomer={() => onNavigate('problemomer')}
          onCalculator={onOpenCalc}
        />
      ) : view === 'help' ? (
        <HelpTrainingPanel role="measurer" />
      ) : (
        <>
          <p className={styles.metaLine}>
            РРЦ панели {user.org?.panelPriceRub ?? OFFICIAL_PANEL_PRICE_RUB} ₽ ·{' '}
            {user.org?.pricePerM2 ?? OFFICIAL_PRICE_PER_M2} ₽/м² · монтаж{' '}
            {user.org?.installPricePerM2 != null ? `${user.org.installPricePerM2} ₽/м²` : 'не задан'}
          </p>
          <RoleWorkspace compact onCreate={() => onNavigate('problemomer')} />
          <details className={styles.hintCard}>
            <summary>Офлайн на телефоне</summary>
            <p className={styles.lead}>
              Установите кабинет на устройство: в Chrome — «Установить приложение», на iPhone —
              «Поделиться → На экран Домой». После первого открытия прайс и объекты доступны без
              сети; отправка на сервер встаёт в очередь.
            </p>
          </details>
        </>
      )}
      </FrameBody>
    </CabinetChrome>
  );
}

function CrewCabinet({
  onNavigate,
  onOpenCalc,
}: {
  onNavigate: (r: Route) => void;
  onOpenCalc: () => void;
}) {
  const api = usePartner();
  const user = api.user!;
  const [view, setView] = useState<'home' | 'tools' | 'help'>(() =>
    consumeReturnToTools() ? 'tools' : 'home',
  );

  return (
    <CabinetChrome
      title={roleHeading('crew', user)}
      lead="Личный кабинет монтажника · смета со схемой и профиль комнаты"
      mode="buttons"
      items={[
        { id: 'objects', label: 'Задания', active: view === 'home', onSelect: () => setView('home') },
        { id: 'tools', label: 'Инструменты', active: view === 'tools', onSelect: () => setView('tools') },
        { id: 'help', label: 'Обучение', active: view === 'help', onSelect: () => setView('help') },
      ]}
      extra={
        <>
          <SyncBadge />
          <InstallAppButton />
        </>
      }
      profile={profileOf(user, api.logout)}
    >
      <FrameBody>
      {view === 'tools' ? (
        <ToolsPanel
          onProblemomer={() => onNavigate('problemomer')}
          onCalculator={onOpenCalc}
        />
      ) : view === 'help' ? (
        <HelpTrainingPanel role="crew" />
      ) : (
        <>
          <RoleWorkspace />
          <details className={styles.hintCard}>
            <summary>Офлайн на телефоне</summary>
            <p className={styles.lead}>
              Установите кабинет на устройство: в Chrome — «Установить приложение», на iPhone —
              «Поделиться → На экран Домой». Количество панелей и крепежа останется на экране без
              сети.
            </p>
          </details>
        </>
      )}
      </FrameBody>
    </CabinetChrome>
  );
}

export function CabinetScreen({ onNavigate }: { onNavigate: (r: Route) => void }) {
  const api = usePartner();
  const user = api.user;
  if (!user) return null;

  const openCalc = () => api.requestCalculator(null);

  if (user.role === 'admin') return <AdminCabinet onNavigate={onNavigate} />;
  if (user.role === 'owner') {
    return <OwnerCabinet onNavigate={onNavigate} onOpenCalc={openCalc} />;
  }
  if (user.role === 'sales') {
    return <SalesCabinet onNavigate={onNavigate} onOpenCalc={openCalc} />;
  }
  if (user.role === 'crew') {
    return <CrewCabinet onNavigate={onNavigate} onOpenCalc={openCalc} />;
  }
  return <MeasurerCabinet onNavigate={onNavigate} onOpenCalc={openCalc} />;
}
