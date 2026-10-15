import { useMemo, useState, type FormEvent } from 'react';
import {
  OFFICIAL_PANEL_PRICE_RUB,
  OFFICIAL_PRICE_PER_M2,
} from '../../../../packages/shared/partner';
import { calcUrlFromOrg, usePartner } from './PartnerContext';
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
  const activity = useMemo(() => api.adminActivity(), [api]);
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

      <form className={styles.card} style={{ width: '100%' }} onSubmit={(e) => void onCreate(e)}>
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

      <div className={styles.card} style={{ width: '100%' }}>
        <h2>Партнёры</h2>
        <div className={styles.table}>
          {partners.map((p) => (
            <div key={p.user.id} className={styles.tableRow}>
              <div>
                <strong>{p.org?.settings.companyName || p.user.displayName}</strong>
                <div className={styles.hint}>
                  {p.user.login} · ссылок: {p.linkCount}
                  {p.lastLogin ? ` · вход ${new Date(p.lastLogin).toLocaleString('ru-RU')}` : ''}
                </div>
              </div>
              <button
                type="button"
                className={styles.ghost}
                onClick={() => void onReset(p.user.id, p.user.login)}
              >
                Сменить пароль
              </button>
            </div>
          ))}
          {!partners.length ? <p className={styles.lead}>Пока нет партнёров</p> : null}
        </div>
      </div>

      <div className={styles.card} style={{ width: '100%' }}>
        <h2>Активность</h2>
        <ul className={styles.activity}>
          {activity.slice(0, 40).map((a) => (
            <li key={a.id}>
              <span>{new Date(a.at).toLocaleString('ru-RU')}</span> · {a.login} · {a.action}
              {a.detail ? ` — ${a.detail}` : ''}
            </li>
          ))}
        </ul>
      </div>

      <InstallHint />
      <ToolButtons
        onNavigate={onNavigate}
        onOpenCalc={() => onNavigate('calculator')}
      />
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
  const [linkLabel, setLinkLabel] = useState('');
  const [lastLink, setLastLink] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const links = api.partnerListLinks();

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

  function onCreateLink(e: FormEvent) {
    e.preventDefault();
    try {
      const { url } = api.partnerCreateLink(linkLabel || 'Исполнитель');
      setLastLink(url);
      setLinkLabel('');
      void navigator.clipboard?.writeText(url);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Ошибка');
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

      <form className={styles.card} style={{ width: '100%' }} onSubmit={(e) => void onSave(e)}>
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

      <form className={styles.card} style={{ width: '100%' }} onSubmit={onCreateLink}>
        <h2>Ссылки для исполнителей</h2>
        <p className={styles.lead}>
          Исполнитель открывает ссылку и сразу работает в проблемомере/калькуляторе с вашими
          параметрами — без доступа к кабинету.
        </p>
        <label className={styles.field}>
          Подпись (менеджер / объект)
          <input
            value={linkLabel}
            onChange={(e) => setLinkLabel(e.target.value)}
            placeholder="Например, Иван · замер"
          />
        </label>
        <button type="submit" className={styles.primary}>
          Создать ссылку
        </button>
        {lastLink ? (
          <p className={styles.ok}>
            Скопировано: <code className={styles.code}>{lastLink}</code>
          </p>
        ) : null}
        <div className={styles.table}>
          {links.map((l) => (
            <div key={l.id} className={styles.tableRow}>
              <div>
                <strong>{l.label}</strong>
                <div className={styles.hint}>
                  использований: {l.uses}
                  {l.lastUsedAt
                    ? ` · ${new Date(l.lastUsedAt).toLocaleString('ru-RU')}`
                    : ' · ещё не открывали'}
                </div>
              </div>
              <button
                type="button"
                className={styles.ghost}
                onClick={() => {
                  const url = calcUrlFromOrg(user.org)
                    ? `${window.location.origin}${import.meta.env.BASE_URL}?exec=${l.token}`
                    : '';
                  const share = `${window.location.origin}${import.meta.env.BASE_URL}?exec=${encodeURIComponent(l.token)}`;
                  void navigator.clipboard?.writeText(share);
                  setLastLink(share);
                  void url;
                }}
              >
                Копировать
              </button>
            </div>
          ))}
        </div>
      </form>

      <InstallHint />
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
