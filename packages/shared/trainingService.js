/**
 * Обучение в аналитике: сборка ответов из документа обучения. Общий код сервера (`apps/api/training.js`)
 * и локального режима кабинета (без сервера). Права здесь не проверяются: это делает вызывающий.
 *
 * Документ компании: `{ version: 1, users: { [userId]: { attempts: [], materials: [] } } }`.
 */
import {
  MAX_ATTEMPTS_PER_USER,
  MAX_MATERIAL_OPENS,
  normalizeMaterialOpen,
  normalizeTrainingAttempt,
  recentAttempts,
  summarizeCompanyTraining,
  summarizeUserTraining,
  unionById,
} from './trainingStats.js';
import { demoTrainingFor, isDemoTrainingOrg } from './trainingDemo.js';

export const STAFF_ROLES = ['sales', 'measurer', 'crew'];

const orgName = (org) => org.settings?.companyName || org.name || 'Компания';

const byFinishedDesc = (a, b) => String(b.finishedAt).localeCompare(String(a.finishedAt));
const byAtDesc = (a, b) => String(b.at).localeCompare(String(a.at));

export function emptyTrainingDoc() {
  return { version: 1, users: {} };
}

export function normalizeTrainingDoc(parsed) {
  if (!parsed || typeof parsed !== 'object' || typeof parsed.users !== 'object' || !parsed.users) return emptyTrainingDoc();
  return parsed;
}

/** Сведение двух версий документа: записи только добавляются, поэтому достаточно объединения по id. */
export function mergeTrainingDocument(base, desired, fresh) {
  const users = {};
  const ids = new Set([...Object.keys(fresh?.users || {}), ...Object.keys(desired?.users || {})]);
  for (const id of ids) {
    const a = fresh?.users?.[id] || {};
    const b = desired?.users?.[id] || {};
    users[id] = {
      attempts: unionById(a.attempts, b.attempts).sort(byFinishedDesc).slice(0, MAX_ATTEMPTS_PER_USER),
      materials: unionById(a.materials, b.materials).sort(byAtDesc).slice(0, MAX_MATERIAL_OPENS),
    };
  }
  return { version: 1, users };
}

/**
 * Принимает пачку записей от пользователя. Возвращает новый документ (или null, если нечего менять) и ответ.
 * Принятыми считаются все записи, прошедшие проверку, даже если они уже были: кабинет вправе убрать их из очереди.
 */
export function applyTrainingSync(doc, userId, body, nowMs, maxBatch) {
  const rawAttempts = Array.isArray(body?.attempts) ? body.attempts : [];
  const rawMaterials = Array.isArray(body?.materials) ? body.materials : [];
  if (rawAttempts.length + rawMaterials.length > maxBatch * 2) return { tooMany: true };
  const attempts = rawAttempts.map((a) => normalizeTrainingAttempt(a, nowMs));
  const materials = rawMaterials.map((x) => normalizeMaterialOpen(x, nowMs));
  const own = doc.users[userId] || { attempts: [], materials: [] };
  const have = new Set([...own.attempts, ...own.materials].map((r) => r.id));
  const fresh = {
    attempts: attempts.filter((a) => a && !have.has(a.id)),
    materials: materials.filter((x) => x && !have.has(x.id)),
  };
  let next = null;
  if (fresh.attempts.length || fresh.materials.length) {
    next = structuredClone(doc);
    next.users[userId] = {
      attempts: unionById(fresh.attempts, own.attempts).sort(byFinishedDesc).slice(0, MAX_ATTEMPTS_PER_USER),
      materials: unionById(fresh.materials, own.materials).sort(byAtDesc).slice(0, MAX_MATERIAL_OPENS),
    };
  }
  const acceptedAttemptIds = attempts.filter(Boolean).map((a) => a.id);
  const acceptedMaterialIds = materials.filter(Boolean).map((x) => x.id);
  return {
    next,
    result: {
      acceptedAttemptIds,
      acceptedMaterialIds,
      rejected: rawAttempts.length - acceptedAttemptIds.length + (rawMaterials.length - acceptedMaterialIds.length),
      stored: fresh.attempts.length + fresh.materials.length,
    },
  };
}

/** Записи человека: настоящие плюс демонстрационные для демо-компаний. */
export function trainingRecordsFor(doc, user, nowMs) {
  const own = doc.users?.[user.id] || {};
  let attempts = own.attempts || [];
  let materials = own.materials || [];
  if (isDemoTrainingOrg(user.orgId)) {
    const demo = demoTrainingFor(user.login, nowMs);
    attempts = unionById(attempts, demo.attempts);
    materials = unionById(materials, demo.materials);
  }
  return { attempts, materials };
}

function userSummary(doc, user, nowMs) {
  const r = trainingRecordsFor(doc, user, nowMs);
  return { ...r, summary: summarizeUserTraining(r.attempts, r.materials) };
}

function compactRow(user, role, summary) {
  return {
    id: user.id,
    displayName: user.displayName || user.login,
    role,
    sets: summary.sets,
    level: summary.level,
    levelShare: summary.levelShare,
    quizShare: summary.quizShare,
    lastActivityAt: summary.lastActivityAt,
    weakTopics: summary.weakTopics.slice(0, 3),
    weakCriteria: summary.weakCriteria.slice(0, 2).map(({ id, title, avg }) => ({ id, title, avg })),
    materialsOpened: summary.materialsOpened,
  };
}

/** `staff` — сотрудники компании (менеджер, замерщик, монтажник); `roleOf` приводит роль к основной. */
export function viewTrainingOrg({ org, staff, doc, nowMs, roleOf }) {
  const rows = staff.map((u) => ({ u, ...userSummary(doc, u, nowMs) }));
  return {
    org: { id: org.id, name: orgName(org) },
    summary: summarizeCompanyTraining(rows.map((r) => r.summary), nowMs),
    employees: rows
      .map((r) => compactRow(r.u, roleOf(r.u.role), r.summary))
      .sort((a, b) => String(a.displayName).localeCompare(String(b.displayName), 'ru')),
  };
}

export function companyTrainingSummary({ org, staff, doc, nowMs }) {
  const summaries = staff.map((u) => userSummary(doc, u, nowMs).summary);
  return { id: org.id, name: orgName(org), city: org.settings?.city || '', summary: summarizeCompanyTraining(summaries, nowMs) };
}

export function viewTrainingUser({ user, role, org, doc, nowMs }) {
  const r = userSummary(doc, user, nowMs);
  return {
    employee: { id: user.id, displayName: user.displayName || user.login, role },
    org: org ? { id: org.id, name: orgName(org) } : null,
    summary: r.summary,
    attempts: recentAttempts(r.attempts),
  };
}

export function viewTrainingMe({ user, doc, nowMs }) {
  const r = userSummary(doc, user, nowMs);
  return { summary: r.summary, attempts: recentAttempts(r.attempts) };
}
