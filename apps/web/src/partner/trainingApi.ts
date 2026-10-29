/**
 * Обучение в аналитике: запросы к серверу. Без сервера (локальный режим кабинета) те же ответы собираются
 * из браузерной базы теми же функциями, что и на сервере (`packages/shared/trainingService.js`).
 */
import {
  STAFF_ROLES,
  applyTrainingSync,
  companyTrainingSummary,
  emptyTrainingDoc,
  normalizeTrainingDoc,
  viewTrainingOrg,
  viewTrainingUser,
} from '../../../../packages/shared/trainingService.js';
import { MAX_BATCH } from '../../../../packages/shared/trainingStats.js';
import { normalizeRole } from '../../../../packages/shared/partner';
import {
  apiTrainingCompanies,
  apiTrainingOrg,
  apiTrainingSync,
  apiTrainingUser,
  hasRemoteApi,
  type TrainingSyncAck,
} from './apiClient';
import { loadDb, loadSession } from './localStore';
import type { TrainingCompanyRow, TrainingDoc, TrainingOrgView, TrainingUserView } from '../../../../packages/shared/trainingService.js';

export type { TrainingCompanyRow, TrainingOrgView, TrainingUserView };

const LOCAL_KEY = 'mf_training_local_v1';

function readLocal(): Record<string, TrainingDoc> {
  try {
    const parsed = JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}') as Record<string, unknown>;
    return Object.fromEntries(Object.entries(parsed).map(([k, v]) => [k, normalizeTrainingDoc(v)]));
  } catch {
    return {};
  }
}

const roleOf = (role?: string) => normalizeRole(role);

function localStaff(orgId: string) {
  return loadDb().users.filter((u) => u.orgId === orgId && ([...STAFF_ROLES, 'stp_manager'] as string[]).includes(roleOf(u.role)));
}

export async function sendTrainingSync(body: { attempts: unknown[]; materials: unknown[] }): Promise<TrainingSyncAck> {
  if (hasRemoteApi()) return apiTrainingSync(body);
  const session = loadSession();
  if (!session?.orgId) throw new Error('Нет компании');
  const docs = readLocal();
  const doc = docs[session.orgId] ?? emptyTrainingDoc();
  const out = applyTrainingSync(doc, session.id, body, Date.now(), MAX_BATCH);
  if ('tooMany' in out && out.tooMany) throw new Error('Слишком много записей за раз');
  if ('next' in out && out.next) {
    docs[session.orgId] = out.next;
    localStorage.setItem(LOCAL_KEY, JSON.stringify(docs));
  }
  return (out as { result: TrainingSyncAck }).result;
}

export async function fetchTrainingOrg(orgId: string | null): Promise<TrainingOrgView> {
  if (hasRemoteApi()) return apiTrainingOrg(orgId);
  const id = orgId || loadSession()?.orgId;
  const org = loadDb().orgs.find((o) => o.id === id);
  if (!id || !org) throw new Error('Компания не найдена');
  return viewTrainingOrg({ org, staff: localStaff(id), doc: readLocal()[id] ?? emptyTrainingDoc(), nowMs: Date.now(), roleOf });
}

export async function fetchTrainingCompanies(): Promise<TrainingCompanyRow[]> {
  if (hasRemoteApi()) return (await apiTrainingCompanies()).companies;
  const docs = readLocal();
  return loadDb()
    .orgs.map((org) => companyTrainingSummary({ org, staff: localStaff(org.id), doc: docs[org.id] ?? emptyTrainingDoc(), nowMs: Date.now() }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}

export async function fetchTrainingUser(userId: string): Promise<TrainingUserView> {
  if (hasRemoteApi()) return apiTrainingUser(userId);
  const db = loadDb();
  const user = db.users.find((u) => u.id === userId);
  if (!user?.orgId) throw new Error('Сотрудник не найден');
  return viewTrainingUser({
    user,
    role: roleOf(user.role),
    org: db.orgs.find((o) => o.id === user.orgId) ?? null,
    doc: readLocal()[user.orgId] ?? emptyTrainingDoc(),
    nowMs: Date.now(),
  });
}
