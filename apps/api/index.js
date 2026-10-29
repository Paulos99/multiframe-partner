import { handleProfile, profileWithAvatar } from './profileRoutes.js';
/**
 * Yandex Cloud Function HTTP handler — multi-role partner platform.
 * Storage: Object Storage JSON or in-memory seed.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import {
  LOGIN_LOCK,
  SECURITY_HEADERS,
  clientIp,
  corsOriginFor,
  dummyCompare,
  hashPassword,
  passwordProblem,
  rateCheck,
  rateHit,
  rateReset,
  safeEqual,
} from './security.js';
import { signToken as signAuthToken, verifyToken } from './authTokens.js';
import { ensureIndexFromTsv, resolveCity } from './cityCatalog.js';
import ruCitiesTsv from './data/ru-cities.js';
import {
  buildDemoAnalyticsEvents,
  buildDemoPlatform,
  ensureDemoStpManager,
  extendDemoAnalyticsHistory,
} from './demoSeed.js';
import { findVisibleDocument, incomingDocumentKind, visibleDocuments } from './documentAccess.js';
import { handleMaterials } from './materialsRoutes.js';
import { handleMaterialPreview } from './materialsPreview.js';
import { handleMaterialThumbnail } from './materialsThumbnail.js';
import {
  loadStoredDocument,
  mergeEventList,
  mergePlatformDocument,
  resetStoredDocumentsForTests,
  saveStoredDocument,
} from './platformStore.js';
import { handleRoomShare } from './roomShare.js';
import { handleTraining } from './training.js';
import { handleRoomPhotos, photoCountsForObject, removePhotoFiles, clientReport } from './roomPhotos.js';
import { applyObjectProjectFields, ensureProjectForNewObject, handleProjects } from './projects.js';
import { computeAnalyticsFunnel } from '../../packages/shared/funnel.js';
import { buildStaffDrill } from '../../packages/shared/staffDrill.js';
import { groupOrphanRooms } from '../../packages/shared/groupProjects.js';
import { estimateForRole } from '../../packages/shared/projectAccess.js';
import { applyDemoPersonalNames, normalizePersonName } from '../../packages/shared/personName.js';
import {
  STP_MANAGER_ROLE,
  STP_ORG_ID,
  STP_ORG_NAME,
  isStpManager,
  stpManagerMayCall,
} from '../../packages/shared/rolePermissions.js';
import {
  deleteObject,
  getObjectBuffer,
  getObjectText,
  partnerBucket,
  putObject,
} from './objectStore.js';

ensureIndexFromTsv(ruCitiesTsv);

const ANALYTICS_ADMIN_KEY = () => {
  const key = process.env.ANALYTICS_ADMIN_KEY;
  if (!key) throw new Error('ANALYTICS_ADMIN_KEY must be configured');
  return key;
};
const PLATFORM_S3_KEY = () => process.env.PLATFORM_KEY || 'platform-v2.json';
const ANALYTICS_S3_KEY = () => process.env.ANALYTICS_KEY || 'analytics-events.json';
const ANALYTICS_CAP = 5000;
const OBJECTS_CAP = 5000;

const ORG_ROLES = ['owner', 'sales', 'measurer', 'crew'];
const STAFF_ROLES = ['sales', 'measurer', 'crew'];
/** Владелец и менеджер компании. Админ StP сотрудников компании здесь не ведёт. */
const STAFF_MANAGER_ROLES = ['owner'];
const OFFICIAL_PANEL = 2396;
const OFFICIAL_M2 = 5990;
const DEFAULT_INSTALL = 1500;
const DEFAULT_DOWEL = 25;

/** Origin текущего запроса. Нужен, чтобы отвечать одним разрешённым origin из списка CORS_ORIGIN. */
const requestContext = new AsyncLocalStorage();

/** Объект с геттерами: при разворачивании (...CORS) отдаёт origin текущего запроса. */
const CORS = {
  get 'Access-Control-Allow-Origin'() {
    return corsOriginFor(requestContext.getStore()?.origin);
  },
  'Access-Control-Allow-Headers':
    'Content-Type, Authorization, X-Analytics-Key, X-Analytics-Role, X-Analytics-Org, X-Partner-Login',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
  'Access-Control-Max-Age': '600',
  Vary: 'Origin',
  ...SECURITY_HEADERS,
};

const MAX_BODY_BYTES = Math.max(100_000, Number(process.env.MAX_BODY_BYTES) || 6_000_000);
const OBJECT_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

function uid(prefix) {
  return `${prefix}_${randomBytes(9).toString('hex')}${Date.now().toString(36).slice(-4)}`;
}

function cityOrThrow(raw, previous) {
  const resolved = resolveCity(raw, previous);
  if (!resolved.ok) {
    throw Object.assign(new Error(resolved.message), { status: 400 });
  }
  return resolved.city;
}

function normalizeRole(role) {
  if (role === 'partner') return 'owner';
  if (role === 'executor' || role === 'exec') return 'measurer';
  if (role === 'manager') return 'sales';
  if (role === 'installer' || role === 'install') return 'crew';
  if (['admin', 'owner', 'sales', 'measurer', 'crew', STP_MANAGER_ROLE].includes(role)) return role;
  return 'measurer';
}

/**
 * Роль нового сотрудника. Пустое значение — замерщик.
 * owner, admin (StP) и прочие роли не назначаются.
 */
function assignableStaffRole(raw) {
  const requested = String(raw ?? '').trim();
  if (!requested) return 'measurer';
  if (requested === 'executor') return 'measurer';
  if (STAFF_ROLES.includes(requested)) return requested;
  return null;
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function normalizeOrgSettings(partial = {}) {
  const optional = (value, max) =>
    value == null || value === '' || !Number.isFinite(Number(value)) ? null : clampNumber(value, 0, max, null);
  return {
    companyName: String(partial.companyName || '').trim().slice(0, 120),
    city: String(partial.city || '').trim().slice(0, 120),
    panelPriceRub:
      partial.panelPriceRub != null && Number(partial.panelPriceRub) > 0
        ? clampNumber(partial.panelPriceRub, 1, 1_000_000, OFFICIAL_PANEL)
        : OFFICIAL_PANEL,
    pricePerM2:
      partial.pricePerM2 != null && Number(partial.pricePerM2) > 0
        ? clampNumber(partial.pricePerM2, 1, 1_000_000, OFFICIAL_M2)
        : OFFICIAL_M2,
    installPricePerM2: optional(partial.installPricePerM2, 1_000_000),
    dowelsPerPanel: clampNumber(Number(partial.dowelsPerPanel) || 2, 1, 50, 2),
    dowelPriceRub: optional(partial.dowelPriceRub, 100_000),
  };
}

function publicUser(user, org) {
  const role = normalizeRole(user.role);
  // У менеджера StP нет прайса партнёра: цены компании ему не отдаются.
  let settings = org && !isStpManager(role) ? normalizeOrgSettings(org.settings) : null;
  return {
    id: user.id,
    login: user.login,
    role,
    displayName: user.displayName,
    orgId: user.orgId || null,
    org: settings,
    avatarUrl: null,
  };
}

/** Пользователь для ответов входа и /auth/me: с актуальной ссылкой на фото профиля.
 * Ссылка подписывается заново при каждом запросе (срок жизни ограничен), поэтому
 * шапка кабинета показывает фото сразу после загрузки страницы. Сбой подписи не ломает вход. */
async function sessionUser(user, platform) {
  try {
    return await profileWithAvatar(user, platform, { publicUser });
  } catch {
    return publicUser(user, user.orgId ? findOrg(platform, user.orgId) : null);
  }
}

/** Демо-данные нужны только пока нет своего хранилища или явно включён DEMO_SEED=1.
 * Для боевого стенда задайте ADMIN_BOOTSTRAP_LOGIN и ADMIN_BOOTSTRAP_PASSWORD: создаётся один администратор. */
function demoSeedEnabled() {
  const flag = String(process.env.DEMO_SEED || '').trim().toLowerCase();
  if (flag === '1' || flag === 'true') return true;
  if (flag === '0' || flag === 'false') return false;
  // Без явного флага демо поднимается только при локальной разработке: без бакета и вне NODE_ENV=production.
  return !partnerBucket() && process.env.NODE_ENV !== 'production';
}

export function bootstrapAdminPlatform() {
  const login = String(process.env.ADMIN_BOOTSTRAP_LOGIN || '').trim();
  const password = String(process.env.ADMIN_BOOTSTRAP_PASSWORD || '');
  if (!login || passwordProblem(password)) return null;
  return {
    version: 2,
    users: [
      {
        id: 'u_admin',
        login,
        passwordHash: bcrypt.hashSync(password, 12),
        role: 'admin',
        displayName: String(process.env.ADMIN_BOOTSTRAP_NAME || 'Администратор').trim() || 'Администратор',
        orgId: null,
        createdAt: new Date().toISOString(),
      },
    ],
    orgs: [],
    objects: [],
    activity: [],
  };
}

function defaultPlatform() {
  if (!demoSeedEnabled()) {
    const boot = bootstrapAdminPlatform();
    if (boot) return boot;
    throw Object.assign(
      new Error('Хранилище пусто. Задайте ADMIN_BOOTSTRAP_LOGIN и ADMIN_BOOTSTRAP_PASSWORD (не короче 10 символов).'),
      { status: 503, expose: true },
    );
  }
  return demoPlatform();
}

function demoPlatform() {
  const platform = buildDemoPlatform({ withHashes: true });
  platform.orgs = platform.orgs.map((o) => ({
    ...o,
    settings: normalizeOrgSettings(o.settings),
  }));
  return platform;
}

function migrateLegacyPartners(list) {
  if (!Array.isArray(list) || !list.length) return null;
  if (list[0]?.passwordHash != null && list[0]?.companyName != null && !list.users) {
    const now = new Date().toISOString();
    const platform = { version: 2, users: [], orgs: [], objects: [], activity: [] };
    // Пароль админа при миграции старого файла не задаётся: вход возможен только после ADMIN_BOOTSTRAP_* или сброса.
    const adminHash = bcrypt.hashSync(randomBytes(24).toString('hex'), 10);
    platform.users.push({
      id: 'u_admin',
      login: 'admin',
      passwordHash: adminHash,
      role: 'admin',
      displayName: 'Администратор StP',
      orgId: null,
      createdAt: now,
    });
    for (const row of list) {
      const orgId = `org_${row.id || uid('org')}`;
      platform.orgs.push({
        id: orgId,
        createdAt: now,
        createdBy: 'u_admin',
        settings: normalizeOrgSettings({
          companyName: row.companyName || row.login,
          city: row.city || '',
          panelPriceRub: row.panelPriceRub,
          pricePerM2: row.pricePerM2,
          installPricePerM2: row.installPricePerM2,
          dowelsPerPanel: row.dowelsPerPanel,
          dowelPriceRub: row.dowelPriceRub,
        }),
      });
      platform.users.push({
        id: row.id || uid('u'),
        login: row.login,
        passwordHash: row.passwordHash,
        role: 'owner',
        displayName: row.companyName || row.login,
        orgId,
        createdAt: now,
      });
    }
    return platform;
  }
  return null;
}

/** PDF смет и профилей. Без бакета байты остаются в памяти процесса (демо API). */
const memoryDocs = new Map();

async function s3GetBuffer(key) {
  if (memoryDocs.has(key)) return memoryDocs.get(key);
  const bucket = partnerBucket();
  if (!bucket) return null;
  return getObjectBuffer({ bucket, key });
}

async function s3GetBytes(key) {
  return s3GetBuffer(key);
}

async function s3PutBytes(key, body, contentType) {
  const bucket = partnerBucket();
  if (!bucket) {
    memoryDocs.set(key, Buffer.from(body));
    return;
  }
  await putObject({
    bucket,
    key,
    body,
    contentType: contentType || 'application/octet-stream',
  });
}

/** Общие для фото и клиентской страницы: доступ к хранилищу и заголовки ответа. */
const storageCtx = {
  json: (...args) => json(...args),
  cors: CORS,
  storage: {
    put: (key, body, type) => s3PutBytes(key, body, type),
    get: (key) => s3GetBytes(key),
    del: (key) => s3Delete(key),
  },
};

async function s3Delete(key) {
  memoryDocs.delete(key);
  const bucket = partnerBucket();
  if (!bucket || !key) return;
  try {
    await deleteObject({ bucket, key });
  } catch (e) {
    console.warn('s3 delete failed', key, e?.message || e);
  }
}

/** Локальный JSON только без бакета. В облаке платформа по-прежнему в PARTNERS_BUCKET. */
function platformFilePath() {
  if (partnerBucket()) return '';
  return String(process.env.PLATFORM_FILE || '').trim();
}

/** Только для тестов: кладёт события в журнал как есть, минуя проверку личности на входе. */
export async function seedAnalyticsEventsForTests(events) {
  const existing = await loadEvents();
  await saveEvents([...events, ...existing], existing);
}

export function resetPlatformMemoryForTests() {
  resetStoredDocumentsForTests();
}

function platformDocumentSpec() {
  return {
    key: () => PLATFORM_S3_KEY(),
    filePath: () => platformFilePath(),
    space: 2,
    accept: (parsed) => Boolean(parsed?.users && parsed?.orgs),
    fallback: loadPlatformFallback,
    merge: mergePlatformDocument,
  };
}

function eventsDocumentSpec() {
  return {
    key: () => ANALYTICS_S3_KEY(),
    accept: (value) => Array.isArray(value),
    normalize: (parsed) => (Array.isArray(parsed) ? parsed : parsed?.events || null),
    fallback: () => [],
    merge: mergeEventList,
  };
}

async function loadPlatformFallback() {
  const bucket = partnerBucket();
  if (bucket) {
    try {
      const legacyKey = process.env.PARTNERS_KEY || 'partners.json';
      const body = await getObjectText({ bucket, key: legacyKey });
      if (body) {
        const migrated = migrateLegacyPartners(JSON.parse(body));
        if (migrated) {
          await savePlatform(migrated);
          return migrated;
        }
      }
    } catch (e) {
      console.warn('legacy partners migrate failed', e?.message || e);
    }
  }
  return defaultPlatform();
}

async function loadPlatform() {
  const platform = await loadStoredDocument(platformDocumentSpec());
  const names = Boolean(platform?.users && applyDemoPersonalNames(platform.users));
  const grouped = groupOrphanRooms(platform);
  const stpDemo = Boolean(platform?.users && ensureDemoStpManager(platform));
  if (names || grouped || stpDemo) {
    try {
      await savePlatform(platform);
    } catch (error) {
      console.warn('platform save failed', error?.message || error);
    }
  }
  return platform;
}

async function savePlatform(platform) {
  await saveStoredDocument(platformDocumentSpec(), platform, platform);
}

async function loadEvents() {
  return loadStoredDocument(eventsDocumentSpec());
}

let demoHistoryWrite = null;

async function eventsForAnalytics() {
  const events = await loadEvents();
  const extended = extendDemoAnalyticsHistory(events);
  if (extended === events) return events;
  if (!demoHistoryWrite) {
    demoHistoryWrite = saveEvents(extended, events).catch((error) => {
      demoHistoryWrite = null;
      console.warn('demo analytics history', error?.message || error);
    });
  }
  await demoHistoryWrite;
  return extended;
}

async function saveEvents(list, loaded) {
  await saveStoredDocument(eventsDocumentSpec(), list, loaded);
}

function pushActivity(platform, partial) {
  const ev = {
    id: uid('act'),
    at: partial.at || new Date().toISOString(),
    orgId: partial.orgId ?? null,
    userId: partial.userId ?? null,
    login: partial.login || '',
    action: partial.action,
    detail: partial.detail,
  };
  platform.activity = [ev, ...(platform.activity || [])].slice(0, 500);
}

function findOrg(platform, orgId) {
  return (platform.orgs || []).find((o) => o.id === orgId) || null;
}

function findUser(platform, idOrLogin) {
  return (
    (platform.users || []).find((u) => u.id === idOrLogin || u.login === idOrLogin) || null
  );
}

/** Логин без учёта регистра. Раньше совпадал и идентификатор записи; это сохранено только для точного совпадения. */
function findUserByLogin(platform, login) {
  const text = String(login || '');
  if (!text) return null;
  const lower = text.toLowerCase();
  const users = platform.users || [];
  return (
    users.find((u) => u.login === text) ||
    users.find((u) => String(u.login || '').toLowerCase() === lower) ||
    users.find((u) => u.id === text) ||
    null
  );
}

/** Счётчик неверных паролей хранится в записи пользователя: общий для всех экземпляров функции. */
async function recordLoginFailure(platform, user, nowMs) {
  const row = user.failedLogins;
  const fresh = row && nowMs - Number(row.since || 0) < LOGIN_LOCK.windowMs;
  const next = { count: (fresh ? Number(row.count) || 0 : 0) + 1, since: fresh ? row.since : nowMs };
  user.failedLogins = next;
  if (next.count >= LOGIN_LOCK.failures) {
    user.lockedUntil = new Date(nowMs + LOGIN_LOCK.lockMs).toISOString();
    user.failedLogins = { count: 0, since: nowMs };
    pushActivity(platform, {
      orgId: user.orgId,
      userId: user.id,
      login: user.login,
      action: 'login_locked',
      detail: 'Серия неверных паролей',
    });
  }
  try {
    await savePlatform(platform);
  } catch (error) {
    console.warn('login failure counter not saved', error?.message || error);
  }
}

function loginTaken(platform, login) {
  const lower = String(login || '').toLowerCase();
  return (platform.users || []).some(
    (u) => u.id === login || String(u.login || '').toLowerCase() === lower,
  );
}

async function signToken(user) {
  return signAuthToken({ ...user, role: normalizeRole(user.role) });
}

async function requireAuth(event) {
  const token = getAuth(event);
  if (!token) throw Object.assign(new Error('Unauthorized'), { status: 401 });
  const { payload, usedPreviousKey } = await verifyToken(token);
  const platform = await loadPlatform();
  // Только по идентификатору из токена: совпадение по логину позволило бы старому токену
  // подойти новой учётной записи с тем же логином.
  const user = (platform.users || []).find((u) => u.id === payload.sub) || null;
  if (!user || user.loginDisabled || (payload.sessionVersion || 0) !== (user.sessionVersion || 0)) throw Object.assign(new Error('Unauthorized'), { status: 401 });
  const role = normalizeRole(user.role);
  // Менеджеру StP закрыто всё, чего нет в списке разрешённого (packages/shared/rolePermissions.js).
  if (isStpManager(role) && !stpManagerMayCall(getMethod(event), getPath(event))) {
    throw Object.assign(new Error('Недостаточно прав'), { status: 403 });
  }
  return { platform, user: { ...user, role }, payload, usedPreviousKey };
}

function assertRole(user, roles) {
  if (!roles.includes(user.role)) {
    throw Object.assign(new Error('Недостаточно прав'), { status: 403 });
  }
}

function objectVisibleTo(user, obj) {
  if (user.role === 'admin') return true;
  if (!user.orgId || obj.orgId !== user.orgId) return false;
  if (user.role === 'owner') return true;
  if (user.role === 'sales') {
    // Менеджер видит воронку всей компании (как владелец по объектам).
    return true;
  }
  if (user.role === 'measurer') {
    return obj.assignedTo === user.id;
  }
  if (user.role === 'crew') {
    // Задание видно только тому монтажнику, на кого его назначили.
    return obj.assignedTo === user.id;
  }
  return false;
}

/** Бригада получает количества без цен и сумм. Замерщик и остальные роли видят расчёт целиком. */
function publicObject(obj, role) {
  // Список фото с ключами бакета наружу не уходит: только число по этапам, которые видит роль.
  const { photos: _photos, photoReport: _photoReport, ...rest } = obj;
  void _photos;
  void _photoReport;
  return {
    ...rest,
    photoCounts: photoCountsForObject(obj, role),
    estimate: estimateForRole(obj.estimate, role),
    history: obj.history || [],
    documents: visibleDocuments(obj.documents),
  };
}

/** Client clock, clamped so a far-future stamp cannot lock the row. */
function clampClientTime(iso) {
  const raw = Date.parse(iso || '');
  if (!iso || Number.isNaN(raw)) return new Date().toISOString();
  if (raw > Date.now() + 5 * 60 * 1000) return new Date().toISOString();
  return new Date(raw).toISOString();
}

/** Last-write-wins: missing or equal timestamps let the incoming write through (idempotent retry). */
function incomingWins(body, existing) {
  if (!existing) return true;
  const inc = Date.parse(body?.updatedAt || '');
  const cur = Date.parse(existing.updatedAt || '');
  if (Number.isNaN(inc) || Number.isNaN(cur)) return true;
  return inc >= cur;
}

function historyEvent(actor, at, action, detail) {
  const entry = {
    at,
    userId: actor.id,
    login: actor.login,
    authorName: String(actor.displayName || actor.login || '').trim() || 'Сотрудник',
    action,
  };
  if (detail !== undefined) entry.detail = detail;
  return entry;
}

function skippedHistory(existing, body, actor) {
  const snap = {
    updatedAt: body?.updatedAt || null,
    status: body?.status || null,
    clientName: body?.clientName || null,
    address: body?.address || null,
    areaM2: body?.room?.areaM2 ?? null,
  };
  return [
    historyEvent(actor, new Date().toISOString(), 'conflict_kept_server', JSON.stringify(snap).slice(0, 400)),
    ...(existing.history || []),
  ].slice(0, 50);
}

function stageOrderInput(body, existing) {
  if (body.stageOrder !== undefined && (typeof body.stageOrder !== 'number' || !Number.isFinite(body.stageOrder))) {
    throw Object.assign(new Error('stageOrder должен быть конечным числом'), { status: 400 });
  }
  return body.stageOrder ?? (body.status && body.status !== existing?.status ? -Date.now() : existing?.stageOrder);
}

function normalizeObjectInput(body, existing, actor, org, platform) {
  const now = clampClientTime(body?.updatedAt);
  const status = body.status || existing?.status || 'draft';
  const allowed = ['draft', 'measured', 'quote_sent', 'install', 'closed'];
  const link = applyObjectProjectFields(
    body,
    existing,
    platform,
    existing?.orgId || actor.orgId,
  );
  if (!existing && body.id != null && !OBJECT_ID_RE.test(String(body.id))) {
    throw Object.assign(new Error('Некорректный идентификатор комнаты'), { status: 400 });
  }
  const assignedRaw = body.assignedTo !== undefined ? body.assignedTo : existing?.assignedTo ?? null;
  const assignedTo = assignedRaw === '' ? null : assignedRaw;
  if (assignedTo != null && assignedTo !== existing?.assignedTo) {
    const targetOrg = existing?.orgId || actor.orgId;
    const assignee = (platform?.users || []).find((u) => u.id === assignedTo);
    if (
      typeof assignedTo !== 'string' ||
      !assignee ||
      assignee.orgId !== targetOrg ||
      !['measurer', 'crew', 'sales', 'owner'].includes(normalizeRole(assignee.role))
    ) {
      throw Object.assign(new Error('Исполнитель не найден в вашей компании'), { status: 400 });
    }
  }
  for (const field of ['room', 'estimate']) {
    if (body[field] != null && JSON.stringify(body[field]).length > 400_000) {
      throw Object.assign(new Error('Слишком большие данные расчёта'), { status: 413 });
    }
  }
  return {
    id: existing?.id || (body.id != null ? String(body.id) : uid('obj')),
    orgId: existing?.orgId || actor.orgId,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    createdBy: existing?.createdBy || actor.id,
    assignedTo,
    status: allowed.includes(status) ? status : 'draft',
    stageOrder: stageOrderInput(body, existing),
    clientName: String(body.clientName ?? existing?.clientName ?? '').trim().slice(0, 200),
    clientPhone: String(body.clientPhone ?? existing?.clientPhone ?? '').trim().slice(0, 40),
    address: String(body.address ?? existing?.address ?? '').trim().slice(0, 300),
    city: String(body.city ?? existing?.city ?? org?.settings?.city ?? '').trim(),
    room: body.room || existing?.room || {},
    estimate: body.estimate !== undefined ? body.estimate : existing?.estimate ?? null,
    clientSummary: String(body.clientSummary ?? existing?.clientSummary ?? '').slice(0, 5000),
    history: existing?.history || [],
    // PDF только через POST /objects/:id/documents — обычный PATCH их не затирает.
    documents: Array.isArray(existing?.documents) ? existing.documents : [],
    // Фото — только через /objects/:id/photos. Обычный PATCH их не затирает.
    ...(Array.isArray(existing?.photos) ? { photos: existing.photos } : {}),
    ...(existing?.photoReport ? { photoReport: existing.photoReport } : {}),
    ...link,
  };
}

/* —— analytics aggregate (subset, city-aware) —— */

function dayKey(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Сам админ сети STP (и его организация, если она есть) — не партнёр.
 * Его входы и расчёты не попадают в партнёрскую аналитику. Определяем по роли, не по названию.
 * Данные не удаляются: события просто не участвуют в агрегации.
 */
export function networkAdminScope(platform) {
  const admins = (platform?.users || []).filter((u) => u && u.role === 'admin');
  return {
    adminUserIds: admins.map((u) => u.id).filter(Boolean),
    adminOrgIds: admins.map((u) => u.orgId).filter(Boolean),
  };
}

function isNetworkAdminEvent(e, opts) {
  if (String(e?.role || '') === 'admin') return true;
  if (e?.userId && (opts.adminUserIds || []).includes(e.userId)) return true;
  if (e?.orgId && (opts.adminOrgIds || []).includes(e.orgId)) return true;
  return false;
}

function filterAnalyticsEvents(allEvents, opts) {
  const fromMs = opts.from ? Date.parse(opts.from) : null;
  const toMs = opts.to ? Date.parse(opts.to) : null;
  return allEvents
    .filter((e) => {
      const t = Date.parse(e.at);
      if (Number.isNaN(t)) return false;
      if (isNetworkAdminEvent(e, opts)) return false;
      if (fromMs != null && t < fromMs) return false;
      if (toMs != null && t > toMs) return false;
      if (opts.orgId && e.orgId !== opts.orgId) return false;
      return true;
    })
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

function isCompletedWork(e) {
  return e.action === 'result' || e.action === 'calc_done';
}

function numOr0(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toBreakdown(counts) {
  const total = [...counts.values()].reduce((s, n) => s + n, 0) || 1;
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count, share: Math.round((count / total) * 1000) / 10 }))
    .sort((a, b) => b.count - a.count);
}

export function aggregateAnalyticsDashboard(allEvents, opts) {
  const events = filterAnalyticsEvents(allEvents, opts);
  const partnerMap = new Map();
  const executorMap = new Map();

  for (const dir of opts.executorDirectory || []) {
    if (opts.orgId && dir.orgId !== opts.orgId) continue;
    executorMap.set(dir.userId || dir.login, {
      userId: dir.userId,
      login: dir.login,
      displayName: dir.displayName || dir.login,
      role: dir.role,
      logins: 0,
      problemomer: 0,
      calculator: 0,
      pdf: 0,
      results: 0,
      lastActiveAt: null,
    });
  }

  for (const e of events) {
    const orgKey = e.orgId || e.companyName || e.login;
    if (!partnerMap.has(orgKey)) {
      partnerMap.set(orgKey, {
        orgId: e.orgId,
        companyName: e.companyName || e.login,
        city: e.city || e.object?.city || '',
        logins: 0,
        problemomer: 0,
        calculator: 0,
        pdf: 0,
        shares: 0,
        areaM2: 0,
        panels: 0,
        lastActiveAt: null,
      });
    }
    const prow = partnerMap.get(orgKey);
    if (!prow.city && (e.city || e.object?.city)) prow.city = e.city || e.object?.city || '';
    if (!prow.lastActiveAt || e.at > prow.lastActiveAt) prow.lastActiveAt = e.at;
    if (e.action === 'login') prow.logins += 1;
    if (e.tool === 'problemomer' && e.action === 'result') {
      prow.problemomer += 1;
      prow.areaM2 += numOr0(e.object?.areaM2);
      prow.panels += numOr0(e.object?.panels);
    }
    if (e.tool === 'calculator' && e.action === 'calc_done') {
      prow.calculator += 1;
      prow.areaM2 += numOr0(e.object?.areaM2);
      prow.panels += numOr0(e.object?.panels);
    }
    if (e.action === 'pdf') prow.pdf += 1;
    if (e.action === 'share') prow.shares += 1;

    const role = normalizeRole(String(e.role));
    if (STAFF_ROLES.includes(role) || e.role === 'executor') {
      const exKey = e.userId || e.login;
      if (!executorMap.has(exKey)) {
        executorMap.set(exKey, {
          userId: e.userId,
          login: e.login,
          displayName: e.login,
          role,
          logins: 0,
          problemomer: 0,
          calculator: 0,
          pdf: 0,
          results: 0,
          lastActiveAt: null,
        });
      }
      const ex = executorMap.get(exKey);
      if (!ex.lastActiveAt || e.at > ex.lastActiveAt) ex.lastActiveAt = e.at;
      if (e.action === 'login') ex.logins += 1;
      if (e.tool === 'problemomer' && e.action === 'result') ex.problemomer += 1;
      if (e.tool === 'calculator' && e.action === 'calc_done') ex.calculator += 1;
      if (e.action === 'pdf') ex.pdf += 1;
      if (e.action === 'result' || e.action === 'calc_done') ex.results += 1;
    }
  }

  for (const p of partnerMap.values()) {
    p.areaM2 = Math.round(p.areaM2 * 10) / 10;
    p.panels = Math.round(p.panels);
  }

  const executors = [...executorMap.values()].sort(
    (a, b) => b.problemomer + b.calculator - (a.problemomer + a.calculator),
  );
  const activeExecutors =
    executors.filter((e) => e.logins + e.problemomer + e.calculator + e.pdf > 0).length ||
    executors.length;

  const orgs = new Set(events.map((e) => e.orgId || e.companyName || e.login));
  let areaM2 = 0;
  let panels = 0;
  for (const e of events) {
    if (isCompletedWork(e)) {
      areaM2 += numOr0(e.object?.areaM2);
      panels += numOr0(e.object?.panels);
    }
  }

  const roomType = new Map();
  const houseType = new Map();
  const objectStage = new Map();
  const classTransition = new Map();
  const calcMode = new Map();
  const city = new Map();
  const bump = (map, key) => {
    const k = (key && String(key).trim()) || 'unknown';
    map.set(k, (map.get(k) || 0) + 1);
  };
  for (const e of events) {
    if (e.city || e.object?.city) bump(city, e.city || e.object?.city);
    if (!isCompletedWork(e)) continue;
    const o = e.object;
    if (e.tool === 'problemomer' && e.action === 'result') {
      bump(roomType, o?.roomType ?? o?.label);
      bump(houseType, o?.houseType);
      bump(objectStage, o?.objectStage);
      if (o?.classBefore || o?.classAfter) {
        bump(classTransition, `${o?.classBefore || '?'}→${o?.classAfter || '?'}`);
      }
    }
    if (e.tool === 'calculator' && e.action === 'calc_done') {
      bump(calcMode, o?.mode);
      if (o?.roomType) bump(roomType, o.roomType);
    }
  }

  const toDate = opts.to ? new Date(opts.to) : new Date();
  let fromDate = opts.from
    ? new Date(opts.from)
    : new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);
  const seriesMap = new Map();
  const start = new Date(fromDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(toDate);
  end.setHours(0, 0, 0, 0);
  for (let t = start.getTime(); t <= end.getTime(); t += 24 * 60 * 60 * 1000) {
    const key = dayKey(new Date(t).toISOString());
    if (key) seriesMap.set(key, { day: key, problemomer: 0, calculator: 0, pdf: 0, logins: 0 });
  }
  for (const e of events) {
    const key = dayKey(e.at);
    if (!key) continue;
    if (!seriesMap.has(key)) {
      seriesMap.set(key, { day: key, problemomer: 0, calculator: 0, pdf: 0, logins: 0 });
    }
    const row = seriesMap.get(key);
    if (e.tool === 'problemomer' && e.action === 'result') row.problemomer += 1;
    if (e.tool === 'calculator' && e.action === 'calc_done') row.calculator += 1;
    if (e.action === 'pdf') row.pdf += 1;
    if (e.action === 'login') row.logins += 1;
  }

  let areaM2Sum = 0;
  let panelsSum = 0;
  let withArea = 0;
  let completedCount = 0;
  for (const e of events) {
    if (!isCompletedWork(e)) continue;
    completedCount += 1;
    const a = numOr0(e.object?.areaM2);
    const p = numOr0(e.object?.panels);
    if (a > 0) {
      areaM2Sum += a;
      withArea += 1;
    }
    if (p > 0) panelsSum += p;
  }

  return {
    source: 'api',
    from: opts.from || null,
    to: opts.to || null,
    kpi: {
      partners: opts.partnerCount ?? orgs.size,
      activePartners: orgs.size,
      executors: opts.executorCount ?? activeExecutors,
      problemomerResults: events.filter((e) => e.tool === 'problemomer' && e.action === 'result')
        .length,
      calculatorDone: events.filter((e) => e.tool === 'calculator' && e.action === 'calc_done')
        .length,
      pdf: events.filter((e) => e.action === 'pdf').length,
      shares: events.filter((e) => e.action === 'share').length,
      logins: events.filter((e) => e.action === 'login').length,
      areaM2: Math.round(areaM2 * 10) / 10,
      panels: Math.round(panels),
    },
    kpiPrev: null,
    funnel: computeAnalyticsFunnel(events),
    series: [...seriesMap.values()].sort((a, b) => (a.day < b.day ? -1 : 1)),
    breakdowns: {
      roomType: toBreakdown(roomType),
      houseType: toBreakdown(houseType),
      objectStage: toBreakdown(objectStage),
      classTransition: toBreakdown(classTransition),
      calcMode: toBreakdown(calcMode),
      city: toBreakdown(city),
    },
    volume: {
      areaM2Sum: Math.round(areaM2Sum * 10) / 10,
      areaM2Avg: withArea ? Math.round((areaM2Sum / withArea) * 10) / 10 : 0,
      panelsSum: Math.round(panelsSum),
      completedCount,
    },
    partners: [...partnerMap.values()].sort(
      (a, b) => b.problemomer + b.calculator - (a.problemomer + a.calculator),
    ),
    executors,
    recentObjects: events
      .filter((e) => e.action === 'result' || e.action === 'calc_done' || e.action === 'pdf')
      .slice(0, opts.journalAll ? 5000 : 40),
    events: events.slice(0, opts.journalAll ? 5000 : 200),
  };
}

function json(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...CORS,
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  };
}

function getPath(event) {
  const raw = event.url || event.path || event.requestContext?.http?.path || '/';
  try {
    if (String(raw).startsWith('http')) return new URL(raw).pathname;
  } catch {
    /* ignore */
  }
  return String(raw).split('?')[0] || '/';
}

function getMethod(event) {
  return (
    event.httpMethod ||
    event.requestContext?.http?.method ||
    event.method ||
    'GET'
  ).toUpperCase();
}

function getBody(event) {
  if (!event.body) return {};
  if (String(event.body).length > MAX_BODY_BYTES * 1.4) {
    throw Object.assign(new Error('Запрос слишком большой'), { status: 413, expose: true });
  }
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body;
  if (raw.length > MAX_BODY_BYTES) {
    throw Object.assign(new Error('Запрос слишком большой'), { status: 413, expose: true });
  }
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function getAuth(event) {
  const h = event.headers || {};
  const auth = h.Authorization || h.authorization || '';
  const m = String(auth).match(/^Bearer\s+(.+)$/i);
  return m?.[1] || null;
}

function header(event, name) {
  const h = event.headers || {};
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(h)) {
    if (k.toLowerCase() === lower) return v;
  }
  return null;
}

function getQuery(event) {
  if (event.queryStringParameters) return event.queryStringParameters;
  try {
    const raw = event.url || '';
    if (String(raw).includes('?')) {
      return Object.fromEntries(new URL(raw, 'http://localhost').searchParams.entries());
    }
  } catch {
    /* ignore */
  }
  return {};
}

const EVENT_TEXT = (value, max) => String(value ?? '').slice(0, max);

/** Объект события: только простые поля, не больше 2 КБ после сериализации. */
function sanitizeEventObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  try {
    const text = JSON.stringify(value);
    if (text.length > 2048) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function eventTime(value) {
  const ms = Date.parse(value || '');
  if (Number.isNaN(ms)) return new Date().toISOString();
  if (ms > Date.now() + 24 * 60 * 60 * 1000) return new Date().toISOString();
  if (ms < Date.parse('2020-01-01')) return new Date().toISOString();
  return new Date(ms).toISOString();
}

/**
 * Приводит событие к виду для хранилища. Если запрос пришёл с действующим токеном,
 * личность (организация, сотрудник, логин, роль) берётся из токена, а не из тела:
 * иначе любой мог бы писать события «от имени» чужой компании.
 */
function normalizeIncomingEvent(raw, actor = null, org = null) {
  if (!raw || typeof raw !== 'object') return null;
  const action = EVENT_TEXT(raw.action, 64);
  const tool = EVENT_TEXT(raw.tool, 64);
  if (!action || !tool) return null;
  const object = sanitizeEventObject(raw.object);
  const identity = actor
    ? {
        orgId: actor.orgId ?? null,
        userId: actor.id,
        login: actor.login,
        role: normalizeRole(actor.role),
        companyName: org?.settings?.companyName || '',
      }
    : { orgId: null, userId: null, login: 'anonymous', role: 'public', companyName: '' };
  return {
    id: EVENT_TEXT(raw.id || uid('ae'), 80),
    at: eventTime(raw.at),
    ...identity,
    city: EVENT_TEXT(raw.city || object?.city, 120),
    tool,
    action,
    sessionId:
      raw.sessionId == null || String(raw.sessionId).trim() === ''
        ? null
        : String(raw.sessionId).trim().slice(0, 80),
    object,
  };
}

export async function handler(event = {}) {
  return requestContext.run({ origin: header(event, 'Origin') || '' }, () => handleRequest(event));
}

async function handleRequest(event = {}) {
  if (getMethod(event) === 'OPTIONS') {
    return { statusCode: 204, headers: { ...CORS }, body: '' };
  }

  const path = getPath(event).replace(/\/+$/, '') || '/';
  const method = getMethod(event);

  try {
    const profileResponse = await handleProfile({path,method,requireAuth:()=>requireAuth(event),json,getBody:()=>getBody(event),savePlatform,publicUser,signToken});
    if(profileResponse) return profileResponse;
    const materialPreviewResponse = await handleMaterialPreview({
      path,
      method,
      requireAuth: () => requireAuth(event),
      assertRole,
      json,
      getBody: () => getBody(event),
      savePlatform,
    });
    if (materialPreviewResponse) return materialPreviewResponse;
    const materialThumbResponse = await handleMaterialThumbnail({
      path,
      method,
      requireAuth: () => requireAuth(event),
      assertRole,
      json,
      getBody: () => getBody(event),
      savePlatform,
    });
    if (materialThumbResponse) return materialThumbResponse;
    const materialsResponse = await handleMaterials({
      path,
      method,
      requireAuth: () => requireAuth(event),
      assertRole,
      json,
      getBody: () => getBody(event),
      savePlatform,
      uid,
    });
    if (materialsResponse) return materialsResponse;

    const projectsResponse = await handleProjects({
      path,
      method,
      requireAuth: () => requireAuth(event),
      json,
      getBody: () => getBody(event),
      savePlatform,
      uid,
      objectVisibleTo,
      pushActivity,
      deleteStorage: (key) => s3Delete(key),
    });
    if (projectsResponse) return projectsResponse;

    const roomShareResponse = await handleRoomShare({
      ...storageCtx,
      clientReport,
      path,
      method,
      requireAuth: () => requireAuth(event),
      loadPlatform,
      json,
      getBody: () => getBody(event),
      savePlatform,
      objectVisibleTo,
      pushActivity,
    });
    if (roomShareResponse) return roomShareResponse;

    const trainingResponse = await handleTraining({
      path,
      method,
      requireAuth: () => requireAuth(event),
      getQuery: () => getQuery(event),
      json,
      getBody: () => getBody(event),
      normalizeRole,
    });
    if (trainingResponse) return trainingResponse;
    const roomPhotosResponse = await handleRoomPhotos({
      ...storageCtx,
      path,
      method,
      requireAuth: () => requireAuth(event),
      loadPlatform,
      getBody: () => getBody(event),
      getQuery: () => getQuery(event),
      savePlatform,
      objectVisibleTo,
      pushActivity,
      uid,
    });
    if (roomPhotosResponse) return roomPhotosResponse;

    /* —— Auth —— */
    if (method === 'POST' && path.endsWith('/auth/login')) {
      const { login, password } = getBody(event);
      const ip = clientIp(event) || 'unknown';
      const ipKey = `login-ip:${ip}`;
      const ipLimit = { limit: 30, windowMs: 10 * 60 * 1000 };
      const blocked = rateCheck(ipKey, ipLimit);
      if (!blocked.allowed) {
        return json(
          429,
          { message: 'Слишком много попыток входа. Подождите и повторите.' },
          { 'Retry-After': String(blocked.retryAfter) },
        );
      }
      const platform = await loadPlatform();
      const loginText = String(login || '').trim().slice(0, 200);
      const user = findUserByLogin(platform, loginText);
      const nowMs = Date.now();
      if (user && Date.parse(user.lockedUntil || '') > nowMs) {
        rateHit(ipKey, ipLimit);
        const wait = Math.ceil((Date.parse(user.lockedUntil) - nowMs) / 1000);
        return json(
          429,
          { message: 'Слишком много неверных паролей. Вход временно закрыт, повторите позже.' },
          { 'Retry-After': String(Math.max(1, wait)) },
        );
      }
      const hasHash = Boolean(user) && typeof user.passwordHash === 'string' && user.passwordHash;
      const valid = hasHash ? await bcrypt.compare(String(password || ''), user.passwordHash) : false;
      if (!hasHash) await dummyCompare(password);
      if (!user || user.loginDisabled === true || !valid) {
        rateHit(ipKey, ipLimit);
        if (user && hasHash && !valid) await recordLoginFailure(platform, user, nowMs);
        return json(401, { message: 'Неверный логин или пароль' });
      }
      rateReset(ipKey);
      if (user.failedLogins || user.lockedUntil) {
        delete user.failedLogins;
        delete user.lockedUntil;
      }
      const token = await signToken(user);
      pushActivity(platform, {
        orgId: user.orgId,
        userId: user.id,
        login: user.login,
        action: 'login',
        detail: `Роль: ${normalizeRole(user.role)}`,
      });
      await savePlatform(platform);
      return json(200, { token, user: await sessionUser(user, platform) });
    }

    if (method === 'GET' && path.endsWith('/auth/me')) {
      const { platform, user, payload, usedPreviousKey } = await requireAuth(event);
      // Скользящая сессия: токен старше часа обновляется, чтобы активный пользователь не упирался в 12 ч.
      const stale = Number(payload?.iat) > 0 && Date.now() / 1000 - Number(payload.iat) > 3600;
      return json(200, { user: await sessionUser(user, platform), ...(usedPreviousKey || stale ? { token: await signToken(user) } : {}) });
    }

    if (method === 'POST' && path.endsWith('/auth/logout')) {
      return json(200, { ok: true });
    }

    /* —— Org profile —— */
    if (method === 'PATCH' && path.endsWith('/org/settings')) {
      const { platform, user } = await requireAuth(event);
      assertRole(user, ['admin', 'owner']);
      const patch = getBody(event);
      const orgId = patch.orgId || user.orgId;
      if (!orgId) return json(400, { message: 'orgId required' });
      if (user.role === 'owner' && user.orgId !== orgId) {
        return json(403, { message: 'Чужая организация' });
      }
      const idx = platform.orgs.findIndex((o) => o.id === orgId);
      if (idx < 0) return json(404, { message: 'Организация не найдена' });
      if (Object.prototype.hasOwnProperty.call(patch, 'city')) {
        patch.city = cityOrThrow(patch.city, platform.orgs[idx].settings?.city ?? '');
      }
      const settings = normalizeOrgSettings({ ...platform.orgs[idx].settings, ...patch });
      platform.orgs[idx] = { ...platform.orgs[idx], settings };
      pushActivity(platform, {
        orgId,
        userId: user.id,
        login: user.login,
        action: 'update_org',
        detail: settings.companyName,
      });
      await savePlatform(platform);
      return json(200, { org: settings });
    }

    /* Legacy alias */
    if (method === 'PATCH' && path.endsWith('/partner/profile')) {
      const { platform, user } = await requireAuth(event);
      assertRole(user, ['admin', 'owner']);
      if (!user.orgId) return json(400, { message: 'Нет организации' });
      const patch = getBody(event);
      const idx = platform.orgs.findIndex((o) => o.id === user.orgId);
      if (idx < 0) return json(404, { message: 'Not found' });
      if (Object.prototype.hasOwnProperty.call(patch, 'city')) {
        patch.city = cityOrThrow(patch.city, platform.orgs[idx].settings?.city ?? '');
      }
      const settings = normalizeOrgSettings({ ...platform.orgs[idx].settings, ...patch });
      platform.orgs[idx] = { ...platform.orgs[idx], settings };
      await savePlatform(platform);
      return json(200, { partner: { ...publicUser(user, platform.orgs[idx]), ...settings } });
    }

    /* —— Admin partners —— */
    if (method === 'GET' && path.endsWith('/admin/partners')) {
      const { platform, user } = await requireAuth(event);
      assertRole(user, ['admin']);
      const owners = platform.users.filter((u) => normalizeRole(u.role) === 'owner');
      const list = owners.map((u) => {
        const org = findOrg(platform, u.orgId);
        const staffCount = platform.users.filter(
          (x) => x.orgId === u.orgId && STAFF_ROLES.includes(normalizeRole(x.role)),
        ).length;
        const last = (platform.activity || []).find(
          (a) => a.orgId === u.orgId && a.action === 'login',
        );
        return {
          user: {
            id: u.id,
            login: u.login,
            role: 'owner',
            displayName: u.displayName,
            orgId: u.orgId,
            createdAt: u.createdAt,
          },
          org,
          lastLogin: last?.at || null,
          executorCount: staffCount,
          staffCount,
        };
      });
      return json(200, { partners: list });
    }

    if (method === 'POST' && path.endsWith('/admin/partners')) {
      const { platform, user } = await requireAuth(event);
      assertRole(user, ['admin']);
      const body = getBody(event);
      const login = String(body.login || '').trim();
      const password = String(body.password || '').trim();
      const companyName = String(body.companyName || '').trim() || login;
      const city = cityOrThrow(body.city ?? '', null);
      if (!login || !password) return json(400, { message: 'Укажите логин и пароль' });
      if (login.length > 64) return json(400, { message: 'Логин слишком длинный' });
      const weak = passwordProblem(password);
      if (weak) return json(400, { message: weak });
      if (loginTaken(platform, login)) return json(409, { message: 'Такой логин уже есть' });
      const now = new Date().toISOString();
      const orgId = uid('org');
      const userId = uid('u');
      const org = {
        id: orgId,
        createdAt: now,
        createdBy: user.id,
        settings: normalizeOrgSettings({
          companyName,
          city,
          panelPriceRub: OFFICIAL_PANEL,
          pricePerM2: OFFICIAL_M2,
          installPricePerM2: DEFAULT_INSTALL,
          dowelsPerPanel: 2,
          dowelPriceRub: DEFAULT_DOWEL,
        }),
      };
      const owner = {
        id: userId,
        login,
        passwordHash: await hashPassword(password),
        role: 'owner',
        displayName: companyName,
        orgId,
        createdAt: now,
      };
      platform.orgs.push(org);
      platform.users.push(owner);
      pushActivity(platform, {
        orgId,
        userId: user.id,
        login: user.login,
        action: 'create_partner',
        detail: `${login} · ${companyName}`,
      });
      await savePlatform(platform);
      return json(200, { login, password, user: publicUser(owner, org) });
    }

    /* —— Менеджеры StP: внутренние сотрудники MultiFrame, обучение и ссылки на инструменты —— */
    if (method === 'GET' && path.endsWith('/admin/stp-managers')) {
      const { platform, user } = await requireAuth(event);
      assertRole(user, ['admin']);
      const managers = platform.users
        .filter((u) => normalizeRole(u.role) === STP_MANAGER_ROLE)
        .map((u) => {
          const last = (platform.activity || []).find((a) => a.userId === u.id && a.action === 'login');
          return {
            id: u.id,
            login: u.login,
            role: STP_MANAGER_ROLE,
            displayName: u.displayName,
            orgId: u.orgId || null,
            createdAt: u.createdAt,
            lastLogin: last?.at || null,
          };
        });
      return json(200, { managers });
    }

    if (method === 'POST' && path.endsWith('/admin/stp-managers')) {
      const { platform, user } = await requireAuth(event);
      assertRole(user, ['admin']);
      const body = getBody(event);
      const login = String(body.login || '').trim();
      const password = String(body.password || '').trim();
      const displayName = String(body.displayName || login).trim() || login;
      if (!login || !password) return json(400, { message: 'Укажите логин и пароль' });
      if (findUser(platform, login)) return json(409, { message: 'Такой логин уже есть' });
      const now = new Date().toISOString();
      if (!findOrg(platform, STP_ORG_ID)) {
        platform.orgs.push({
          id: STP_ORG_ID,
          createdAt: now,
          createdBy: user.id,
          internal: true,
          settings: normalizeOrgSettings({ companyName: STP_ORG_NAME, city: '' }),
        });
      }
      const manager = {
        id: uid('u'),
        login,
        passwordHash: bcrypt.hashSync(password, 10),
        role: STP_MANAGER_ROLE,
        displayName,
        orgId: STP_ORG_ID,
        createdAt: now,
      };
      platform.users.push(manager);
      pushActivity(platform, {
        orgId: STP_ORG_ID,
        userId: user.id,
        login: user.login,
        action: 'create_stp_manager',
        detail: login,
      });
      await savePlatform(platform);
      return json(200, { id: manager.id, login, password, role: STP_MANAGER_ROLE, displayName });
    }

    if (method === 'DELETE' && /\/admin\/stp-managers\/[^/]+$/.test(path)) {
      const { platform, user } = await requireAuth(event);
      assertRole(user, ['admin']);
      const managerId = decodeURIComponent(path.split('/').pop() || '');
      const target = platform.users.find((u) => u.id === managerId);
      if (!target || normalizeRole(target.role) !== STP_MANAGER_ROLE) {
        return json(404, { message: 'Менеджер StP не найден' });
      }
      platform.users = platform.users.filter((u) => u.id !== managerId);
      pushActivity(platform, {
        orgId: STP_ORG_ID,
        userId: user.id,
        login: user.login,
        action: 'delete_stp_manager',
        detail: target.login,
      });
      await savePlatform(platform);
      return json(200, { ok: true });
    }

    if (method === 'POST' && path.endsWith('/admin/demo/reset')) {
      const { user } = await requireAuth(event);
      assertRole(user, ['admin']);
      if (partnerBucket() && String(process.env.ALLOW_DEMO_RESET || '') !== '1') {
        return json(403, { message: 'Сброс к демо-данным отключён на этом стенде' });
      }
      const platform = demoPlatform();
      const events = buildDemoAnalyticsEvents();
      await savePlatform(platform);
      await saveEvents(events);
      return json(200, {
        ok: true,
        orgs: platform.orgs.length,
        users: platform.users.length,
        objects: platform.objects.length,
        events: events.length,
      });
    }

    if (method === 'POST' && path.endsWith('/admin/partners/reset-password')) {
      const { platform, user } = await requireAuth(event);
      assertRole(user, ['admin']);
      const { partnerUserId, password } = getBody(event);
      // Сброс пароля — тот же вызов для владельца партнёра и для менеджера StP.
      const idx = platform.users.findIndex(
        (u) =>
          u.id === partnerUserId &&
          (normalizeRole(u.role) === 'owner' || normalizeRole(u.role) === STP_MANAGER_ROLE),
      );
      if (idx < 0) return json(404, { message: 'Партнёр не найден' });
      const pw = String(password || '').trim();
      const weakPartner = passwordProblem(pw);
      if (weakPartner) return json(400, { message: weakPartner });
      platform.users[idx] = {
        ...platform.users[idx],
        passwordHash: await hashPassword(pw),
        sessionVersion: (Number(platform.users[idx].sessionVersion) || 0) + 1,
      };
      delete platform.users[idx].failedLogins;
      delete platform.users[idx].lockedUntil;
      pushActivity(platform, {
        orgId: platform.users[idx].orgId,
        userId: user.id,
        login: user.login,
        action: 'reset_password',
        detail: platform.users[idx].login,
      });
      await savePlatform(platform);
      return json(200, { password: pw });
    }

    if (method === 'PATCH' && /\/admin\/partners\/[^/]+$/.test(path)) {
      const { platform, user } = await requireAuth(event);
      assertRole(user, ['admin']);
      const partnerUserId = path.split('/').pop();
      const partner = platform.users.find(
        (u) => u.id === partnerUserId && normalizeRole(u.role) === 'owner',
      );
      if (!partner?.orgId) return json(404, { message: 'Партнёр не найден' });
      const idx = platform.orgs.findIndex((o) => o.id === partner.orgId);
      if (idx < 0) return json(404, { message: 'Организация не найдена' });
      const body = getBody(event);
      if (!Object.prototype.hasOwnProperty.call(body, 'city')) {
        return json(400, { message: 'Укажите город' });
      }
      // Правка города не оставляет произвольный текст. Старое невалидное значение
      // само не подменяется, пока админ не выберет город из справочника.
      const city = cityOrThrow(body.city, null);
      const settings = normalizeOrgSettings({ ...platform.orgs[idx].settings, city });
      platform.orgs[idx] = { ...platform.orgs[idx], settings };
      pushActivity(platform, {
        orgId: partner.orgId,
        userId: user.id,
        login: user.login,
        action: 'update_partner_city',
        detail: `${partner.login} · ${city || '—'}`,
      });
      await savePlatform(platform);
      return json(200, { city: settings.city });
    }

    if (method === 'DELETE' && /\/admin\/partners\/[^/]+$/.test(path)) {
      const { platform, user } = await requireAuth(event);
      assertRole(user, ['admin']);
      const partnerUserId = path.split('/').pop();
      const partner = platform.users.find(
        (u) => u.id === partnerUserId && normalizeRole(u.role) === 'owner',
      );
      if (!partner) return json(404, { message: 'Партнёр не найден' });
      const orgId = partner.orgId;
      platform.users = platform.users.filter(
        (u) => u.id !== partnerUserId && !(orgId && u.orgId === orgId),
      );
      platform.orgs = platform.orgs.filter((o) => o.id !== orgId);
      platform.objects = (platform.objects || []).filter((o) => o.orgId !== orgId);
      pushActivity(platform, {
        orgId,
        userId: user.id,
        login: user.login,
        action: 'delete_partner',
        detail: partner.login,
      });
      await savePlatform(platform);
      return json(200, { ok: true });
    }

    /* —— Staff —— */
    if (method === 'GET' && path.endsWith('/org/staff')) {
      const { platform, user } = await requireAuth(event);
      assertRole(user, ['owner', 'sales']);
      if (!user.orgId) return json(400, { message: 'Нет организации' });
      const staff = platform.users
        .filter((u) => u.orgId === user.orgId && STAFF_ROLES.includes(normalizeRole(u.role)))
        .map((u) => ({
          id: u.id,
          login: u.login,
          role: normalizeRole(u.role),
          displayName: u.displayName,
          orgId: u.orgId,
          createdAt: u.createdAt,
        }));
      return json(200, { staff });
    }

    if (method === 'POST' && path.endsWith('/org/staff')) {
      const { platform, user } = await requireAuth(event);
      assertRole(user, STAFF_MANAGER_ROLES);
      if (!user.orgId) return json(400, { message: 'Нет организации' });
      const body = getBody(event);
      const login = String(body.login || '').trim();
      const password = String(body.password || '').trim();
      const displayName = String(body.displayName || login).trim();
      const role = assignableStaffRole(body.role);
      if (!role) {
        return json(400, { message: 'Роль: sales, measurer или crew' });
      }
      if (!login || !password) return json(400, { message: 'Укажите логин и пароль' });
      if (login.length > 64) return json(400, { message: 'Логин слишком длинный' });
      const weak = passwordProblem(password);
      if (weak) return json(400, { message: weak });
      if (loginTaken(platform, login)) return json(409, { message: 'Такой логин уже есть' });
      const staff = {
        id: uid('u'),
        login,
        passwordHash: await hashPassword(password),
        role,
        displayName,
        orgId: user.orgId,
        createdAt: new Date().toISOString(),
      };
      platform.users.push(staff);
      pushActivity(platform, {
        orgId: user.orgId,
        userId: user.id,
        login: user.login,
        action: 'create_staff',
        detail: `${login} · ${role}`,
      });
      await savePlatform(platform);
      return json(200, {
        id: staff.id,
        login,
        password,
        role,
        displayName,
      });
    }

    if (method === 'POST' && path.endsWith('/org/staff/reset-password')) {
      const { platform, user } = await requireAuth(event);
      assertRole(user, STAFF_MANAGER_ROLES);
      const { staffUserId, password } = getBody(event);
      const target = platform.users.find((u) => u.id === staffUserId);
      if (!target) return json(404, { message: 'Сотрудник не найден' });
      const targetRole = normalizeRole(target.role);
      if (user.role !== 'admin' && target.orgId !== user.orgId) {
        return json(404, { message: 'Сотрудник не найден' });
      }
      if (targetRole === 'owner' || targetRole === 'admin') {
        return json(403, { message: 'Нельзя изменить владельца' });
      }
      if (!STAFF_ROLES.includes(targetRole)) {
        return json(404, { message: 'Сотрудник не найден' });
      }
      const idx = platform.users.findIndex((u) => u.id === staffUserId);
      if (idx < 0) return json(404, { message: 'Сотрудник не найден' });
      const pw = String(password || '').trim();
      const weakStaff = passwordProblem(pw);
      if (weakStaff) return json(400, { message: weakStaff });
      const nextUser = {
        ...platform.users[idx],
        passwordHash: await hashPassword(pw),
        sessionVersion: (Number(platform.users[idx].sessionVersion) || 0) + 1,
      };
      delete nextUser.failedLogins;
      delete nextUser.lockedUntil;
      delete nextUser.password;
      platform.users[idx] = nextUser;
      pushActivity(platform, {
        orgId: nextUser.orgId,
        userId: user.id,
        login: user.login,
        action: 'reset_staff_password',
        detail: nextUser.login,
      });
      await savePlatform(platform);
      return json(200, { password: pw });
    }

    if (method === 'PATCH' && /^\/org\/staff\/[^/]+$/.test(path)) {
      const { platform, user } = await requireAuth(event);
      assertRole(user, ['owner']);
      if (!user.orgId) return json(400, { message: 'Нет организации' });
      const staffUserId = decodeURIComponent(path.split('/').pop() || '');
      const target = platform.users.find((u) => u.id === staffUserId);
      if (!target) return json(404, { message: 'Сотрудник не найден' });
      if (target.orgId !== user.orgId) return json(403, { message: 'Недостаточно прав' });
      const targetRole = normalizeRole(target.role);
      if (!STAFF_ROLES.includes(targetRole)) {
        return json(403, { message: 'Недостаточно прав' });
      }
      const body = getBody(event);
      if (!Object.prototype.hasOwnProperty.call(body, 'displayName')) {
        return json(400, { message: 'Укажите имя' });
      }
      const displayName = normalizePersonName(body.displayName);
      const idx = platform.users.findIndex((u) => u.id === staffUserId);
      const nextUser = {
        ...platform.users[idx],
        displayName,
        updatedAt: new Date().toISOString(),
      };
      delete nextUser.phone;
      delete nextUser.password;
      platform.users[idx] = nextUser;
      pushActivity(platform, {
        orgId: user.orgId,
        userId: user.id,
        login: user.login,
        action: 'rename_staff',
        detail: `${nextUser.login} · ${displayName || '—'}`,
      });
      await savePlatform(platform);
      return json(200, {
        id: nextUser.id,
        login: nextUser.login,
        role: targetRole,
        displayName,
      });
    }

    if (method === 'DELETE' && /\/org\/staff\/[^/]+$/.test(path)) {
      const { platform, user } = await requireAuth(event);
      assertRole(user, STAFF_MANAGER_ROLES);
      if (!user.orgId) return json(400, { message: 'Нет организации' });
      const staffUserId = decodeURIComponent(path.split('/').pop() || '');
      const target = platform.users.find((u) => u.id === staffUserId);
      if (!target) return json(404, { message: 'Сотрудник не найден' });
      if (target.orgId !== user.orgId) {
        return json(403, { message: 'Недостаточно прав' });
      }
      const targetRole = normalizeRole(target.role);
      if (targetRole === 'owner' || targetRole === 'admin') {
        return json(403, { message: 'Нельзя удалить владельца' });
      }
      if (staffUserId === user.id) {
        return json(403, { message: 'Нельзя удалить свою учётную запись' });
      }
      if (!STAFF_ROLES.includes(targetRole)) {
        return json(403, { message: 'Недостаточно прав' });
      }
      const staff = target;
      platform.users = platform.users.filter((u) => u.id !== staffUserId);
      pushActivity(platform, {
        orgId: user.orgId,
        userId: user.id,
        login: user.login,
        action: 'delete_staff',
        detail: staff.login,
      });
      await savePlatform(platform);
      return json(200, { ok: true });
    }

    /* —— Job objects —— */
    const docFileMatch = path.match(/\/objects\/([^/]+)\/documents\/([^/]+)$/);
    if (docFileMatch && method === 'GET') {
      const { platform, user } = await requireAuth(event);
      const objectId = decodeURIComponent(docFileMatch[1]);
      const docId = decodeURIComponent(docFileMatch[2]);
      const obj = (platform.objects || []).find((o) => o.id === objectId);
      if (!obj || !objectVisibleTo(user, obj)) return json(404, { message: 'Комната не найдена' });
      const meta = findVisibleDocument(obj.documents, docId);
      if (!meta) return json(404, { message: 'Документ не найден' });
      const stored = (obj.documents || []).find((d) => d.id === meta.id);
      const key = stored?.storageKey;
      if (!key) return json(404, { message: 'Файл не найден' });
      const bytes = await s3GetBytes(key);
      if (!bytes?.length) return json(404, { message: 'Файл не найден' });
      return json(200, {
        id: meta.id,
        filename: meta.filename,
        kind: meta.kind,
        hasScheme: meta.hasScheme,
        pdfBase64: Buffer.from(bytes).toString('base64'),
      });
    }

    const docPostMatch = path.match(/\/objects\/([^/]+)\/documents$/);
    if (docPostMatch && method === 'POST') {
      const { platform, user } = await requireAuth(event);
      if (!['admin', 'owner', 'sales', 'measurer'].includes(user.role)) {
        return json(403, { message: 'Недостаточно прав' });
      }
      const objectId = decodeURIComponent(docPostMatch[1]);
      const idx = (platform.objects || []).findIndex((o) => o.id === objectId);
      if (idx < 0) return json(404, { message: 'Комната не найдена' });
      const existing = platform.objects[idx];
      if (user.role !== 'admin' && existing.orgId !== user.orgId) {
        return json(403, { message: 'Недостаточно прав' });
      }
      if (!objectVisibleTo(user, existing)) {
        return json(403, { message: 'Недостаточно прав' });
      }
      const body = getBody(event);
      const incoming = Array.isArray(body.documents) ? body.documents : [];
      if (!incoming.length) return json(400, { message: 'Нет файлов' });
      if (incoming.length > 4) return json(400, { message: 'Слишком много файлов за раз' });
      const now = new Date().toISOString();
      const versionId = String(body.versionId || uid('ver'));
      const added = [];
      for (const raw of incoming) {
        const kind = incomingDocumentKind(raw.kind);
        const clean = String(raw.pdfBase64 || '').replace(/^data:application\/pdf;base64,/, '');
        let bytes;
        try {
          bytes = Buffer.from(clean, 'base64');
        } catch {
          return json(400, { message: 'Не удалось прочитать PDF' });
        }
        if (bytes.length < 5 || bytes.subarray(0, 4).toString() !== '%PDF') {
          return json(400, { message: 'Файл не похож на PDF' });
        }
        if (bytes.length > 8 * 1024 * 1024) {
          return json(413, { message: 'PDF больше 8 МБ' });
        }
        const docId = uid('doc');
        const storageKey = `docs/${existing.orgId}/${existing.id}/${docId}.pdf`;
        await s3PutBytes(storageKey, bytes, 'application/pdf');
        const filename =
          String(raw.filename || '')
            .replace(/[^\w.\-а-яА-ЯёЁ \u2014\u2013]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 120) || (kind === 'profile' ? 'профиль.pdf' : 'смета.pdf');
        added.push({
          id: docId,
          versionId,
          createdAt: now,
          createdBy: user.id,
          kind,
          filename: filename.endsWith('.pdf') ? filename : `${filename}.pdf`,
          storageKey,
          hasScheme: Boolean(raw.hasScheme),
          panels: Number.isFinite(Number(raw.panels)) ? Number(raw.panels) : null,
          areaM2: Number.isFinite(Number(raw.areaM2)) ? Number(raw.areaM2) : null,
        });
      }
      const next = {
        ...existing,
        documents: [...added, ...(existing.documents || [])].slice(0, 40),
        updatedAt: now,
        history: [
          historyEvent(
            user,
            now,
            added.every((d) => d.kind === 'profile') ? 'profile_pdf' : 'calc_pdf',
            added.map((d) => d.kind).join('+'),
          ),
          ...(existing.history || []),
        ].slice(0, 50),
      };
      platform.objects[idx] = next;
      await savePlatform(platform);
      return json(200, { object: publicObject(next, user.role) });
    }

    if (method === 'GET' && path.endsWith('/objects')) {
      const { platform, user } = await requireAuth(event);
      if (user.role === 'admin') {
        const all = (platform.objects || []).map((o) => publicObject(o, user.role));
        return json(200, { objects: all });
      }
      if (!user.orgId) return json(400, { message: 'Нет организации' });
      const list = (platform.objects || [])
        .filter((o) => objectVisibleTo(user, o))
        .map((o) => publicObject(o, user.role));
      return json(200, { objects: list });
    }

    if (method === 'POST' && path.endsWith('/objects')) {
      const { platform, user } = await requireAuth(event);
      if (!['owner', 'sales'].includes(user.role)) {
        return json(403, { message: 'Недостаточно прав' });
      }
      if (!user.orgId) return json(400, { message: 'Нет организации' });
      const org = findOrg(platform, user.orgId);
      const body = getBody(event);
      // Offline sync may re-POST the same id — upsert instead of cloning.
      const existingIdx =
        body.id && Array.isArray(platform.objects)
          ? platform.objects.findIndex((o) => o.id === body.id)
          : -1;
      const existing = existingIdx >= 0 ? platform.objects[existingIdx] : null;
      if (existing && existing.orgId !== user.orgId) {
        return json(403, { message: 'Недостаточно прав' });
      }
      if (existing && !incomingWins(body, existing)) {
        const kept = { ...existing, history: skippedHistory(existing, body, user) };
        platform.objects[existingIdx] = kept;
        await savePlatform(platform);
        return json(200, { object: publicObject(kept, user.role), conflict: 'server-newer' });
      }
      let requestBody = body;
      let createdProject = null;
      if (!existing) {
        const ensured = ensureProjectForNewObject(platform, body, user, uid);
        requestBody = ensured.body;
        createdProject = ensured.project;
      }
      let obj;
      try {
        obj = normalizeObjectInput(requestBody, existing, user, org, platform);
      } catch (error) {
        if (createdProject && Array.isArray(platform.projects)) {
          platform.projects = platform.projects.filter((item) => item.id !== createdProject.id);
        }
        throw error;
      }
      if (createdProject) {
        pushActivity(platform, {
          orgId: user.orgId,
          userId: user.id,
          login: user.login,
          action: 'create_project',
          detail: createdProject.name,
        });
      }
      if (existing) {
        if (body.status && body.status !== existing.status) {
          obj.history = [
            historyEvent(user, obj.updatedAt, 'status', `${existing.status}→${body.status}`),
            ...(existing.history || []),
          ].slice(0, 50);
        } else {
          obj.history = [
            historyEvent(user, obj.updatedAt, 'update'),
            ...(existing.history || []),
          ].slice(0, 50);
        }
        platform.objects[existingIdx] = obj;
      } else {
        obj.history = [historyEvent(user, obj.createdAt, 'create', obj.status)];
        platform.objects = [obj, ...(platform.objects || [])].slice(0, OBJECTS_CAP);
        pushActivity(platform, {
          orgId: user.orgId,
          userId: user.id,
          login: user.login,
          action: 'create_object',
          detail: obj.address || obj.clientName || obj.id,
        });
      }
      await savePlatform(platform);
      return json(200, { object: publicObject(obj, user.role) });
    }

    if (method === 'PATCH' && /\/objects\/[^/]+$/.test(path)) {
      const { platform, user } = await requireAuth(event);
      const objectId = path.split('/').pop();
      const idx = (platform.objects || []).findIndex((o) => o.id === objectId);
      if (idx < 0) return json(404, { message: 'Комната не найдена' });
      const existing = platform.objects[idx];
      if (!objectVisibleTo(user, existing)) {
        return json(403, { message: 'Недостаточно прав' });
      }
      if (user.role === 'crew') {
        return json(403, { message: 'Бригада не меняет проект и комнату' });
      }
      const org = findOrg(platform, existing.orgId);
      const body = getBody(event);
      if (!incomingWins(body, existing)) {
        const kept = { ...existing, history: skippedHistory(existing, body, user) };
        platform.objects[idx] = kept;
        await savePlatform(platform);
        return json(200, { object: publicObject(kept, user.role), conflict: 'server-newer' });
      }
      if (body.status && body.status !== existing.status && !['owner', 'sales'].includes(user.role)) {
        return json(403, { message: 'Статус меняет менеджер или владелец' });
      }
      if (body.assignedTo !== undefined && !['owner', 'sales'].includes(user.role)) {
        return json(403, { message: 'Назначать комнату может владелец или менеджер' });
      }
      const next = normalizeObjectInput(body, existing, user, org, platform);
      if (body.status && body.status !== existing.status) {
        next.history = [
          historyEvent(user, next.updatedAt, 'status', `${existing.status}→${body.status}`),
          ...(existing.history || []),
        ].slice(0, 50);
      } else if (body.assignedTo !== undefined && body.assignedTo !== existing.assignedTo) {
        next.history = [
          historyEvent(user, next.updatedAt, 'assign', String(body.assignedTo || '—')),
          ...(existing.history || []),
        ].slice(0, 50);
      } else {
        next.history = [
          historyEvent(user, next.updatedAt, 'update'),
          ...(existing.history || []),
        ].slice(0, 50);
      }
      platform.objects[idx] = next;
      await savePlatform(platform);
      return json(200, { object: publicObject(next, user.role) });
    }

    if (method === 'GET' && /\/objects\/[^/]+$/.test(path) && !path.endsWith('/objects')) {
      const { platform, user } = await requireAuth(event);
      const objectId = path.split('/').pop();
      const obj = (platform.objects || []).find((o) => o.id === objectId);
      if (!obj || !objectVisibleTo(user, obj)) return json(404, { message: 'Комната не найдена' });
      return json(200, { object: publicObject(obj, user.role) });
    }

    if (method === 'DELETE' && /\/objects\/[^/]+$/.test(path)) {
      const { platform, user } = await requireAuth(event);
      // Менеджер и владелец удаляют комнаты своей компании. Чужая компания и остальные роли — отказ.
      if (!['owner', 'sales'].includes(user.role)) {
        return json(403, { message: 'Недостаточно прав' });
      }
      const objectId = path.split('/').pop();
      const idx = (platform.objects || []).findIndex((o) => o.id === objectId);
      if (idx < 0) return json(404, { message: 'Комната не найдена' });
      const existing = platform.objects[idx];
      if (!objectVisibleTo(user, existing)) {
        return json(403, { message: 'Недостаточно прав' });
      }
      const body = getBody(event);
      const query = getQuery(event);
      const deleteBody = { updatedAt: body.updatedAt || query.updatedAt || null };
      if (deleteBody.updatedAt && !incomingWins(deleteBody, existing)) {
        const kept = { ...existing, history: skippedHistory(existing, deleteBody, user) };
        platform.objects[idx] = kept;
        await savePlatform(platform);
        return json(200, { object: publicObject(kept, user.role), conflict: 'server-newer' });
      }
      const doomed = existing.documents || [];
      platform.objects = platform.objects.filter((o) => o.id !== objectId);
      pushActivity(platform, {
        orgId: user.orgId,
        userId: user.id,
        login: user.login,
        action: 'delete_object',
        detail: existing.address || existing.clientName || existing.id,
      });
      await savePlatform(platform);
      for (const doc of doomed) {
        if (doc.storageKey) await s3Delete(doc.storageKey);
      }
      await removePhotoFiles(storageCtx, existing);
      return json(200, { ok: true });
    }

    /* —— Analytics —— */
    if (method === 'POST' && path.endsWith('/analytics/events')) {
      const eventsLimit = rateHit(`events-ip:${clientIp(event) || 'unknown'}`, { limit: 60, windowMs: 60 * 1000 });
      if (!eventsLimit.allowed) {
        return json(429, { message: 'Слишком часто' }, { 'Retry-After': String(eventsLimit.retryAfter) });
      }
      const body = getBody(event);
      let incoming = Array.isArray(body.events) ? body.events : body.event ? [body.event] : [];
      incoming = incoming.slice(0, 100);
      let actor = null;
      let actorOrg = null;
      if (getAuth(event)) {
        try {
          const auth = await requireAuth(event);
          actor = auth.user;
          actorOrg = actor.orgId ? findOrg(auth.platform, actor.orgId) : null;
        } catch (error) {
          if (error?.status !== 401) throw error;
          // Просроченный токен: события принимаются как анонимные.
        }
      }
      const normalized = incoming.map((raw) => normalizeIncomingEvent(raw, actor, actorOrg)).filter(Boolean);
      if (!normalized.length) return json(400, { message: 'No events' });
      const existing = await loadEvents();
      const ids = new Set(existing.map((e) => e.id));
      const merged = [...normalized.filter((e) => !ids.has(e.id)), ...existing].slice(
        0,
        ANALYTICS_CAP,
      );
      await saveEvents(merged, existing);
      return json(200, { ok: true, accepted: normalized.length });
    }

    if (method === 'DELETE' && path.endsWith('/analytics/events')) {
      // Bare DELETE used to be fired once from the cabinet and wiped analytics-events.json.
      // Refuse it. Events are only appended via POST /analytics/events.
      return json(405, { message: 'Очистка аналитики отключена' });
    }

    if (method === 'GET' && path.endsWith('/analytics/drill')) {
      const auth = await requireAuth(event);
      const role = auth.user.role;
      if (!['admin', 'owner', 'sales'].includes(role)) {
        return json(403, { message: 'Аналитика недоступна' });
      }
      const query = getQuery(event);
      let orgId = role === 'admin' ? query.orgId || null : auth.user.orgId;
      if (role === 'admin') {
        const key = header(event, 'X-Analytics-Key');
        if (key && !safeEqual(key, ANALYTICS_ADMIN_KEY())) {
          return json(403, { message: 'Admin key required' });
        }
      }
      const platform = auth.platform;
      const events = await eventsForAnalytics();
      const demoOrg = (platform.orgs || []).some((org) => org.id === 'org_demo' || org.id === 'org_demo_spb');
      const focusDemo = !orgId || orgId === 'org_demo' || orgId === 'org_demo_spb';
      const drill = buildStaffDrill({
        viewer: { id: auth.user.id, role, orgId: auth.user.orgId },
        users: (platform.users || []).map((user) => ({
          id: user.id,
          login: user.login,
          displayName: user.displayName,
          role: normalizeRole(user.role),
          orgId: user.orgId,
        })),
        events,
        objects: platform.objects || [],
        projects: platform.projects || [],
        metric: query.metric,
        period: query.period,
        userId: query.userId || null,
        from: query.from || null,
        to: query.to || null,
        orgId,
        demoFill: demoOrg && focusDemo,
      });
      return json(200, drill);
    }

    if (method === 'GET' && path.endsWith('/analytics/dashboard')) {
      const query = getQuery(event);
      let auth = null;
      try {
        auth = await requireAuth(event);
      } catch (error) {
        if (error?.status !== 401) throw error;
      }

      // Без входа: только служебный запрос скриптов развёртывания с ключом администратора.
      // Роль и организация из заголовков больше не принимаются.
      if (!auth) {
        const key = header(event, 'X-Analytics-Key');
        if (!key) return json(401, { message: 'Unauthorized' });
        if (!safeEqual(key, ANALYTICS_ADMIN_KEY())) return json(403, { message: 'Admin key required' });
        const events = await eventsForAnalytics();
        return json(
          200,
          aggregateAnalyticsDashboard(events, {
            source: 'api',
            from: query.from || null,
            to: query.to || null,
            orgId: query.orgId || null,
            journalAll: query.journal === '1',
          }),
        );
      }

      const role = auth.user.role;
      let orgId = query.orgId || null;
      if (role !== 'admin') {
        if (!['owner', 'sales'].includes(role)) {
          return json(403, { message: 'Аналитика недоступна' });
        }
        orgId = auth.user.orgId;
      } else {
        const key = header(event, 'X-Analytics-Key');
        if (key && !safeEqual(key, ANALYTICS_ADMIN_KEY())) {
          return json(403, { message: 'Admin key required' });
        }
      }
      const platform = auth.platform;
      const events = await eventsForAnalytics();
      const staffDir = platform.users
        .filter((u) => STAFF_ROLES.includes(normalizeRole(u.role)))
        .map((u) => ({
          userId: u.id,
          login: u.login,
          displayName: u.displayName,
          orgId: u.orgId,
          role: normalizeRole(u.role),
        }));
      const dash = aggregateAnalyticsDashboard(events, {
        source: 'api',
        from: query.from || null,
        to: query.to || null,
        orgId: role === 'admin' && !query.orgId ? null : orgId,
        partnerCount: platform.users.filter((u) => normalizeRole(u.role) === 'owner').length,
        executorCount: staffDir.filter((e) => !orgId || e.orgId === orgId).length,
        executorDirectory: staffDir,
        journalAll: query.journal === '1',
        ...networkAdminScope(platform),
      });
      return json(200, dash);
    }

    if (method === 'GET' && (path.endsWith('/health') || path === '/' || path.endsWith('/'))) {
      return json(200, { ok: true, service: 'multiframe-partner-api', version: 2 });
    }

    return json(404, { message: `Not found: ${method} ${path}` });
  } catch (e) {
    const status = Number(e.status) >= 400 && Number(e.status) < 600 ? Number(e.status) : 500;
    // Тексты ошибок со статусом 4xx написаны для пользователя. Внутренние сбои наружу не уходят.
    if (status >= 500 && !e.expose) {
      console.error('api error', method, path, e?.stack || e);
      return json(500, { message: 'Внутренняя ошибка сервера' });
    }
    return json(status, { message: e.message || 'Ошибка запроса' });
  }
}
