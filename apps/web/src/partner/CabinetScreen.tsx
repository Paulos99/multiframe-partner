import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  OFFICIAL_PANEL_PRICE_RUB,
  OFFICIAL_PRICE_PER_M2,
  PARTNER_NETWORK_NAME,
  ROLE_LABELS,
  STAFF_ROLES,
  type SessionUser,
  type UserRole,
} from '../../../../packages/shared/partner';
import { Button } from '../ui/Button';
import { AnalyticsDashboard } from './AnalyticsDashboard';
import { CityField } from './CityField';
import { citiesReady, isKnownCity, loadCities } from './cityCatalog';
import { HelpTrainingPanel } from './HelpTrainingPanel';
import { ObjectsPanel } from './ObjectsPanel';
import { NewPasswordButton } from './NewPasswordButton';
import { generatePassword, usePartner } from './PartnerContext';
import { SyncStatus } from './SyncStatus';
import { InstallAppButton } from '../app-shell/InstallAppButton';
import styles from './partner.module.css';

function roleHeading(role: UserRole, user: SessionUser): string {
  const company = user.org?.companyName?.trim();
  return company ? `${ROLE_LABELS[role]} · ${company}` : user.displayName || ROLE_LABELS[role];
}

type Route = 'cabinet' | 'problemomer' | 'calculator';

function QuickLogout() {
  const api = usePartner();
  return (
    <button
      type="button"
      className={styles.logoutBtn}
      onClick={api.logout}
      title="Выйти — смена сотрудника на общем планшете"
    >
      Выйти
    </button>
  );
}

function SyncBadge() {
  return <SyncStatus compact />;
}

function ToolButtons({
  onNavigate,
  onOpenCalc,
  quiet,
}: {
  onNavigate: (r: Route) => void;
  onOpenCalc: () => void;
  /** Вторичные действия: монтажнику важнее список заданий, чем инструменты замера. */
  quiet?: boolean;
}) {
  const cls = quiet ? styles.ghost : styles.primary;
  return (
    <div className={styles.navRow}>
      <button type="button" className={cls} onClick={() => onNavigate('problemomer')}>
        Проблемомер
      </button>
      <button type="button" className={cls} onClick={onOpenCalc}>
        Калькулятор
      </button>
    </div>
  );
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

function CabinetTabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: Array<{ id: T; label: string }>;
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className={styles.tabs} role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={active === t.id}
          className={active === t.id ? styles.tabActive : styles.tab}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function TabPanel({ children }: { children: ReactNode }) {
  return <div className={styles.tabPanel}>{children}</div>;
}

type AdminTab = 'add' | 'partners' | 'analytics' | 'help';

function AdminCabinet({ onNavigate }: { onNavigate: (r: Route) => void }) {
  const api = usePartner();
  const partners = useMemo(() => api.adminListPartners(), [api]);
  const [tab, setTab] = useState<AdminTab>('analytics');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [city, setCity] = useState('');
  const [created, setCreated] = useState<string | null>(null);
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
    setCreated(null);
    setSaving(true);
    try {
      const res = await api.adminCreatePartner({ login, password, companyName, city });
      setNotice(`Создан партнёр ${res.login} · пароль: ${res.password}`);
      setLogin('');
      setPassword('');
      setCompanyName('');
      setCity('');
      setTab('partners');
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

  return (
    <div className={styles.shellWide}>
      <header className={styles.top}>
        <div>
          <h1>{PARTNER_NETWORK_NAME}</h1>
          <p className={styles.lead}>
            Партнёры по регионам, официальные РРЦ и сетевая аналитика.
            {api.remote ? ' · облако' : ' · локальный режим'}
          </p>
        </div>
        <div className={styles.topActions}>
          <SyncBadge />
          <InstallAppButton />
          <QuickLogout />
        </div>
      </header>

      <ToolButtons onNavigate={onNavigate} onOpenCalc={() => onNavigate('calculator')} />

      <CabinetTabs
        tabs={[
          { id: 'analytics', label: 'Аналитика' },
          { id: 'partners', label: `Партнёры · ${partners.length}` },
          { id: 'add', label: 'Добавить' },
          { id: 'help', label: 'Обучение работе с материалом' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'add' ? (
        <TabPanel>
          <form className={`${styles.card} ${styles.panelCard}`} onSubmit={(e) => void onCreate(e)}>
            <h2>Новый партнёр</h2>
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
            {created ? <p className={styles.flash}>{created}</p> : null}
            {err && tab === 'add' ? (
              <p className={styles.error} role="alert">
                {err}
              </p>
            ) : null}
            <Button type="submit" loading={saving} disabled={saving}>
              {saving ? 'Создаём…' : 'Создать'}
            </Button>
          </form>
        </TabPanel>
      ) : null}

      {tab === 'partners' ? (
        <TabPanel>
          <div className={`${styles.card} ${styles.panelCard}`}>
            <h2>Партнёры сети</h2>
            {notice ? (
              <p className={styles.flash} role="status">
                {notice}
              </p>
            ) : null}
            {err && tab === 'partners' ? (
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

      {tab === 'help' ? (
        <TabPanel>
          <HelpTrainingPanel role="admin" />
        </TabPanel>
      ) : null}
    </div>
  );
}

type OwnerTab = 'objects' | 'company' | 'staff' | 'analytics' | 'help';

function OwnerCabinet({
  onNavigate,
  onOpenCalc,
}: {
  onNavigate: (r: Route) => void;
  onOpenCalc: () => void;
}) {
  const api = usePartner();
  const user = api.user!;
  const [tab, setTab] = useState<OwnerTab>('objects');
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
  const [execLogin, setExecLogin] = useState('');
  const [execPassword, setExecPassword] = useState(() => generatePassword());
  const [execName, setExecName] = useState('');
  const [execRole, setExecRole] = useState<UserRole>('measurer');
  const [execCreated, setExecCreated] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [savingOrg, setSavingOrg] = useState(false);
  const [savingStaff, setSavingStaff] = useState(false);
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

  async function onCreateStaff(e: FormEvent) {
    e.preventDefault();
    setExecCreated(null);
    setErr(null);
    setSavingStaff(true);
    try {
      const password = execPassword.trim() || generatePassword();
      const res = await api.partnerCreateStaff({
        login: execLogin.trim(),
        password,
        displayName: execName.trim() || execLogin.trim(),
        role: execRole,
      });
      setExecCreated(
        `${ROLE_LABELS[res.role]} ${res.login} · пароль: ${res.password}`,
      );
      setExecLogin('');
      setExecPassword(generatePassword());
      setExecName('');
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Ошибка');
    } finally {
      setSavingStaff(false);
    }
  }

  return (
    <div className={styles.shellWide}>
      <header className={styles.top}>
        <div>
          <h1>{roleHeading('owner', user)}</h1>
          <p className={styles.lead}>
            Прайс, команда, объекты и воронка компании
            {user.org?.city ? ` · ${user.org.city}` : ''}
          </p>
        </div>
        <div className={styles.topActions}>
          <SyncBadge />
          <InstallAppButton />
          <QuickLogout />
        </div>
      </header>

      <ToolButtons onNavigate={onNavigate} onOpenCalc={onOpenCalc} />

      <CabinetTabs
        tabs={[
          { id: 'objects', label: `Объекты · ${api.objects.length}` },
          { id: 'company', label: 'Компания' },
          { id: 'staff', label: `Сотрудники · ${staff.length}` },
          { id: 'analytics', label: 'Аналитика' },
          { id: 'help', label: 'Обучение работе с материалом' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'objects' ? (
        <TabPanel>
          <ObjectsPanel onCreate={() => onNavigate('problemomer')} />
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
          <form
            className={`${styles.card} ${styles.panelCard}`}
            onSubmit={(e) => void onCreateStaff(e)}
          >
            <h2>Сотрудники</h2>
            <p className={styles.lead}>
              Менеджер ведёт сделки и КП, замерщик сохраняет объекты, у каждого монтажника свой
              вход и свои задания. Цены монтажник не видит — только спецификацию и схемы.
            </p>
            <div className={styles.grid2}>
              <label className={styles.field}>
                Имя / подпись
                <input
                  value={execName}
                  onChange={(e) => setExecName(e.target.value)}
                  placeholder="Например, Иван · замер"
                />
              </label>
              <label className={styles.field}>
                Роль
                <select
                  value={execRole}
                  onChange={(e) => setExecRole(e.target.value as UserRole)}
                >
                  {STAFF_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                Логин
                <input
                  value={execLogin}
                  onChange={(e) => setExecLogin(e.target.value)}
                  required
                  autoComplete="off"
                />
              </label>
              <label className={`${styles.field} ${styles.passwordField}`}>
                Пароль
                <div className={styles.passwordRow}>
                  <input
                    type="text"
                    value={execPassword}
                    onChange={(e) => setExecPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    spellCheck={false}
                  />
                  <button
                    type="button"
                    className={styles.ghost}
                    onClick={() => setExecPassword(generatePassword())}
                  >
                    Сгенерировать
                  </button>
                </div>
              </label>
            </div>
            {execCreated ? (
              <p className={styles.flash} role="status">
                {execCreated}
              </p>
            ) : null}
            {err && tab === 'staff' ? (
              <p className={styles.error} role="alert">
                {err}
              </p>
            ) : null}
            <Button type="submit" loading={savingStaff} disabled={savingStaff}>
              {savingStaff ? 'Создаём…' : 'Создать сотрудника'}
            </Button>
            <div className={styles.table}>
              {staff.map((ex) => (
                <div key={ex.id} className={styles.tableRow}>
                  <div>
                    <strong>{ex.displayName}</strong>
                    <div className={styles.hint}>
                      {ex.login} · {ROLE_LABELS[ex.role] || ex.role}
                    </div>
                  </div>
                  <div className={styles.rowActions}>
                    <NewPasswordButton staffId={ex.id} staffName={ex.displayName} />
                    <button
                      type="button"
                      className={styles.danger}
                      onClick={() => {
                        if (
                          confirm(
                            `Удалить сотрудника «${ex.displayName}» (${ex.login})?`,
                          )
                        ) {
                          void api.partnerDeleteStaff(ex.id);
                        }
                      }}
                    >
                      Удалить
                    </button>
                  </div>
                </div>
              ))}
              {!staff.length ? <p className={styles.lead}>Пока нет сотрудников</p> : null}
            </div>
          </form>
        </TabPanel>
      ) : null}

      {tab === 'analytics' ? (
        <TabPanel>
          <AnalyticsDashboard mode="partner" />
        </TabPanel>
      ) : null}

      {tab === 'help' ? (
        <TabPanel>
          <HelpTrainingPanel role="owner" />
        </TabPanel>
      ) : null}
    </div>
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
  const [tab, setTab] = useState<'deals' | 'analytics' | 'help'>('deals');

  return (
    <div className={styles.shellWide}>
      <header className={styles.top}>
        <div>
          <h1>{roleHeading('sales', user)}</h1>
          <p className={styles.lead}>Сделки, КП и отправка клиенту</p>
        </div>
        <div className={styles.topActions}>
          <SyncBadge />
          <InstallAppButton />
          <QuickLogout />
        </div>
      </header>
      <ToolButtons onNavigate={onNavigate} onOpenCalc={onOpenCalc} />
      <CabinetTabs
        tabs={[
          { id: 'deals', label: `Сделки · ${api.objects.length}` },
          { id: 'analytics', label: 'Аналитика' },
          { id: 'help', label: 'Обучение работе с материалом' },
        ]}
        active={tab}
        onChange={setTab}
      />
      {tab === 'deals' ? (
        <TabPanel>
          <ObjectsPanel onCreate={() => onNavigate('problemomer')} />
        </TabPanel>
      ) : null}
      {tab === 'analytics' ? (
        <TabPanel>
          <AnalyticsDashboard mode="partner" />
        </TabPanel>
      ) : null}
      {tab === 'help' ? (
        <TabPanel>
          <HelpTrainingPanel role="sales" />
        </TabPanel>
      ) : null}
    </div>
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
  const [showHelp, setShowHelp] = useState(false);

  return (
    <div className={styles.shellWide}>
      <header className={styles.top}>
        <div>
          <h1>{roleHeading('measurer', user)}</h1>
          <p className={styles.lead}>Замер за 5–10 минут</p>
        </div>
        <div className={styles.topActions}>
          <button
            type="button"
            className={`${styles.ghost} ${styles.trainBtn}`}
            onClick={() => setShowHelp((v) => !v)}
            aria-pressed={showHelp}
            aria-label={showHelp ? 'К объектам' : 'Обучение работе с материалом'}
            title="Обучение работе с материалом"
          >
            {showHelp ? 'К объектам' : 'Обучение'}
          </button>
          <SyncBadge />
          <InstallAppButton />
          <QuickLogout />
        </div>
      </header>
      <ToolButtons onNavigate={onNavigate} onOpenCalc={onOpenCalc} />
      {showHelp ? (
        <HelpTrainingPanel role="measurer" />
      ) : (
        <>
          <p className={styles.metaLine}>
            РРЦ панели {user.org?.panelPriceRub ?? OFFICIAL_PANEL_PRICE_RUB} ₽ ·{' '}
            {user.org?.pricePerM2 ?? OFFICIAL_PRICE_PER_M2} ₽/м² · монтаж{' '}
            {user.org?.installPricePerM2 != null ? `${user.org.installPricePerM2} ₽/м²` : 'не задан'}
          </p>
          <ObjectsPanel compact onCreate={() => onNavigate('problemomer')} />
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
    </div>
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
  const [showHelp, setShowHelp] = useState(false);

  return (
    <div className={styles.shellWide}>
      <header className={styles.top}>
        <div>
          <h1>{roleHeading('crew', user)}</h1>
          <p className={styles.lead}>Личный кабинет монтажника · цены скрыты, PDF схемы доступен</p>
        </div>
        <div className={styles.topActions}>
          <button
            type="button"
            className={`${styles.ghost} ${styles.trainBtn}`}
            onClick={() => setShowHelp((v) => !v)}
            aria-pressed={showHelp}
            aria-label={showHelp ? 'К заданиям' : 'Обучение работе с материалом'}
            title="Обучение работе с материалом"
          >
            {showHelp ? 'К заданиям' : 'Обучение'}
          </button>
          <SyncBadge />
          <InstallAppButton />
          <QuickLogout />
        </div>
      </header>
      <ToolButtons onNavigate={onNavigate} onOpenCalc={onOpenCalc} quiet />
      {showHelp ? (
        <HelpTrainingPanel role="crew" />
      ) : (
        <>
          <ObjectsPanel />
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
    </div>
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
