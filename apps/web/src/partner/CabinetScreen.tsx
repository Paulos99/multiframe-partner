import { useMemo, useState, type FormEvent } from 'react';
import {
  OFFICIAL_PANEL_PRICE_RUB,
  OFFICIAL_PRICE_PER_M2,
} from '../../../../packages/shared/partner';
import { AnalyticsDashboard } from './AnalyticsDashboard';
import { generatePassword } from './localStore';
import { usePartner } from './PartnerContext';
import styles from './partner.module.css';

type Route = 'cabinet' | 'problemomer' | 'calculator';

function ToolButtons({
  onNavigate,
  onOpenCalc,
}: {
  onNavigate: (r: Route) => void;
  onOpenCalc: () => void;
}) {
  return (
    <div className={styles.navRow}>
      <button type="button" className={styles.primary} onClick={() => onNavigate('problemomer')}>
        Проблемомер
      </button>
      <button type="button" className={styles.primary} onClick={onOpenCalc}>
        Калькулятор
      </button>
    </div>
  );
}

function InstallHint() {
  return (
    <div className={styles.card} style={{ width: '100%' }}>
      <h2>Офлайн на планшете / телефоне</h2>
      <p className={styles.lead}>
        Установите кабинет на устройство: в Chrome — «Установить приложение», на iPhone —
        «Поделиться → На экран Домой». Параметры компании и сессия хранятся в браузере и работают без
        сети после первого открытия.
      </p>
    </div>
  );
}

function AdminCabinet({ onNavigate }: { onNavigate: (r: Route) => void }) {
  const api = usePartner();
  const partners = useMemo(() => api.adminListPartners(), [api]);
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [created, setCreated] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setCreated(null);
    try {
      const res = await api.adminCreatePartner({ login, password, companyName });
      setCreated(`Создан партнёр ${res.login} · пароль: ${res.password}`);
      setLogin('');
      setPassword('');
      setCompanyName('');
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Ошибка');
    }
  }

  async function onReset(id: string, loginName: string) {
    const pw = prompt(`Новый пароль для ${loginName}`);
    if (!pw) return;
    try {
      const next = await api.adminResetPassword(id, pw);
      alert(`Пароль для ${loginName}: ${next}`);
    } catch (ex) {
      alert(ex instanceof Error ? ex.message : 'Ошибка');
    }
  }

  async function onDelete(id: string, loginName: string, company: string, executorCount: number) {
    const ok = confirm(
      `Удалить партнёра «${company || loginName}» (${loginName})?\n` +
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
          <h1>Администратор</h1>
          <p className={styles.lead}>Создание партнёров и активность по кабинету.</p>
        </div>
        <button type="button" className={styles.ghost} onClick={api.logout}>
          Выйти
        </button>
      </header>

      <ToolButtons
        onNavigate={onNavigate}
        onOpenCalc={() => onNavigate('calculator')}
      />

      <div className={styles.adminGrid}>
        <div className={styles.adminDash}>
          <AnalyticsDashboard mode="admin" />
        </div>

        <form className={`${styles.card} ${styles.adminCreate}`} onSubmit={(e) => void onCreate(e)}>
          <h2>Новый партнёр</h2>
          <div className={styles.grid2}>
            <label className={styles.field}>
              Логин
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
              <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} required />
            </label>
          </div>
          {created ? <p className={styles.ok}>{created}</p> : null}
          {err ? (
            <p className={styles.error} role="alert">
              {err}
            </p>
          ) : null}
          <button type="submit" className={styles.primary}>
            Создать аккаунт
          </button>
        </form>

        <div className={`${styles.card} ${styles.adminPartners}`}>
          <h2>Партнёры · {partners.length}</h2>
          <div className={styles.scrollList}>
            <div className={styles.table}>
              {partners.map((p) => (
                <div key={p.user.id} className={styles.tableRow}>
                  <div>
                    <strong>{p.org?.settings.companyName || p.user.displayName}</strong>
                    <div className={styles.hint}>
                      {p.user.login} · сотрудников: {p.executorCount}
                      {p.lastLogin
                        ? ` · вход ${new Date(p.lastLogin).toLocaleString('ru-RU')}`
                        : ''}
                    </div>
                  </div>
                  <div className={styles.rowActions}>
                    <button
                      type="button"
                      className={styles.ghost}
                      onClick={() => void onReset(p.user.id, p.user.login)}
                    >
                      Сменить пароль
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
                </div>
              ))}
              {!partners.length ? <p className={styles.lead}>Пока нет партнёров</p> : null}
            </div>
          </div>
        </div>

        <div className={styles.adminHint}>
          <InstallHint />
        </div>
      </div>
    </div>
  );
}

function PartnerCabinet({
  onNavigate,
  onOpenCalc,
}: {
  onNavigate: (r: Route) => void;
  onOpenCalc: () => void;
}) {
  const api = usePartner();
  const user = api.user!;
  const [companyName, setCompanyName] = useState(user.org?.companyName || '');
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
  const [execCreated, setExecCreated] = useState<string | null>(null);
  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const staff = api.partnerListExecutors();

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    setErr(null);
    try {
      await api.saveOrg({
        companyName: companyName.trim(),
        panelPriceRub: Math.max(0, Number(panelPriceRub) || OFFICIAL_PANEL_PRICE_RUB),
        pricePerM2: Math.max(0, Number(pricePerM2) || OFFICIAL_PRICE_PER_M2),
        installPricePerM2: installPricePerM2 === '' ? null : Number(installPricePerM2),
        dowelsPerPanel: Math.max(1, Number(dowelsPerPanel) || 2),
        dowelPriceRub: dowelPriceRub === '' ? null : Number(dowelPriceRub),
      });
      setMsg('Сохранено в этом браузере');
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Ошибка');
    }
  }

  async function onCreateStaff(e: FormEvent) {
    e.preventDefault();
    setExecCreated(null);
    setErr(null);
    try {
      const password = execPassword.trim() || generatePassword();
      const res = await api.partnerCreateExecutor({
        login: execLogin.trim(),
        password,
        displayName: execName.trim() || execLogin.trim(),
      });
      setExecCreated(`Сотрудник ${res.login} · пароль: ${res.password}`);
      setRevealedPasswords((prev) => ({ ...prev, [res.id]: true }));
      setExecLogin('');
      setExecPassword(generatePassword());
      setExecName('');
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Ошибка');
    }
  }

  function togglePassword(id: string) {
    setRevealedPasswords((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  async function onGenerateStaffPassword(id: string) {
    try {
      const next = await api.partnerResetExecutorPassword(id, generatePassword());
      setRevealedPasswords((prev) => ({ ...prev, [id]: true }));
      setExecCreated(`Новый пароль сохранён: ${next}`);
    } catch (ex) {
      alert(ex instanceof Error ? ex.message : 'Ошибка');
    }
  }

  return (
    <div className={styles.shellWide}>
      <header className={styles.top}>
        <div>
          <h1>Партнёр · {user.org?.companyName || user.displayName}</h1>
          <p className={styles.lead}>
            Корпоративные параметры для проблемомера и калькулятора. Официальная РРЦ StP указана под
            полями.
          </p>
        </div>
        <button type="button" className={styles.ghost} onClick={api.logout}>
          Выйти
        </button>
      </header>

      <ToolButtons onNavigate={onNavigate} onOpenCalc={onOpenCalc} />

      <div className={styles.cabinetGrid}>
        <div className={styles.cabinetStack}>
          <form className={styles.card} onSubmit={(e) => void onSave(e)}>
            <h2>Параметры компании</h2>
            <label className={styles.field}>
              Название компании (в PDF и КП)
              <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
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
            {msg ? <p className={styles.ok}>{msg}</p> : null}
            {err ? (
              <p className={styles.error} role="alert">
                {err}
              </p>
            ) : null}
            <button type="submit" className={styles.primary}>
              Сохранить
            </button>
          </form>

          <form className={styles.card} onSubmit={(e) => void onCreateStaff(e)}>
            <h2>Сотрудники</h2>
            <p className={styles.lead}>
              Создайте логин и пароль для сотрудников. Они входят в кабинет и работают в
              проблемомере и калькуляторе с вашими корпоративными параметрами — без доступа к
              настройкам компании. Пароль можно сгенерировать и позже посмотреть в списке.
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
            {execCreated ? <p className={styles.ok}>{execCreated}</p> : null}
            <button type="submit" className={styles.primary}>
              Создать сотрудника
            </button>
            <div className={styles.table}>
              {staff.map((ex) => {
                const shown = !!revealedPasswords[ex.id];
                return (
                  <div key={ex.id} className={styles.tableRow}>
                    <div>
                      <strong>{ex.displayName}</strong>
                      <div className={styles.hint}>
                        {ex.login} · пароль:{' '}
                        <span className={styles.passwordReveal}>
                          {shown ? ex.password : '••••••••'}
                        </span>
                      </div>
                    </div>
                    <div className={styles.rowActions}>
                      <button
                        type="button"
                        className={styles.ghost}
                        onClick={() => togglePassword(ex.id)}
                      >
                        {shown ? 'Скрыть' : 'Показать'}
                      </button>
                      <button
                        type="button"
                        className={styles.ghost}
                        onClick={() => void onGenerateStaffPassword(ex.id)}
                      >
                        Новый пароль
                      </button>
                    </div>
                  </div>
                );
              })}
              {!staff.length ? <p className={styles.lead}>Пока нет сотрудников</p> : null}
            </div>
          </form>
        </div>

        <AnalyticsDashboard mode="partner" />

        <div className={styles.cabinetSpan}>
          <InstallHint />
        </div>
      </div>
    </div>
  );
}

function ExecutorCabinet({
  onNavigate,
  onOpenCalc,
}: {
  onNavigate: (r: Route) => void;
  onOpenCalc: () => void;
}) {
  const api = usePartner();
  const user = api.user!;
  return (
    <div className={styles.shellWide}>
      <header className={styles.top}>
        <div>
          <h1>{user.displayName}</h1>
          <p className={styles.lead}>
            Инструменты продаж · {user.org?.companyName || 'компания'}
          </p>
        </div>
        <button type="button" className={styles.ghost} onClick={api.logout}>
          Выйти
        </button>
      </header>
      <ToolButtons onNavigate={onNavigate} onOpenCalc={onOpenCalc} />
      <div className={styles.card} style={{ width: '100%' }}>
        <h2>Корпоративные параметры</h2>
        <p className={styles.lead}>
          РРЦ панели {user.org?.panelPriceRub ?? OFFICIAL_PANEL_PRICE_RUB} ₽ ·{' '}
          {user.org?.pricePerM2 ?? OFFICIAL_PRICE_PER_M2} ₽/м² · монтаж{' '}
          {user.org?.installPricePerM2 != null ? `${user.org.installPricePerM2} ₽/м²` : 'не задан'} ·
          дюбели {user.org?.dowelsPerPanel ?? 2}/панель
          {user.org?.dowelPriceRub != null ? ` × ${user.org.dowelPriceRub} ₽` : ''}
        </p>
      </div>
      <InstallHint />
    </div>
  );
}

export function CabinetScreen({ onNavigate }: { onNavigate: (r: Route) => void }) {
  const api = usePartner();
  const user = api.user;
  if (!user) return null;

  const openCalc = () => onNavigate('calculator');

  if (user.role === 'admin') return <AdminCabinet onNavigate={onNavigate} />;
  if (user.role === 'executor') {
    return <ExecutorCabinet onNavigate={onNavigate} onOpenCalc={openCalc} />;
  }
  return <PartnerCabinet onNavigate={onNavigate} onOpenCalc={openCalc} />;
}
