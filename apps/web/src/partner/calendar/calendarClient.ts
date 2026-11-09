/**
 * Обмен с сервером по календарю. Без сервера (работа только в этом браузере) выезды и отметки
 * хранятся в localStorage устройства: календарь работает так же, только без общих данных.
 */
import type { ReminderAck, Visit } from '../../../../../packages/shared/calendar.js';
import { cleanVisitInput, findConflicts, visitRoleAllowed } from '../../../../../packages/shared/calendar.js';
import { hasRemoteApi, request } from '../apiClient';
import { listStaffForOrg, loadSession } from '../localStore';

export type CalendarPerson = { id: string; name: string; role: string; orgId: string | null };
export type CalendarData = { visits: Visit[]; people: CalendarPerson[]; acks: ReminderAck[]; canPlan: boolean };
export type VisitInput = {
  kind: 'measure' | 'install';
  projectId: string;
  objectId?: string | null;
  startsAt: string;
  durationMin: number;
  userId: string;
  note?: string;
  done?: boolean;
};
export type SaveResult = { visit: Visit; conflicts: Visit[] };

const LOCAL_KEY = 'mf_calendar_v1';

type LocalState = { visits: Visit[]; acks: ReminderAck[] };

function readLocal(): LocalState {
  try {
    const raw = JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}') as Partial<LocalState>;
    return { visits: Array.isArray(raw.visits) ? raw.visits : [], acks: Array.isArray(raw.acks) ? raw.acks : [] };
  } catch {
    return { visits: [], acks: [] };
  }
}

function writeLocal(state: LocalState) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(state));
}

function localPeople(): CalendarPerson[] {
  const session = loadSession();
  if (!session?.orgId) return [];
  const staff = listStaffForOrg(session.orgId) as Array<{ id: string; displayName?: string; login: string; role: string; orgId: string | null }>;
  const me = { id: session.id, displayName: session.displayName, login: session.login, role: session.role, orgId: session.orgId };
  return [me, ...staff.filter((s) => s.id !== me.id)].map((u) => ({ id: u.id, name: u.displayName || u.login, role: u.role, orgId: u.orgId }));
}

function localCanPlan(): boolean {
  const role = loadSession()?.role;
  return role === 'owner' || role === 'sales';
}

export async function fetchCalendar(): Promise<CalendarData> {
  if (hasRemoteApi()) return request<CalendarData>('/calendar');
  const session = loadSession();
  const state = readLocal();
  const people = localPeople();
  const names = new Map(people.map((p) => [p.id, p.name]));
  const role = session?.role;
  const visits = state.visits
    .filter((v) => v.orgId === session?.orgId && (role === 'owner' || role === 'sales' || v.userId === session?.id))
    .map((v) => ({ ...v, userName: names.get(v.userId) || 'Сотрудник' }));
  return { visits, people: localCanPlan() ? people : [], acks: state.acks.filter((a) => a.userId === session?.id), canPlan: localCanPlan() };
}

export async function saveVisit(input: VisitInput, id?: string | null): Promise<SaveResult> {
  if (hasRemoteApi()) {
    return id
      ? request<SaveResult>(`/calendar/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) })
      : request<SaveResult>('/calendar', { method: 'POST', body: JSON.stringify(input) });
  }
  const session = loadSession();
  if (!session?.orgId || !localCanPlan()) throw new Error('Назначать выезды может владелец или менеджер');
  const state = readLocal();
  const existing = id ? state.visits.find((v) => v.id === id) || null : null;
  const cleaned = cleanVisitInput(input, existing);
  if (cleaned.error || !cleaned.value) throw new Error(cleaned.error || 'Ошибка');
  const person = localPeople().find((p) => p.id === cleaned.value!.userId);
  if (!person || !visitRoleAllowed(cleaned.value.kind, person.role)) throw new Error('Исполнитель не подходит для этого выезда');
  const now = new Date().toISOString();
  const { done, ...value } = cleaned.value;
  const visit: Visit = {
    ...(existing || { id: `vis_${Date.now().toString(36)}`, orgId: session.orgId, createdBy: session.id, createdAt: now }),
    ...value,
    doneAt: done ? existing?.doneAt || now : null,
    updatedAt: now,
  } as Visit;
  state.visits = existing ? state.visits.map((v) => (v.id === visit.id ? visit : v)) : [visit, ...state.visits];
  writeLocal(state);
  return { visit, conflicts: findConflicts(state.visits, visit) };
}

export async function deleteVisit(id: string): Promise<void> {
  if (hasRemoteApi()) {
    await request(`/calendar/${encodeURIComponent(id)}`, { method: 'DELETE' });
    return;
  }
  const state = readLocal();
  state.visits = state.visits.filter((v) => v.id !== id);
  writeLocal(state);
}

export async function markVisitDone(id: string, done: boolean): Promise<SaveResult> {
  if (hasRemoteApi()) {
    return request<SaveResult>(`/calendar/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ done }) });
  }
  const state = readLocal();
  const now = new Date().toISOString();
  state.visits = state.visits.map((v) => (v.id === id ? { ...v, doneAt: done ? now : null, updatedAt: now } : v));
  writeLocal(state);
  return { visit: state.visits.find((v) => v.id === id)!, conflicts: [] };
}

export async function ackReminder(key: string, action: 'done' | 'snooze' | 'reset', until?: string): Promise<void> {
  if (hasRemoteApi()) {
    await request('/calendar/reminders', { method: 'POST', body: JSON.stringify({ key, action, until }) });
    return;
  }
  const session = loadSession();
  if (!session) return;
  const state = readLocal();
  const id = `${session.id}|${key}`;
  const now = new Date().toISOString();
  state.acks = state.acks.filter((a) => a.id !== id);
  if (action !== 'reset') {
    state.acks.unshift({ id, userId: session.id, key, doneAt: action === 'done' ? now : null, snoozeUntil: action === 'snooze' ? until || null : null, updatedAt: now });
  }
  writeLocal(state);
}
