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
import { MAX_BATCH } from '../../packages/shared/trainingStats.js';
import {
  STAFF_ROLES,
  applyTrainingSync,
  companyTrainingSummary,
  emptyTrainingDoc,
  mergeTrainingDocument,
  normalizeTrainingDoc,
  viewTrainingMe,
  viewTrainingOrg,
  viewTrainingUser,
} from '../../packages/shared/trainingService.js';
import { loadStoredDocument, saveStoredDocument } from './platformStore.js';

export { mergeTrainingDocument };

const WRITE_ROLES = ['owner', ...STAFF_ROLES];
const ORG_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

function docSpec(orgId) {
  return {
    key: () => `training/${orgId}.json`,
    accept: (value) => Boolean(value && typeof value.users === 'object'),
    normalize: normalizeTrainingDoc,
    fallback: () => emptyTrainingDoc(),
    merge: mergeTrainingDocument,
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
  const loadDoc = (orgId) => loadStoredDocument(docSpec(orgId));
  const deny = (status, message) => json(status, { message });

  if (action === 'sync') {
    if (method !== 'POST') return deny(405, 'Метод не поддерживается');
    if (!user.orgId || !WRITE_ROLES.includes(role)) return deny(403, 'Обучение записывается за сотрудником компании');
    const spec = docSpec(user.orgId);
    const loaded = await loadStoredDocument(spec);
    const out = applyTrainingSync(loaded, user.id, getBody() || {}, nowMs, MAX_BATCH);
    if (out.tooMany) return deny(413, 'Слишком много записей за раз');
    if (out.next) await saveStoredDocument(spec, out.next, loaded);
    return json(200, out.result);
  }

  if (method !== 'GET') return deny(405, 'Метод не поддерживается');

  if (action === 'me') {
    if (!user.orgId || !WRITE_ROLES.includes(role)) return deny(403, 'Обучение доступно сотруднику компании');
    return json(200, viewTrainingMe({ user, doc: await loadDoc(user.orgId), nowMs }));
  }

  if (action === 'org') {
    if (role !== 'owner' && role !== 'admin') return deny(403, 'Обучение сотрудников доступно владельцу компании');
    const asked = String((getQuery() || {}).orgId || '').trim();
    if (asked && !ORG_ID_RE.test(asked)) return deny(400, 'Неверная компания');
    let orgId;
    if (role === 'owner') {
      if (!user.orgId) return deny(400, 'Нет организации');
      if (asked && asked !== user.orgId) return deny(403, 'Это чужая компания');
      orgId = user.orgId;
    } else {
      if (!asked) return deny(400, 'Укажите компанию');
      orgId = asked;
    }
    const org = orgOf(orgId);
    if (!org) return deny(404, 'Компания не найдена');
    return json(200, viewTrainingOrg({ org, staff: staffOf(orgId), doc: await loadDoc(orgId), nowMs, roleOf: normalizeRole }));
  }

  if (action === 'companies') {
    if (role !== 'admin') return deny(403, 'Обучение по компаниям доступно администратору');
    const companies = [];
    for (const org of platform.orgs || []) {
      companies.push(companyTrainingSummary({ org, staff: staffOf(org.id), doc: await loadDoc(org.id), nowMs }));
    }
    companies.sort((a, b) => String(a.name).localeCompare(String(b.name), 'ru'));
    return json(200, { companies });
  }

  // action === 'user'
  const target = (platform.users || []).find((u) => u.id === param);
  const targetRole = target ? normalizeRole(target.role) : null;
  const isStaff = Boolean(target?.orgId && STAFF_ROLES.includes(targetRole));
  const isSelf = Boolean(target && target.id === user.id);
  if (!target || !isStaff) {
    // Чужую и несуществующую запись не различаем: ответ один.
    return role === 'owner' || role === 'admin' || isSelf ? deny(404, 'Сотрудник не найден') : deny(403, 'Обучение других сотрудников недоступно');
  }
  const allowed = role === 'admin' || (role === 'owner' && target.orgId === user.orgId) || (WRITE_ROLES.includes(role) && isSelf);
  if (!allowed) {
    return role === 'owner' ? deny(404, 'Сотрудник не найден') : deny(403, 'Обучение других сотрудников недоступно');
  }
  return json(
    200,
    viewTrainingUser({ user: target, role: targetRole, org: orgOf(target.orgId), doc: await loadDoc(target.orgId), nowMs }),
  );
}
