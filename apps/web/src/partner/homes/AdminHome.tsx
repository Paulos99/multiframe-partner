import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  PARTNER_NETWORK_NAME,
} from '../../../../../packages/shared/partner';
import { Button } from '../../ui/Button';
import { AnalyticsDashboard } from '../AnalyticsDashboard';
import { CityField } from '../CityField';
import { citiesReady, isKnownCity, loadCities } from '../cityCatalog';
import { Skeleton } from '../Skeleton';
import { HelpTrainingPanel } from '../HelpTrainingPanel';
import { AnimatePresence, m, motionPresets } from '../motionBits';
import { usePartner, generatePassword } from '../PartnerContext';
import { InstallAppButton } from '../../app-shell/InstallAppButton';
import { CabinetChrome, type SideItem } from '../../app-shell/CabinetChrome';
import { ToolsPanel } from '../ToolsPanel';
import { ObjectsPanel } from '../ObjectsPanel';
import { consumeReturnToTools } from '../toolsReturn';
import addStyles from '../AdminPartners.module.css';

import {
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
type AdminTab = 'partners' | 'projects' | 'analytics' | 'help';
type AdminView = AdminTab | 'tools';

export function AdminHome({ onNavigate }: { onNavigate: (r: Route) => void }) {
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
