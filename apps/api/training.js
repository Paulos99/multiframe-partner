/**
 * Обучение в аналитике: подходы тренажёра и открытия материалов.
 *
 * Хранилище — тот же бакет, что и у остальных документов (никаких новых ресурсов): по одному JSON на компанию,
 * `training/<id компании>.json`. Запись — «id → запись»: повтор той же записи (кабинет отправил после обрыва связи)
 * не плодит дублей. Кто пишет — берётся из токена, а не из тела запроса.
 *
 *   POST /training/sync                {attempts:[], materials:[]} — свой журнал, любой сотрудник компании и владелец
 *   GET  /training/me                  сводка по себе
 *   GET  /training/org[?orgId=]        таблица по сотрудникам: владелец — своей компании, админ — любой (orgId обязателен)
 *   GET  /training/companies           сводка по всем компаниям — только админ
 *   GET  /training/user/<id сотрудника> страница сотрудника: владелец — своей компании, админ — любой, сотрудник — себя
 *
 * Менеджер, замерщик и монтажник чужого обучения не видят. Для демо-компаний к настоящим записям добавляются
 * готовые данные (`packages/shared/trainingDemo.js`), в бакет они не пишутся.
 */
import {
  MAX_ATTEMPTS_PER_USER,
  MAX_BATCH,
  MAX_MATERIAL_OPENS,
  normalizeMaterialOpen,
  normalizeTrainingAttempt,
  recentAttempts,
  summarizeCompanyTraining,
  summarizeUserTraining,
  unionById,
} from '../../packages/shared/trainingStats.js';
import { demoTrainingFor, isDemoTrainingOrg } from '../../packages/shared/trainingDemo.js';
import { loadStoredDocument, saveStoredDocument } from './platformStore.js';

const STAFF_ROLES = ['sales', 'measurer', 'crew'];
const WRITE_ROLES = ['owner', ...STAFF_ROLES];
const ORG_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

const byFinishedDesc = (a, b) => String(b.finishedAt).localeCompare(String(a.finishedAt));
const byAtDesc = (a, b) => String(b.at).localeCompare(String(a.at));

function emptyDoc() {
  return { version: 1, users: {} };
}

function normalizeDoc(parsed) {
  if (!parsed || typeof parsed !== 'object' || typeof parsed.users !== 'object' || !parsed.users) return emptyDoc();
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

function docSpec(orgId) {
  return {
    key: () => `training/${orgId}.json`,
    accept: (value) => Boolean(value && typeof value.users === 'object'),
    normalize: normalizeDoc,
    fallback: () => emptyDoc(),
    merge: mergeTrainingDocument,
  };
}

function fail(status, message) {
  return { status, body: { message } };
}

/** Записи человека: настоящие плюс демонстрационные для демо-компаний. */
function recordsFor(doc, user, nowMs) {
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

function compactRow(user, normalizeRole, summary) {
  return {
    id: user.id,
    displayName: user.displayName || user.login,
    role: normalizeRole(user.role),
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

export async function handleTraining({ path, method, requireAuth, getQuery, json, getBody, normalizeRole, now = () => Date.now() }) {
  const m = /\/training\/(sync|me|org|companies|user)(?:\/([^/]+))?$/.exec(path);
  if (!m) return null;
  const [, action, param] = m;
  const nowMs = now();
  const { platform, user } = await requireAuth();
  const role = normalizeRole(user.role);
  const staffOf = (orgId) =>
    (platform.users || []).filter((u) => u.orgId === orgId && STAFF_ROLES.includes(normalizeRole(u.role)));
  const orgOf = (orgId) => (platform.orgs || []).find((o) => o.id === orgId) || null;

  const send = ({ status, body }) => json(status, body);

  if (action === 'sync') {
    if (method !== 'POST') return json(405, { message: 'Метод не поддерживается' });
    if (!user.orgId || !WRITE_ROLES.includes(role)) {
      return send(fail(403, 'Обучение записывается за сотрудником компании'));
    }
    const body = getBody() || {};
    const rawAttempts = Array.isArray(body.attempts) ? body.attempts : [];
    const rawMaterials = Array.isArray(body.materials) ? body.materials : [];
    if (rawAttempts.length + rawMaterials.length > MAX_BATCH * 2) return send(fail(413, 'Слишком много записей за раз'));
    const attempts = rawAttempts.map((a) => normalizeTrainingAttempt(a, nowMs));
    const materials = rawMaterials.map((x) => normalizeMaterialOpen(x, nowMs));
    const spec = docSpec(user.orgId);
    const loaded = await loadStoredDocument(spec);
    const doc = structuredClone(loaded);
    const own = doc.users[user.id] || { attempts: [], materials: [] };
    const have = new Set([...own.attempts, ...own.materials].map((r) => r.id));
    const fresh = {
      attempts: attempts.filter((a) => a && !have.has(a.id)),
      materials: materials.filter((x) => x && !have.has(x.id)),
    };
    if (fresh.attempts.length || fresh.materials.length) {
      doc.users[user.id] = {
        attempts: unionById(fresh.attempts, own.attempts).sort(byFinishedDesc).slice(0, MAX_ATTEMPTS_PER_USER),
        materials: unionById(fresh.materials, own.materials).sort(byAtDesc).slice(0, MAX_MATERIAL_OPENS),
      };
      await saveStoredDocument(spec, doc, loaded);
    }
    // Записи, прошедшие проверку, считаются принятыми, даже если уже были: кабинет может убрать их из очереди.
    const acceptedAttemptIds = attempts.filter(Boolean).map((a) => a.id);
    const acceptedMaterialIds = materials.filter(Boolean).map((x) => x.id);
    return json(200, {
      acceptedAttemptIds,
      acceptedMaterialIds,
      rejected: rawAttempts.length - acceptedAttemptIds.length + (rawMaterials.length - acceptedMaterialIds.length),
      stored: fresh.attempts.length + fresh.materials.length,
    });
  }

  if (method !== 'GET') return json(405, { message: 'Метод не поддерживается' });

  const loadDoc = (orgId) => loadStoredDocument(docSpec(orgId));
  const summaryOf = (doc, u) => {
    const r = recordsFor(doc, u, nowMs);
    return { ...r, summary: summarizeUserTraining(r.attempts, r.materials) };
  };

  if (action === 'me') {
    if (!user.orgId || !WRITE_ROLES.includes(role)) return send(fail(403, 'Обучение доступно сотруднику компании'));
    const doc = await loadDoc(user.orgId);
    const r = summaryOf(doc, user);
    return json(200, { summary: r.summary, attempts: recentAttempts(r.attempts) });
  }

  if (action === 'org') {
    if (role !== 'owner' && role !== 'admin') return send(fail(403, 'Обучение сотрудников доступно владельцу компании'));
    const query = getQuery() || {};
    const asked = String(query.orgId || '').trim();
    if (asked && !ORG_ID_RE.test(asked)) return send(fail(400, 'Неверная компания'));
    let orgId;
    if (role === 'owner') {
      if (!user.orgId) return send(fail(400, 'Нет организации'));
      if (asked && asked !== user.orgId) return send(fail(403, 'Это чужая компания'));
      orgId = user.orgId;
    } else {
      if (!asked) return send(fail(400, 'Укажите компанию'));
      orgId = asked;
    }
    const org = orgOf(orgId);
    if (!org) return send(fail(404, 'Компания не найдена'));
    const doc = await loadDoc(orgId);
    const rows = staffOf(orgId).map((u) => ({ u, ...summaryOf(doc, u) }));
    return json(200, {
      org: { id: org.id, name: org.name },
      summary: summarizeCompanyTraining(rows.map((r) => r.summary), nowMs),
      employees: rows
        .map((r) => compactRow(r.u, normalizeRole, r.summary))
        .sort((a, b) => String(a.displayName).localeCompare(String(b.displayName), 'ru')),
    });
  }

  if (action === 'companies') {
    if (role !== 'admin') return send(fail(403, 'Обучение по компаниям доступно администратору'));
    const companies = [];
    for (const org of platform.orgs || []) {
      const doc = await loadDoc(org.id);
      const summaries = staffOf(org.id).map((u) => summaryOf(doc, u).summary);
      companies.push({ id: org.id, name: org.name, city: org.settings?.city || '', summary: summarizeCompanyTraining(summaries, nowMs) });
    }
    companies.sort((a, b) => String(a.name).localeCompare(String(b.name), 'ru'));
    return json(200, { companies });
  }

  // action === 'user'
  const target = (platform.users || []).find((u) => u.id === param);
  const targetRole = target ? normalizeRole(target.role) : null;
  const isStaff = Boolean(target && target.orgId && STAFF_ROLES.includes(targetRole));
  const allowed =
    role === 'admin' ||
    (role === 'owner' && target?.orgId === user.orgId) ||
    (WRITE_ROLES.includes(role) && target?.id === user.id);
  if (!target || !isStaff) {
    // Чужую или несуществующую запись не различаем: ответ один.
    if (role === 'owner' || role === 'admin' || target?.id === user.id) return send(fail(404, 'Сотрудник не найден'));
    return send(fail(403, 'Обучение других сотрудников недоступно'));
  }
  if (!allowed) {
    return send(role === 'owner' ? fail(404, 'Сотрудник не найден') : fail(403, 'Обучение других сотрудников недоступно'));
  }
  const org = orgOf(target.orgId);
  const doc = await loadDoc(target.orgId);
  const r = summaryOf(doc, target);
  return json(200, {
    employee: { id: target.id, displayName: target.displayName || target.login, role: targetRole },
    org: org ? { id: org.id, name: org.name } : null,
    summary: r.summary,
    attempts: recentAttempts(r.attempts),
  });
}
