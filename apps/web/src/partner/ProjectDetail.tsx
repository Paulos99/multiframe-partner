import { useState } from 'react';
import { canSeePrices, JOB_OBJECT_STATUS_LABELS, type JobObject, type UserRole } from '../../../../packages/shared/partner';
import { formatRub } from './estimate';
import listStyles from './ProjectList.module.css';
import { preliminaryRoomTotal } from './projectSummary';
import styles from './Projects.module.css';

// Structural UI contract; persistence and API belong to projectClient.
export type ProjectView = {
  id: string; orgId: string; name: string; clientName: string; clientPhone: string;
  address: string; city: string; createdAt: string; updatedAt: string; createdBy: string;
};
export type ProjectRoom = JobObject & { projectId?: string | null; roomName?: string | null };

export function ProjectDetail({ project, rooms, ungrouped, role, onBack, onOpenRoom, onDiagnose, onCalculate, onAttach, onAddRoom }: {
  project: ProjectView; rooms: ProjectRoom[]; ungrouped: ProjectRoom[]; role: UserRole;
  onBack: () => void; onOpenRoom: (id: string) => void; onDiagnose?: (id: string) => void;
  onCalculate: (id: string) => void;
  onAttach?: (roomId: string, projectId: string) => Promise<void>;
  onAddRoom?: (roomName: string) => Promise<void>;
}) {
  const [roomId, setRoomId] = useState('');
  const [newRoom, setNewRoom] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const priced = canSeePrices(role);
  const summary = preliminaryRoomTotal(rooms);
  const eligible = ungrouped.filter(room => room.orgId === project.orgId && !room.projectId);
  async function attach() {
    if (!roomId || !onAttach) return;
    setBusy(true); setError('');
    try { await onAttach(roomId, project.id); setRoomId(''); }
    catch (err) { setError(err instanceof Error ? err.message : 'Не удалось добавить помещение'); }
    finally { setBusy(false); }
  }
  async function addRoom() {
    if (!newRoom.trim() || !onAddRoom) return;
    setBusy(true); setError('');
    try { await onAddRoom(newRoom.trim()); setNewRoom(''); }
    catch (err) { setError(err instanceof Error ? err.message : 'Не удалось добавить комнату'); }
    finally { setBusy(false); }
  }
  return <section className={styles.panel} aria-label="Карточка проекта">
    <button className={styles.link} onClick={onBack}>← Все проекты</button>
    <div className={styles.header}><div><p className={styles.caption}>Проект</p><h2>{project.name}</h2>
      <p className={styles.muted}>{[project.clientName, project.address, project.city].filter(Boolean).join(' · ') || 'Контакт и адрес пока не заполнены'}</p>
    </div><span className={styles.badge}>Помещений: {rooms.length}</span></div>
    {priced && rooms.length > 0 ? <div className={styles.summary}>
      <div><span>Предварительный итог</span><strong>{summary.calculated ? formatRub(summary.total) : 'Расчётов пока нет'}</strong></div>
      <p>Рассчитано {summary.calculated} из {summary.rooms} помещений. {summary.calculated < summary.rooms ? 'Сумма неполная. ' : ''}Итог обновляется при пересчёте комнат; это ещё не зафиксированное предложение.</p>
    </div> : null}
    <div className={styles.rooms}>
      {rooms.map(room => <article className={styles.room} key={room.id}>
        <div><h3>{room.roomName || room.room.roomTypeCustom || room.clientName || 'Помещение'}</h3>
          <p className={styles.muted}>{room.room.areaM2 != null ? `${room.room.areaM2} м²` : 'Площадь не указана'} · {JOB_OBJECT_STATUS_LABELS[room.status]}</p>
        </div>
        <div className={styles.actions}>
          <button className={styles.secondary} onClick={() => onOpenRoom(room.id)}>Карточка и документы</button>
          {onDiagnose && role !== 'crew' && role !== 'admin' ? <button className={styles.secondary} onClick={() => onDiagnose(room.id)}>Диагностика</button> : null}
          {role !== 'crew' && role !== 'admin' ? <button className={styles.primary} onClick={() => onCalculate(room.id)}>Рассчитать</button> : null}
        </div>
      </article>)}
      {!rooms.length ? <p className={styles.empty}>В проекте пока нет доступных вам помещений.</p> : null}
    </div>
    {onAddRoom ? <div className={listStyles.add}>
      <label>Новая комната<input aria-label="Название комнаты" value={newRoom} disabled={busy} onChange={event => setNewRoom(event.target.value)} /></label>
      <button className={styles.primary} type="button" disabled={busy || !newRoom.trim()} onClick={() => void addRoom()}>{busy ? 'Сохраняем…' : 'Добавить комнату'}</button>
      {error ? <p role="alert" className={styles.error}>{error}</p> : null}
    </div> : null}
    {onAttach && !onAddRoom && (role === 'owner' || role === 'sales') ? <div className={styles.attach}>
      <h3>Добавить существующее помещение</h3>
      <p className={styles.muted}>Расчёт, документы и история сохранятся в исходной карточке.</p>
      <div className={styles.actions}><select aria-label="Помещение без проекта" value={roomId} disabled={busy || !eligible.length} onChange={event => setRoomId(event.target.value)}>
        <option value="">{eligible.length ? 'Выберите помещение' : 'Нет помещений без проекта'}</option>
        {eligible.map(room => <option value={room.id} key={room.id}>{room.roomName || room.clientName || 'Помещение'} · {room.room.areaM2 ?? '—'} м²</option>)}
      </select><button className={styles.primary} disabled={busy || !roomId} onClick={() => void attach()}>{busy ? 'Сохраняем…' : 'Добавить в проект'}</button></div>
      {error ? <p role="alert" className={styles.error}>{error}</p> : null}
    </div> : null}
  </section>;
}
