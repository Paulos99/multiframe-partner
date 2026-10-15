import { useEffect, useState, type FormEvent } from 'react';
import { usePartner } from './PartnerContext';
import styles from './partner.module.css';

type Route = 'cabinet' | 'problemomer' | 'calculator';

export function CabinetScreen({ onNavigate }: { onNavigate: (r: Route) => void }) {
  const { partner, saveProfile, logout, loading } = usePartner();
  const [companyName, setCompanyName] = useState('');
  const [panelPriceRub, setPanelPriceRub] = useState('');
  const [pricePerM2, setPricePerM2] = useState('');
  const [installPricePerM2, setInstallPricePerM2] = useState('');
  const [dowelsPerPanel, setDowelsPerPanel] = useState('2');
  const [dowelPriceRub, setDowelPriceRub] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!partner) return;
    setCompanyName(partner.companyName);
    setPanelPriceRub(partner.panelPriceRub != null ? String(partner.panelPriceRub) : '');
    setPricePerM2(partner.pricePerM2 != null ? String(partner.pricePerM2) : '');
    setInstallPricePerM2(
      partner.installPricePerM2 != null ? String(partner.installPricePerM2) : '',
    );
    setDowelsPerPanel(String(partner.dowelsPerPanel || 2));
    setDowelPriceRub(partner.dowelPriceRub != null ? String(partner.dowelPriceRub) : '');
  }, [partner]);

  if (!partner) return null;

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    setErr(null);
    try {
      await saveProfile({
        companyName: companyName.trim(),
        panelPriceRub: panelPriceRub === '' ? null : Number(panelPriceRub),
        pricePerM2: pricePerM2 === '' ? null : Number(pricePerM2),
        installPricePerM2: installPricePerM2 === '' ? null : Number(installPricePerM2),
        dowelsPerPanel: Math.max(1, Number(dowelsPerPanel) || 2),
        dowelPriceRub: dowelPriceRub === '' ? null : Number(dowelPriceRub),
      });
      setMsg('Сохранено');
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Не удалось сохранить');
    }
  }

  return (
    <div className={styles.shellWide}>
      <header className={styles.top}>
        <div>
          <h1>Кабинет · {partner.companyName || partner.login}</h1>
          <p className={styles.lead}>Параметры применяются в проблемомере и калькуляторе.</p>
        </div>
        <button type="button" className={styles.ghost} onClick={logout}>
          Выйти
        </button>
      </header>

      <div className={styles.navRow}>
        <button type="button" className={styles.primary} onClick={() => onNavigate('problemomer')}>
          Проблемомер
        </button>
        <button type="button" className={styles.primary} onClick={() => onNavigate('calculator')}>
          Калькулятор
        </button>
      </div>

      <form className={styles.card} onSubmit={(e) => void onSave(e)}>
        <h2>Профиль компании</h2>
        <label className={styles.field}>
          Название компании (в PDF)
          <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
        </label>
        <div className={styles.grid2}>
          <label className={styles.field}>
            РРЦ панели, ₽
            <input
              type="number"
              min={0}
              step={1}
              placeholder="2396"
              value={panelPriceRub}
              onChange={(e) => setPanelPriceRub(e.target.value)}
            />
          </label>
          <label className={styles.field}>
            РРЦ за м², ₽
            <input
              type="number"
              min={0}
              step={1}
              placeholder="5990"
              value={pricePerM2}
              onChange={(e) => setPricePerM2(e.target.value)}
            />
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
            <span className={styles.hint}>Запас 15% уже заложен в расчёте</span>
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
        <button type="submit" className={styles.primary} disabled={loading}>
          Сохранить
        </button>
      </form>
    </div>
  );
}
