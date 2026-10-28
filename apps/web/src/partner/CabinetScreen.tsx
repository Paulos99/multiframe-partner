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
import { personName } from '../../../../packages/shared/personName.js';
import { Button } from '../ui/Button';
import { AnalyticsDashboard } from './AnalyticsDashboard';
import { useCabinetSection } from './analyticsRoute';
import { CityField } from './CityField';
import { citiesReady, isKnownCity, loadCities } from './cityCatalog';
import { HelpTrainingPanel } from './HelpTrainingPanel';
import { AnimatePresence, FadeRise, m, motionPresets } from './motionBits';
import { ObjectsPanel } from './ObjectsPanel';
import { StaffPanel } from './StaffPanel';
import { generatePassword, usePartner } from './PartnerContext';
import { SyncStatus } from './SyncStatus';
import { TodayHome } from './TodayHome';
import { ToolsPanel } from './ToolsPanel';
import { InstallAppButton } from '../app-shell/InstallAppButton';
import { CabinetChrome, type SideItem } from '../app-shell/CabinetChrome';
import { navigateHash, navigateProject, parseProjectHash, parseStaffHash } from './projectRoute';
import { consumeReturnToTools } from './toolsReturn';
import styles from './partner.module.css';
import addStyles from './AdminPartners.module.css';

function projectHashOpen(): boolean {
  return typeof window !== 'undefined' && parseProjectHash(window.location.hash).kind !== 'desk';
}

function leaveProjectHash() {
  if (typeof window === 'undefined' || !window.location.hash) return;
  const hash = window.location.hash;
  if (parseProjectHash(hash).kind === 'desk' && parseStaffHash(hash).kind === 'list') return;
  navigateHash('', 'replace');
}

function useFollowStaffHash(openStaff: () => void) {
  useEffect(() => {
    const sync = () => {
      if (parseStaffHash(window.location.hash).kind === 'person') openStaff();
    };
    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);
    return () => {
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('popstate', sync);
    };
  }, [openStaff]);
}

function useFollowProjectHash(openProjects: () => void) {
  useEffect(() => {
    const sync = () => {
      if (parseProjectHash(window.location.hash).kind !== 'desk') openProjects();
    };
    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);
    return () => {
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('popstate', sync);
    };
  }, [openProjects]);
}

function roleHeading(role: UserRole, user: SessionUser): string {
  const company = user.org?.companyName?.trim();
  return company ? `${ROLE_LABELS[role]} · ${company}` : user.displayName || ROLE_LABELS[role];
}

type Route = 'cabinet' | 'problemomer' | 'calculator';

function SyncBadge() {
  return <SyncStatus compact />;
}

function InstallHint() {
  return (
    <details className={styles.docBlock}>
      <summary>Офлайн на планшете и телефоне</summary>
      <p className={styles.lead}>
        Установите кабинет на устройство: в Chrome — «Установить приложение», на iPhone —
        «Поделиться → На экран Домой». После первого открытия прайс и комнаты доступны без сети;
        отправка на сервер встаёт в очередь.
      </p>
    </details>
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
    name: personName(user.displayName),
    role: ROLE_LABELS[user.role],
    company: user.org?.companyName,
    onLogout,
  };
}

type AdminTab = 'today' | 'partners' | 'tools' | 'analytics' | 'help';

function AdminCabinet({ onNavigate }: { onNavigate: (r: Route) => void }) {
  const api = usePartner();
  const partners = useMemo(() => api.adminListPartners(), [api]);
  const [tab, setTab] = useCabinetSection<AdminTab>('analytics', () => (consumeReturnToTools() ? 'tools' : 'today'));
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
    { id: 'today', label: 'Сегодня', active: tab === 'today', onSelect: () => setTab('today') },
    { id: 'partners', label: 'Партнёры', active: tab === 'partners', onSelect: () => setTab('partners') },
    { id: 'tools', label: 'Инструменты', active: tab === 'tools', onSelect: () => setTab('tools') },
    { id: 'analytics', label: 'Аналитика', active: tab === 'analytics', onSelect: () => setTab('analytics') },
    { id: 'help', label: 'Обучение', active: tab === 'help', onSelect: () => setTab('help') },
  ];

  return (
    <CabinetChrome
      title={PARTNER_NETWORK_NAME}
      lead="Сеть партнёров"
      items={adminNav}
      extra={
        <>
          <SyncBadge />
          <InstallAppButton />
        </>
      }
      profile={profileOf(api.user!, api.logout)}
    >
      <FrameBody>
      {tab === 'today' ? (
        <TabPanel>
          <TodayHome
            onAddPartner={() => {
              setTab('partners');
              setAddOpen(true);
            }}
            onProjects={() => setTab('partners')}
            onProblemomer={() => onNavigate('problemomer')}
            onCalculator={() => onNavigate('calculator')}
            onTraining={() => setTab('help')}
          />
        </TabPanel>
      ) : null}
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

type OwnerTab = 'today' | 'projects' | 'tools' | 'company' | 'staff' | 'analytics' | 'help';

function OwnerCabinet({
  onNavigate,
  onOpenCalc,
}: {
  onNavigate: (r: Route) => void;
  onOpenCalc: () => void;
}) {
  const api = usePartner();
  const user = api.user!;
  const [tab, setTab] = useCabinetSection<OwnerTab>('analytics', () => {
    if (consumeReturnToTools()) return 'tools';
    if (typeof window !== 'undefined' && parseStaffHash(window.location.hash).kind === 'person') return 'staff';
    return api.openedObjectId || projectHashOpen() ? 'projects' : 'today';
  });
  const showProjects = useMemo(() => () => setTab('projects'), []);
  const showStaff = useMemo(() => () => setTab('staff'), []);
  useFollowProjectHash(showProjects);
  useFollowStaffHash(showStaff);
  const [createToken, setCreateToken] = useState(0);
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
  const [companyEdit, setCompanyEdit] = useState(false);
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
      setCompanyEdit(false);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Ошибка');
    } finally {
      setSavingOrg(false);
    }
  }

  const ownerNav: SideItem[] = [
    { id: 'today', label: 'Сегодня', active: tab === 'today', onSelect: () => { leaveProjectHash(); setTab('today'); } },
    { id: 'projects', label: 'Проекты', active: tab === 'projects', onSelect: () => { navigateProject({ kind: 'desk' }, 'replace'); setTab('projects'); } },
    { id: 'tools', label: 'Инструменты', active: tab === 'tools', onSelect: () => { leaveProjectHash(); setTab('tools'); } },
    { id: 'company', label: 'Компания', active: tab === 'company', onSelect: () => { leaveProjectHash(); setTab('company'); } },
    { id: 'staff', label: 'Сотрудники', active: tab === 'staff', onSelect: () => { leaveProjectHash(); setTab('staff'); } },
    { id: 'analytics', label: 'Аналитика', active: tab === 'analytics', onSelect: () => { leaveProjectHash(); setTab('analytics'); } },
    { id: 'help', label: 'Обучение', active: tab === 'help', onSelect: () => { leaveProjectHash(); setTab('help'); } },
  ];

  return (
    <CabinetChrome
      title={roleHeading('owner', user)}
      lead={user.org?.city ? `Компания · ${user.org.city}` : 'Компания'}
      items={ownerNav}
      extra={
        <>
          <SyncBadge />
          <InstallAppButton />
        </>
      }
      profile={profileOf(user, api.logout)}
    >
      <FrameBody>
      {tab === 'today' ? (
        <TabPanel>
          <TodayHome
            onOpenRoom={(id) => {
              const room = api.objects.find((item) => item.id === id);
              if (room?.projectId) navigateProject({ kind: 'room', projectId: room.projectId, roomId: id });
              else api.openObject(id);
              setTab('projects');
            }}
            onProjects={() => {
              navigateProject({ kind: 'desk' }, 'replace');
              setTab('projects');
            }}
            onCreateProject={() => {
              setCreateToken((n) => n + 1);
              navigateProject({ kind: 'desk' }, 'replace');
              setTab('projects');
            }}
            onProblemomer={() => onNavigate('problemomer')}
            onCalculator={onOpenCalc}
          />
        </TabPanel>
      ) : null}
      {tab === 'projects' ? (
        <TabPanel>
          <ObjectsPanel openCreateToken={createToken} onCreate={() => onNavigate('problemomer')} />
        </TabPanel>
      ) : null}

      {tab === 'company' ? (
        <TabPanel>
          {!companyEdit ? (
            <section className={`${styles.card} ${styles.panelCard}`}>
              <h2>Компания</h2>
              <p className={styles.lead}>{companyName.trim() || 'Без названия'}</p>
              <p className={styles.hint}>{city.trim() || 'Город не указан'} · РРЦ панели {panelPriceRub || '—'} ₽</p>
              {msg ? (
                <p className={styles.flash} role="status">
                  {msg}
                </p>
              ) : null}
              <button type="button" className={styles.primary} onClick={() => setCompanyEdit(true)}>
                Изменить
              </button>
            </section>
          ) : (
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
            <div className={styles.navRow}>
              <Button type="submit" loading={savingOrg} disabled={savingOrg}>
                {savingOrg ? 'Сохраняем…' : 'Сохранить'}
              </Button>
              <button type="button" className={styles.ghost} onClick={() => setCompanyEdit(false)}>
                Закрыть
              </button>
            </div>
          </form>
          )}
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
          <AnalyticsDashboard
            mode="partner"
            onOpenRoom={(id) => {
              const room = api.objects.find((item) => item.id === id);
              if (room?.projectId) navigateProject({ kind: 'room', projectId: room.projectId, roomId: id });
              else api.openObject(id);
              setTab('projects');
            }}
          />
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
  const [createToken, setCreateToken] = useState(0);
  const [tab, setTab] = useCabinetSection<'today' | 'projects' | 'tools' | 'analytics' | 'help'>('analytics', () => {
    if (consumeReturnToTools()) return 'tools';
    return api.openedObjectId || projectHashOpen() ? 'projects' : 'today';
  });
  const showProjects = useMemo(() => () => setTab('projects'), []);
  useFollowProjectHash(showProjects);

  const salesNav: SideItem[] = [
    { id: 'today', label: 'Сегодня', active: tab === 'today', onSelect: () => { leaveProjectHash(); setTab('today'); } },
    { id: 'projects', label: 'Проекты', active: tab === 'projects', onSelect: () => { navigateProject({ kind: 'desk' }, 'replace'); setTab('projects'); } },
    { id: 'tools', label: 'Инструменты', active: tab === 'tools', onSelect: () => { leaveProjectHash(); setTab('tools'); } },
    { id: 'analytics', label: 'Аналитика', active: tab === 'analytics', onSelect: () => { leaveProjectHash(); setTab('analytics'); } },
    { id: 'help', label: 'Обучение', active: tab === 'help', onSelect: () => { leaveProjectHash(); setTab('help'); } },
  ];

  return (
    <CabinetChrome
      title={roleHeading('sales', user)}
      lead="Проекты и КП"
      items={salesNav}
      extra={
        <>
          <SyncBadge />
          <InstallAppButton />
        </>
      }
      profile={profileOf(user, api.logout)}
    >
      <FrameBody>
      {tab === 'today' ? (
        <TabPanel>
          <TodayHome
            onOpenRoom={(id) => {
              const room = api.objects.find((item) => item.id === id);
              if (room?.projectId) navigateProject({ kind: 'room', projectId: room.projectId, roomId: id });
              else api.openObject(id);
              setTab('projects');
            }}
            onProjects={() => {
              navigateProject({ kind: 'desk' }, 'replace');
              setTab('projects');
            }}
            onCreateProject={() => {
              setCreateToken((n) => n + 1);
              navigateProject({ kind: 'desk' }, 'replace');
              setTab('projects');
            }}
            onProblemomer={() => onNavigate('problemomer')}
            onCalculator={onOpenCalc}
            onTraining={() => setTab('help')}
          />
        </TabPanel>
      ) : null}
      {tab === 'projects' ? (
        <TabPanel>
          <ObjectsPanel openCreateToken={createToken} onCreate={() => onNavigate('problemomer')} />
        </TabPanel>
      ) : null}
      {tab === 'analytics' ? (
        <TabPanel>
          <AnalyticsDashboard
            mode="partner"
            onOpenRoom={(id) => {
              const room = api.objects.find((item) => item.id === id);
              if (room?.projectId) navigateProject({ kind: 'room', projectId: room.projectId, roomId: id });
              else api.openObject(id);
              setTab('projects');
            }}
          />
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

function FieldCabinet({
  role,
  onNavigate,
  onOpenCalc,
}: {
  role: 'measurer' | 'crew';
  onNavigate: (r: Route) => void;
  onOpenCalc: () => void;
}) {
  const api = usePartner();
  const user = api.user!;
  const [view, setView] = useState<'today' | 'projects' | 'tools' | 'help'>(() => {
    if (consumeReturnToTools()) return 'tools';
    return api.openedObjectId || projectHashOpen() ? 'projects' : 'today';
  });
  const showProjects = useMemo(() => () => setView('projects'), []);
  useFollowProjectHash(showProjects);

  return (
    <CabinetChrome
      title={roleHeading(role, user)}
      lead={role === 'crew' ? 'Монтаж назначенных комнат' : 'Замер назначенных комнат'}
      items={[
        { id: 'today', label: 'Сегодня', active: view === 'today', onSelect: () => { leaveProjectHash(); setView('today'); } },
        { id: 'projects', label: 'Проекты', active: view === 'projects', onSelect: () => { navigateProject({ kind: 'desk' }, 'replace'); setView('projects'); } },
        { id: 'tools', label: 'Инструменты', active: view === 'tools', onSelect: () => { leaveProjectHash(); setView('tools'); } },
        { id: 'help', label: 'Обучение', active: view === 'help', onSelect: () => { leaveProjectHash(); setView('help'); } },
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
          <ToolsPanel onProblemomer={() => onNavigate('problemomer')} onCalculator={onOpenCalc} />
        ) : view === 'help' ? (
          <HelpTrainingPanel role={role} />
        ) : view === 'projects' ? (
          <ObjectsPanel onCreate={() => onNavigate('problemomer')} />
        ) : (
          <TodayHome
            onOpenRoom={(id) => {
              const room = api.objects.find((item) => item.id === id);
              if (room?.projectId) navigateProject({ kind: 'room', projectId: room.projectId, roomId: id });
              else api.openObject(id);
              setView('projects');
            }}
            onProjects={() => {
              navigateProject({ kind: 'desk' }, 'replace');
              setView('projects');
            }}
            onProblemomer={() => onNavigate('problemomer')}
            onCalculator={onOpenCalc}
            onTraining={() => setView('help')}
          />
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
  if (user.role === 'crew' || user.role === 'measurer') {
    return <FieldCabinet role={user.role} onNavigate={onNavigate} onOpenCalc={openCalc} />;
  }
  return null;
}
