import { useState, type FormEvent } from 'react';
import { canCreateObjects, canSeePrices } from '../../../../packages/shared/partner';
import { useSession } from '../state/SessionContext';
import { buildClientSummary } from '../state/session';
import { buildEstimateFromOrg } from './estimate';
import { usePartner } from './PartnerContext';
import styles from './partner.module.css';

export function SaveObjectCard() {
  const { user, saveObject, partner } = usePartner();
  const { session } = useSession();
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState(user?.org?.city || '');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!user || !canCreateObjects(user.role)) return null;

  const room = session.answers.room;
  const area = room.ceilingAreaM2 ?? null;
  const summary = buildClientSummary(session);
  const est = partner && area ? buildEstimateFromOrg(area, partner) : null;
  const seePrices = canSeePrices(user.role);
  const sim = session.derived?.simulation;

  function roomPayload() {
    return {
      roomType: room.roomType,
      areaM2: area,
      houseType: room.houseType,
      objectStage: room.objectStage,
      classBefore: sim ? `Rw ${sim.before.Rw} / Lnw ${sim.before.Lnw}` : null,
      classAfter: sim ? `Rw ${sim.after.Rw} / Lnw ${sim.after.Lnw}` : null,
      answers: room as unknown as Record<string, unknown>,
    };
  }

  function estimatePayload() {
    if (!est) return null;
    return {
      panels: est.panels,
      dowels: est.dowels,
      panelsCost: seePrices ? est.panelsCost : null,
      installCost: seePrices ? est.installCost : null,
      dowelsCost: seePrices ? est.dowelsCost : null,
      totalCost: seePrices ? est.totalCost : null,
    };
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const obj = await saveObject({
        status: 'measured',
        clientName,
        clientPhone,
        address,
        city: city || user?.org?.city || '',
        clientSummary: summary,
        room: roomPayload(),
        estimate: estimatePayload(),
      });
      setMsg(
        obj.pendingSync
          ? 'Объект сохранён на устройстве — отправится при сети'
          : 'Объект сохранён',
      );
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Не удалось сохранить');
    } finally {
      setBusy(false);
    }
  }

  async function onSendClient() {
    setErr(null);
    try {
      const text = [
        summary,
        address ? `\nАдрес: ${address}` : '',
        clientName ? `\nКлиент: ${clientName}` : '',
        seePrices && est ? `\nОриентир КП: ${est.totalCost.toLocaleString('ru-RU')} ₽` : '',
      ]
        .filter(Boolean)
        .join('');
      if (navigator.share) {
        await navigator.share({ title: 'MultiFrame · сводка', text });
      } else {
        await navigator.clipboard.writeText(text);
      }
      await saveObject({
        status: 'quote_sent',
        clientName,
        clientPhone,
        address,
        city: city || user?.org?.city || '',
        clientSummary: summary,
        room: roomPayload(),
        estimate: estimatePayload(),
      });
      setMsg(navigator.share ? 'Отправлено клиенту' : 'Сводка скопирована · статус «КП отправлено»');
    } catch (ex) {
      if ((ex as Error)?.name === 'AbortError') return;
      setErr(ex instanceof Error ? ex.message : 'Не удалось отправить');
    }
  }

  return (
    <section className={styles.card} style={{ width: '100%', marginTop: 8 }} aria-label="Объект">
      <h2>Сохранить объект</h2>
      <p className={styles.lead}>
        Замер появится у менеджера и бригады. Без сети сохранится на телефоне.
      </p>
      <form onSubmit={(e) => void onSave(e)}>
        <div className={styles.grid2}>
          <label className={styles.field}>
            Клиент
            <input
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="Имя"
            />
          </label>
          <label className={styles.field}>
            Телефон
            <input
              value={clientPhone}
              onChange={(e) => setClientPhone(e.target.value)}
              placeholder="+7…"
              inputMode="tel"
            />
          </label>
          <label className={styles.field}>
            Адрес
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Улица, дом, квартира"
            />
          </label>
          <label className={styles.field}>
            Город
            <input value={city} onChange={(e) => setCity(e.target.value)} />
          </label>
        </div>
        {msg ? <p className={styles.ok}>{msg}</p> : null}
        {err ? (
          <p className={styles.error} role="alert">
            {err}
          </p>
        ) : null}
        <div className={styles.navRow} style={{ marginTop: 12 }}>
          <button type="submit" className={styles.primary} disabled={busy}>
            {busy ? 'Сохраняем…' : 'Сохранить объект'}
          </button>
          <button type="button" className={styles.ghost} onClick={() => void onSendClient()}>
            Отправить клиенту
          </button>
        </div>
      </form>
    </section>
  );
}
