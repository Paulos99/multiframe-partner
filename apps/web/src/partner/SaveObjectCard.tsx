import { useEffect, useRef, useState, type FormEvent } from 'react';
import { canCreateObjects, canMoveObjects, type JobObject } from '../../../../packages/shared/partner';
import { renderAcousticProfilePdf } from '../state/reportPdf';
import { useSession } from '../state/SessionContext';
import type { RoomAnswers } from '../state/types';
import { buildClientSummary } from '../state/session';
import { Button } from '../ui/Button';
import { buildEstimateFromOrg } from './estimate';
import { usePartner } from './PartnerContext';
import listStyles from './ProjectList.module.css';
import styles from './partner.module.css';

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '').replace(/^data:[^,]*,/, ''));
    reader.onerror = () => reject(reader.error || new Error('Не удалось прочитать PDF'));
    reader.readAsDataURL(blob);
  });
}

export function SaveObjectCard() {
  const { user, saveObject, createProject, partner, diagnosisRequest, objects, projects, attachProfile } = usePartner();
  const { session, patchRoom, setCeilingArea } = useSession();
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState(user?.org?.city || '');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [sentFlash, setSentFlash] = useState(false);
  /** Keep one card: save / send update the same object instead of creating clones. */
  const [objectId, setObjectId] = useState<string | null>(null);
  const [projectChoice, setProjectChoice] = useState('new');
  const [roomName, setRoomName] = useState('');
  const appliedDiagnosis = useRef<number | null>(null);
  /** Последний приложенный «Профиль»: объект + ответы. Повторное сохранение без правок не плодит файлы. */
  const attachedProfile = useRef<string | null>(null);
  const [profileNote, setProfileNote] = useState<string | null>(null);

  useEffect(() => {
    if (!diagnosisRequest || appliedDiagnosis.current === diagnosisRequest.nonce) return;
    const obj = objects.find((item) => item.id === diagnosisRequest.objectId);
    if (!obj) return;
    appliedDiagnosis.current = diagnosisRequest.nonce;
    setObjectId(obj.id);
    setClientName(obj.clientName || '');
    setClientPhone(obj.clientPhone || '');
    setAddress(obj.address || '');
    setCity(obj.city || user?.org?.city || '');
    setProjectChoice(obj.projectId || 'new');
    setRoomName(obj.roomName || '');
    const answers = obj.room?.answers;
    if (answers && typeof answers === 'object') patchRoom(answers as Partial<RoomAnswers>);
    if (typeof obj.room?.areaM2 === 'number') setCeilingArea(obj.room.areaM2);
  }, [diagnosisRequest, objects, patchRoom, setCeilingArea, user?.org?.city]);

  useEffect(() => {
    if (!savedFlash && !sentFlash) return;
    const t = window.setTimeout(() => {
      setSavedFlash(false);
      setSentFlash(false);
    }, 1600);
    return () => window.clearTimeout(t);
  }, [savedFlash, sentFlash]);

  if (!user) return null;
  const canCreate = canCreateObjects(user.role);
  const canMove = canMoveObjects(user.role);
  if (!canCreate && !objectId) return null;

  const room = session.answers.room;
  const area = room.ceilingAreaM2 ?? null;
  const summary = buildClientSummary(session);
  const est = partner && area ? buildEstimateFromOrg(area, partner) : null;


  const sim = session.derived?.simulation;

  function roomPayload() {
    return {
      roomType: room.roomType,
      roomTypeCustom: room.roomTypeCustom || null,
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
      panelsCost: est.panelsCost,
      installCost: est.installCost,
      dowelsCost: est.dowelsCost,
      totalCost: est.totalCost,
    };
  }

  function objectFields(next: 'keep' | 'quote_sent', projectId?: string) {
    const existing = objectId ? objects.find((item) => item.id === objectId) : undefined;
    const status = next === 'quote_sent' ? 'quote_sent' : existing?.status || 'draft';
    const chosen = projectId || (projectChoice !== 'new' ? projectChoice : existing?.projectId || undefined);
    const roomLabel = roomName.trim() || existing?.roomName || room.roomTypeCustom || '';
    return {
      ...(objectId ? { id: objectId } : {}),
      ...(chosen ? { projectId: chosen } : {}),
      ...(roomLabel ? { roomName: roomLabel } : {}),
      status,
      clientName,
      clientPhone,
      address,
      city: city || user?.org?.city || '',
      clientSummary: summary,
      room: roomPayload(),
      estimate: estimatePayload(),
    };
  }

  async function projectForSave(): Promise<string | undefined> {
    if (projectChoice !== 'new') return projectChoice;
    const existing = objectId ? objects.find((item) => item.id === objectId) : undefined;
    if (!existing?.projectId) return undefined;
    if (user?.role !== 'owner' && user?.role !== 'sales') return existing.projectId;
    const project = await createProject({
      name: clientName.trim() || address.trim() || roomName.trim() || 'Проект',
      clientName,
      clientPhone,
      address,
      city: city || user?.org?.city || '',
    });
    setProjectChoice(project.id);
    return project.id;
  }

  /** «Профиль» — PDF проблемомера — уходит в карточку объекта рядом со сметой. */
  async function attachProfileTo(obj: JobObject) {
    const sig = `${obj.id}:${JSON.stringify(session.answers)}`;
    if (attachedProfile.current === sig) return;
    attachedProfile.current = sig;
    setProfileNote('Прикладываем «Профиль» к комнате…');
    try {
      const { blob } = await renderAcousticProfilePdf(session, { compact: true });
      const saved = await attachProfile(obj, await blobToBase64(blob));
      setProfileNote(saved ? '«Профиль» приложен к комнате' : null);
    } catch {
      attachedProfile.current = null;
      setProfileNote('Не удалось приложить «Профиль». Сохраните комнату ещё раз.');
    }
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const updating = Boolean(objectId);
      const linked = await projectForSave();
      const obj = await saveObject(objectFields('keep', linked));
      if (obj.projectId) setProjectChoice(obj.projectId);
      setObjectId(obj.id);
      void attachProfileTo(obj);
      setSavedFlash(true);
      setMsg(
        obj.pendingSync
          ? 'Комната сохранена на устройстве — отправится при сети'
          : updating
            ? 'Комната обновлена'
            : 'Комната сохранена',
      );
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Не удалось сохранить');
    } finally {
      setBusy(false);
    }
  }

  async function onSendClient() {
    setErr(null);
    setSending(true);
    setSentFlash(false);
    try {
      const text = [
        summary,
        address ? `\nАдрес: ${address}` : '',
        clientName ? `\nКлиент: ${clientName}` : '',
        est ? `\nОриентир КП: ${est.totalCost.toLocaleString('ru-RU')} ₽` : '',
      ]
        .filter(Boolean)
        .join('');
      const canShare = typeof navigator.share === 'function';
      if (canShare) {
        await navigator.share({ title: 'MultiFrame · сводка', text });
      } else {
        await navigator.clipboard.writeText(text);
      }
      const linked = await projectForSave();
      const obj = await saveObject(objectFields('quote_sent', linked));
      if (obj.projectId) setProjectChoice(obj.projectId);
      setObjectId(obj.id);
      void attachProfileTo(obj);
      setSentFlash(true);
      setMsg(
        canShare
          ? 'Отправлено клиенту · статус «КП отправлено»'
          : 'Сводка скопирована · статус «КП отправлено»',
      );
    } catch (ex) {
      if ((ex as Error)?.name === 'AbortError') return;
      setErr(ex instanceof Error ? ex.message : 'Не удалось отправить');
    } finally {
      setSending(false);
    }
  }

  return (
    <section className={styles.card} style={{ width: '100%', marginTop: 8 }} aria-label="Комната">
      <h2>Сохранить комнату</h2>
      <p className={styles.lead}>
        {canCreate
          ? 'Комната останется черновиком, пока менеджер или владелец не переставит её. Без сети сохранится на телефоне.'
          : 'Профиль запишется в назначенную комнату. Новую комнату создаёт менеджер или владелец.'}
      </p>
      <form onSubmit={(e) => void onSave(e)}>
        <div className={listStyles.picker}>
          <label className={styles.field}>
            Проект
            <select aria-label="Проект" value={projectChoice} onChange={(event) => setProjectChoice(event.target.value)}>
              {canCreate ? <option value="new">Новый проект</option> : null}
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                  {project.address ? ` · ${project.address}` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            Комната
            <input
              aria-label="Комната"
              value={roomName}
              placeholder="Кухня"
              onChange={(event) => setRoomName(event.target.value)}
            />
          </label>
        </div>
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
        {msg ? (
          <p className={styles.flash} role="status">
            {msg}
          </p>
        ) : null}
        {profileNote ? (
          <p className={styles.hint} role="status" data-testid="profile-attach-note">
            {profileNote}
          </p>
        ) : null}
        {err ? (
          <p className={styles.error} role="alert">
            {err}
          </p>
        ) : null}
        <div className={styles.actionRow}>
          <Button type="submit" fullWidth loading={busy} success={savedFlash} disabled={busy || sending}>
            {busy ? 'Сохраняем…' : 'Сохранить комнату'}
          </Button>
          {canMove ? (
          <Button
            type="button"
            fullWidth
            variant="secondary"
            loading={sending}
            success={sentFlash}
            disabled={busy || sending}
            onClick={() => void onSendClient()}
          >
            {sending ? 'Отправляем…' : 'Отправить КП'}
          </Button>
          ) : null}
        </div>
      </form>
    </section>
  );
}
