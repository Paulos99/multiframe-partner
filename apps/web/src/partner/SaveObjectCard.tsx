import { useEffect, useRef, useState, type FormEvent } from 'react';
import { canCreateObjects, type JobObject } from '../../../../packages/shared/partner';
import { renderAcousticProfilePdf } from '../state/reportPdf';
import { useSession } from '../state/SessionContext';
import { buildClientSummary } from '../state/session';
import { Button } from '../ui/Button';
import { buildEstimateFromOrg } from './estimate';
import { hasRemoteApi } from './apiClient';
import { ensureClientLinkUrl } from './clientLink';
import { ForwardLinkRow } from './ForwardClientLink';
import { roomRecordFromAnswers } from './roomLink';
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
  const { user, saveObject, createProject, partner, diagnosisRequest, objects, projects, attachProfile, leaveToCabinet } = usePartner();
  const { session } = useSession();
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState(user?.org?.city || '');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  /** Keep one card: save / send update the same object instead of creating clones. */
  const [objectId, setObjectId] = useState<string | null>(null);
  const [projectChoice, setProjectChoice] = useState('new');
  const [roomName, setRoomName] = useState('');
  const appliedDiagnosis = useRef<number | null>(null);
  /** Последний приложенный «Профиль»: объект + ответы. Повторное сохранение без правок не плодит файлы. */
  const attachedProfile = useRef<string | null>(null);
  const alive = useRef(true);
  const [profileNote, setProfileNote] = useState<string | null>(null);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

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
  }, [diagnosisRequest, objects, user?.org?.city]);

  useEffect(() => {
    if (!savedFlash) return;
    const t = window.setTimeout(() => setSavedFlash(false), 1600);
    return () => window.clearTimeout(t);
  }, [savedFlash]);

  if (!user) return null;
  const canCreate = canCreateObjects(user.role);
  if (!canCreate && !objectId && !diagnosisRequest?.objectId) return null;
  const linkedId = diagnosisRequest?.objectId || objectId;
  const linked = Boolean(diagnosisRequest?.objectId);

  const room = session.answers.room;
  const area = room.ceilingAreaM2 ?? null;
  const summary = buildClientSummary(session);
  const est = partner && area ? buildEstimateFromOrg(area, partner) : null;


  const sim = session.derived?.simulation;

  function roomPayload() {
    return roomRecordFromAnswers(
      room,
      sim
        ? { before: { Rw: sim.before.Rw, Lnw: sim.before.Lnw }, after: { Rw: sim.after.Rw, Lnw: sim.after.Lnw } }
        : null,
    );
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

  function objectFields(projectId?: string) {
    const existing = linkedId ? objects.find((item) => item.id === linkedId) : undefined;
    const status = existing?.status || 'draft';
    const chosen = projectId || (projectChoice !== 'new' ? projectChoice : existing?.projectId || undefined);
    const roomLabel = roomName.trim() || existing?.roomName || room.roomTypeCustom || '';
    return {
      ...(linkedId ? { id: linkedId } : {}),
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
    const existing = linkedId ? objects.find((item) => item.id === linkedId) : undefined;
    if (diagnosisRequest?.objectId) return existing?.projectId || undefined;
    if (projectChoice !== 'new') return projectChoice;
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
    if (alive.current) setProfileNote('Прикладываем «Профиль» к комнате…');
    try {
      const shareUrl = await ensureClientLinkUrl(
        obj.id,
        user?.role,
        session.answers.room as unknown as Record<string, unknown>,
      );
      const { blob } = await renderAcousticProfilePdf(session, {
        compact: true,
        hidePrices: user?.role === 'crew',
        shareUrl,
      });
      const saved = await attachProfile(obj, await blobToBase64(blob));
      if (alive.current) setProfileNote(saved ? '«Профиль» приложен к комнате' : null);
    } catch {
      attachedProfile.current = null;
      if (alive.current) setProfileNote('Не удалось приложить «Профиль». Сохраните комнату ещё раз.');
    }
  }

  async function saveRoom() {
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const updating = Boolean(linkedId);
      const linked = await projectForSave();
      const obj = await saveObject(objectFields(linked));
      if (obj.projectId) setProjectChoice(obj.projectId);
      setObjectId(obj.id);
      setSavedFlash(true);
      if (diagnosisRequest?.objectId) {
        void attachProfileTo(obj);
        leaveToCabinet(obj.id);
        return;
      }
      void attachProfileTo(obj);
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

  async function onSave(e: FormEvent) {
    e.preventDefault();
    await saveRoom();
  }

  if (linked) {
    return (
      <div aria-label="Комната">
        <ForwardLinkRow objectId={diagnosisRequest!.objectId}>
          <Button type="button" fullWidth loading={busy} success={savedFlash} disabled={busy} onClick={() => void saveRoom()}>
            {busy ? 'Сохраняем…' : 'Сохранить'}
          </Button>
        </ForwardLinkRow>
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
      </div>
    );
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
              placeholder="Название"
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
          <Button type="submit" fullWidth loading={busy} success={savedFlash} disabled={busy}>
            {busy ? 'Сохраняем…' : 'Сохранить'}
          </Button>
        </div>
        {hasRemoteApi() && canCreate ? (
          <p className={styles.hint} data-testid="forward-reason">
            «Переслать» появится после сохранения: ссылка нужна для готовой комнаты.
          </p>
        ) : null}
      </form>
    </section>
  );
}
