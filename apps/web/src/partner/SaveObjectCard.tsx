import { useEffect, useRef, useState } from 'react';
import { canCreateObjects, type JobObject } from '../../../../packages/shared/partner';
import { renderAcousticProfilePdf } from '../state/reportPdf';
import { useSession } from '../state/SessionContext';
import type { RoomAnswers } from '../state/types';
import { buildClientSummary } from '../state/session';
import { Button } from '../ui/Button';
import { buildEstimateFromOrg } from './estimate';
import { usePartner } from './PartnerContext';
import { SaveDestination } from './commercial/SaveDestination';
import { chosenArea, type SaveDraftView, type SaveIntent } from './commercial/saveDestination';
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
  const {
    user,
    saveObject,
    createProject,
    partner,
    diagnosisRequest,
    objects,
    projects,
    attachProfile,
    rememberConsult,
  } = usePartner();
  const { session, patchRoom, setCeilingArea } = useSession();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [objectId, setObjectId] = useState<string | null>(null);
  const appliedDiagnosis = useRef<number | null>(null);
  const attachedProfile = useRef<string | null>(null);
  const savedSig = useRef<string | null>(null);
  const [profileNote, setProfileNote] = useState<string | null>(null);

  useEffect(() => {
    if (!diagnosisRequest || appliedDiagnosis.current === diagnosisRequest.nonce) return;
    const obj = objects.find((item) => item.id === diagnosisRequest.objectId);
    if (!obj) return;
    appliedDiagnosis.current = diagnosisRequest.nonce;
    setObjectId(obj.id);
    const answers = obj.room?.answers;
    if (answers && typeof answers === 'object') patchRoom(answers as Partial<RoomAnswers>);
    if (typeof obj.room?.areaM2 === 'number') setCeilingArea(obj.room.areaM2);
  }, [diagnosisRequest, objects, patchRoom, setCeilingArea]);

  useEffect(() => {
    if (!user || !canCreateObjects(user.role)) return;
    const areaM2 = session.answers.room.ceilingAreaM2 ?? null;
    const nextEstimate = partner && areaM2 ? buildEstimateFromOrg(areaM2, partner) : null;
    rememberConsult({
      areaM2,
      summary: buildClientSummary(session),
      totalCost: nextEstimate?.totalCost ?? null,
      panels: nextEstimate?.panels ?? null,
    });
  }, [user, session, partner, rememberConsult]);

  if (!user || !canCreateObjects(user.role)) return null;
  const sessionUser = user;

  const room = session.answers.room;
  const area = room.ceilingAreaM2 ?? null;
  const summary = buildClientSummary(session);
  const est = partner && area ? buildEstimateFromOrg(area, partner) : null;
  const sim = session.derived?.simulation;
  const bound = objectId ? objects.find((item) => item.id === objectId) || null : null;

  const draft: SaveDraftView = {
    tool: 'problemomer',
    areaM2: area,
    totalCost: est?.totalCost ?? null,
    hasProfile: Boolean(sim),
    preliminary: Boolean(est),
    hasScheme: false,
  };

  function roomPayload(areaM2: number | null) {
    return {
      roomType: room.roomType,
      roomTypeCustom: room.roomTypeCustom || null,
      areaM2,
      houseType: room.houseType,
      objectStage: room.objectStage,
      classBefore: sim ? `Rw ${sim.before.Rw} / Lnw ${sim.before.Lnw}` : null,
      classAfter: sim ? `Rw ${sim.after.Rw} / Lnw ${sim.after.Lnw}` : null,
      answers: room as unknown as Record<string, unknown>,
    };
  }

  function estimateFor(areaM2: number | null) {
    const next = partner && areaM2 ? buildEstimateFromOrg(areaM2, partner) : est;
    if (!next) return null;
    return {
      panels: next.panels,
      dowels: next.dowels,
      panelsCost: next.panelsCost,
      installCost: next.installCost,
      dowelsCost: next.dowelsCost,
      totalCost: next.totalCost,
    };
  }

  async function attachProfileTo(obj: JobObject) {
    const sig = `${obj.id}:${JSON.stringify(session.answers)}`;
    if (attachedProfile.current === sig) return;
    attachedProfile.current = sig;
    setProfileNote('Прикладываем профиль к комнате…');
    try {
      const { blob } = await renderAcousticProfilePdf(session, { compact: true });
      const saved = await attachProfile(obj, await blobToBase64(blob));
      setProfileNote(saved ? 'Профиль приложен к комнате' : null);
    } catch {
      attachedProfile.current = null;
      setProfileNote('Не удалось приложить профиль. Сохраните ещё раз.');
    }
  }

  async function onConfirm(intent: SaveIntent) {
    const signature = JSON.stringify({
      area,
      summary,
      mode: intent.mode,
      roomId: intent.roomId,
      projectName: intent.projectName.trim(),
      roomName: intent.roomName.trim(),
      areaChoice: intent.areaChoice,
    });
    if (savedSig.current === signature) {
      setMsg('Этот результат уже записан в комнату');
      return;
    }
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const areaM2 = chosenArea(intent, area);
      let saved: JobObject;
      if (intent.mode === 'new' && !bound) {
        const project = await createProject({
          name: intent.projectName.trim(),
          clientName: intent.projectName.trim(),
          clientPhone: intent.phone.trim(),
          address: intent.address.trim(),
          city: sessionUser.org?.city || '',
        });
        saved = await saveObject({
          projectId: project.id,
          roomName: intent.roomName.trim(),
          status: 'measured',
          clientName: intent.projectName.trim(),
          clientPhone: intent.phone.trim(),
          address: intent.address.trim(),
          city: sessionUser.org?.city || '',
          clientSummary: summary,
          room: roomPayload(areaM2),
          estimate: estimateFor(areaM2),
        });
      } else {
        const targetId = bound?.id || intent.roomId;
        if (!targetId) throw new Error('Выберите комнату');
        const existing = objects.find((item) => item.id === targetId);
        saved = await saveObject({
          ...(existing || {}),
          id: targetId,
          status: 'measured',
          clientSummary: summary,
          room: roomPayload(areaM2),
          estimate: estimateFor(areaM2),
        });
      }
      setObjectId(saved.id);
      savedSig.current = signature;
      rememberConsult(null);
      void attachProfileTo(saved);
      setMsg(saved.pendingSync ? 'Комната сохранена на устройстве и уйдёт на сервер при сети' : `Сохранено в комнату «${saved.roomName || saved.clientName || 'Комната'}»`);
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Не удалось сохранить');
    } finally {
      setBusy(false);
    }
  }

  async function onSendClient() {
    if (!objectId) {
      setErr('Сначала сохраните результат в комнату');
      return;
    }
    setErr(null);
    setSending(true);
    try {
      const text = [
        summary,
        est ? `\nОриентир: ${est.totalCost.toLocaleString('ru-RU')} ₽` : '',
      ]
        .filter(Boolean)
        .join('');
      const canShare = typeof navigator.share === 'function';
      if (canShare) await navigator.share({ title: 'MultiFrame · сводка', text });
      else await navigator.clipboard.writeText(text);
      setMsg(canShare ? 'Сводка передана клиенту' : 'Сводка скопирована');
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') return;
      setErr(error instanceof Error ? error.message : 'Не удалось отправить');
    } finally {
      setSending(false);
    }
  }

  return (
    <section className={styles.card} style={{ width: '100%', marginTop: 8 }} aria-label="Куда сохранить">
      <SaveDestination
        draft={draft}
        projects={projects}
        rooms={objects}
        boundRoom={bound}
        busy={busy}
        notice={msg}
        onCancel={() => {
          setErr(null);
          setMsg('Результат остаётся на этом экране. Комната не создана.');
        }}
        onConfirm={onConfirm}
      />
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
        <Button type="button" variant="secondary" loading={sending} disabled={busy || sending} onClick={() => void onSendClient()}>
          {sending ? 'Отправляем…' : 'Передать сводку клиенту'}
        </Button>
      </div>
    </section>
  );
}
