import { handleProfile, profileWithAvatar } from './profileRoutes.js';
/**
 * Yandex Cloud Function HTTP handler — multi-role partner platform.
 * Storage: Object Storage JSON or in-memory seed.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash, randomBytes } from 'node:crypto';
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
import { awaitsActivation, findUserByActivation, issueActivation, looksLikeActivationToken } from './activation.js';
import { ensureIndexFromTsv, resolveCity } from '../../packages/shared/cityCatalog.js';
import ruCitiesTsv from '../../packages/shared/data/ru-cities.js';
import cisCitiesTsv from '../../packages/shared/data/cis-cities.js';
import {
  buildDemoAnalyticsEvents,
  buildDemoPlatform,
  ensureDemoStpManager,
  ensureDemoFeedback,
  extendDemoAnalyticsHistory,
} from './demoSeed.js';
import { findVisibleDocument, incomingDocumentKind, visibleDocuments } from './documentAccess.js';
import { handleMaterials } from './materialsRoutes.js';
import { handleMaterialPreview } from './materialsPreview.js';
import { handleMaterialThumbnail } from './materialsThumbnail.js';
import {
  isUnsavedDocument,
  loadSharedDocument,
  loadStoredDocument,
  mergeEventList,
  mergePlatformDocument,
  resetStoredDocumentsForTests,
  saveStoredDocument,
} from './platformStore.js';
import { handleRoomShare } from './roomShare.js';
import { handleTraining } from './training.js';
import { handleRoomPhotos, photoCountsForObject, removePhotoFiles, clientReport } from './roomPhotos.js';
import { handleFeedback } from './feedback.js';
import { applyObjectProjectFields, ensureProjectForNewObject, handleProjects } from './projects.js';
import { computeAnalyticsFunnel } from '../../packages/shared/funnel.js';
import { parseBody, schemas } from './validation.js';
import { buildStaffDrill } from '../../packages/shared/staffDrill.js';
import { groupOrphanRooms } from '../../packages/shared/groupProjects.js';
import { estimateForRole } from '../../packages/shared/projectAccess.js';
import { cleanClientPhone, phoneRoomStatusAllowed, roleSeesClientPhone } from '../../packages/shared/clientPhone.js';
import { cleanRefusal } from '../../packages/shared/refusal.js';
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

ensureIndexFromTsv(`${ruCitiesTsv}
${cisCitiesTsv}`);

const ANALYTICS_ADMIN_KEY = () => {
  const key = process.env.ANALYTICS_ADMIN_KEY;
  if (!key) throw new Error('ANALYTICS_ADMIN_KEY must be configured');
  return key;
};
const PLATFORM_S3_KEY = () => process.env.PLATFORM_KEY || 'platform-v2.json';
const ANALYTICS_S3_KEY = () => process.env.ANALYTICS_KEY || 'analytics-events.json';
const AUDIT_S3_KEY = () => process.env.AUDIT_LOG_KEY || 'activity-log.json';
const LOGIN_STATE_S3_KEY = () => process.env.LOGIN_STATE_KEY || 'login-state.json';
/** События аналитики в основном документе. Старше — уходят в месячные архивные объекты, а не пропадают. */
const ANALYTICS_CAP = Number(process.env.ANALYTICS_EVENTS_CAP) || 5000;
/** Журнал действий: старше этого числа записей уходят в архив (отдельный объект), а не пропадают. */
const AUDIT_CAP = Number(process.env.AUDIT_LOG_CAP) || 5000;
/** Предел числа комнат на всех: достигнув его, API отвечает ошибкой, а не вытесняет старые записи молча. */
const OBJECTS_CAP = Number(process.env.MAX_OBJECTS) || 100000;

const ORG_ROLES = ['owner', 'sales', 'measurer', 'crew'];
const STAFF_ROLES = ['sales', 'measurer', 'crew'];
/** Владелец и менеджер компании создают сотрудников и выдают ссылку. Админ StP здесь не ведёт. */
const STAFF_MANAGER_ROLES = ['owner', 'sales'];
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
    'Content-Type, Authorization, If-None-Match, X-Analytics-Key, X-Analytics-Role, X-Analytics-Org, X-Partner-Login',
  'Access-Control-Expose-Headers': 'ETag, Retry-After',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
  'Access-Control-Max-Age': '600',
  Vary: 'Origin',
  ...SECURITY_HEADERS,
};

const MAX_BODY_BYTES = Math.max(100_000, Number(process.env.MAX_BODY_BYTES) || 6_000_000);

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
    phone: user.phone || '',
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
      new Error('Хранилище пусто. Задайте ADMIN_BOOTSTRAP_LOGIN и ADMIN_BOOTSTRAP_PASSWORD (не короче 8 символов).'),
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
  resetListCacheForTests();
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
    merge: (base, desired, fresh) => mergeEventList(base, desired, fresh, ANALYTICS_CAP * 2),
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
  const feedbackDemo = Boolean(platform?.users && ensureDemoFeedback(platform));
  // Первый запуск: пустое хранилище. Стартовый документ записывается сразу, чтобы все экземпляры видели одни и те же записи.
  if (names || grouped || stpDemo || feedbackDemo || isUnsavedDocument(platform)) {
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

/**
 * Документ для чтения: общий разобранный экземпляр без копирования. Менять его нельзя.
 * Правки миграций и записи идут через loadPlatform() со своей копией; чужая версия проверяется один раз.
 */
async function loadPlatformView() {
  return (await loadPlatformViewMeta()).value;
}

/** То же, с версией документа (ETag хранилища) для ответов 304. Без бакета версии нет: null. */
async function loadPlatformViewMeta() {
  if (!partnerBucket()) return { value: await loadPlatform(), version: null };
  const shared = await loadSharedDocument(platformDocumentSpec());
  if (shared.own || shared.migrated) return { value: shared.value, version: shared.etag };
  return shared.runOnce(async () => {
    await loadPlatform();
    const after = await loadSharedDocument(platformDocumentSpec());
    after.markMigrated();
    return { value: after.value, version: after.etag };
  });
}

/* —— Журнал действий и счётчики входа: отдельные небольшие документы ——
 * Раньше каждая запись шла в общий platform-v2.json, то есть переписывала весь файл при каждом входе.
 * Теперь вход меняет только эти два маленьких объекта, а параллельные записи собираются в одну пачку. */

function auditDocumentSpec() {
  return {
    key: () => AUDIT_S3_KEY(),
    accept: (value) => Array.isArray(value),
    normalize: (parsed) => (Array.isArray(parsed) ? parsed : parsed?.events || null),
    fallback: () => [],
    merge: (base, desired, fresh) => mergeEventList(base, desired, fresh, AUDIT_CAP * 2),
  };
}

function auditArchiveSpec(key) {
  return {
    key: () => key,
    accept: (value) => Array.isArray(value),
    normalize: (parsed) => (Array.isArray(parsed) ? parsed : parsed?.events || null),
    fallback: () => [],
    merge: (base, desired, fresh) => mergeEventList(base, desired, fresh, 1_000_000),
  };
}

function loginStateSpec() {
  return {
    key: () => LOGIN_STATE_S3_KEY(),
    accept: (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value) && isPlainObject(value.users),
    fallback: () => ({ version: 1, users: {} }),
    merge: mergeLoginState,
  };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** Сводка записей по пользователям: изменённые этим процессом записи побеждают, остальные берутся из хранилища. */
export function mergeLoginState(base, desired, fresh) {
  const users = { ...(fresh?.users || {}) };
  const before = base?.users || {};
  const want = desired?.users || {};
  for (const id of Object.keys(want)) {
    if (JSON.stringify(want[id]) !== JSON.stringify(before[id])) users[id] = want[id];
  }
  for (const id of Object.keys(before)) {
    if (!(id in want)) delete users[id];
  }
  return { version: 1, users };
}

/** Очередь изменений одного документа: пока идёт запись, новые изменения копятся и уходят следующей пачкой. */
function createBatchedWriter(specFactory, afterApply) {
  let pending = [];
  let running = null;
  async function flush() {
    // Один тик на сбор запросов, пришедших одновременно (пик входов).
    await new Promise((resolve) => setImmediate(resolve));
    while (pending.length) {
      const batch = pending;
      pending = [];
      try {
        const spec = specFactory();
        const doc = await loadStoredDocument(spec);
        for (const item of batch) {
          try {
            item.apply(doc);
          } catch (error) {
            console.warn('batched change skipped', error?.message || error);
          }
        }
        const out = afterApply ? await afterApply(doc) : doc;
        await saveStoredDocument(spec, out, doc);
        for (const item of batch) item.resolve();
      } catch (error) {
        for (const item of batch) item.reject(error);
      }
    }
  }
  function kick() {
    if (running) return;
    running = flush().finally(() => {
      running = null;
      if (pending.length) kick();
    });
  }
  return {
    enqueue(apply) {
      return new Promise((resolve, reject) => {
        pending.push({ apply, resolve, reject });
        kick();
      });
    },
  };
}

/** Список «свежие впереди»: сверх cap старые записи уходят в месячный архивный объект, а не пропадают. */
async function trimToArchive(list, cap, baseKey) {
  if (list.length <= cap) return list;
  const keep = list.slice(0, cap);
  const overflow = list.slice(cap);
  const month = new Date().toISOString().slice(0, 7);
  const archive = auditArchiveSpec(`${baseKey.replace(/\.json$/, '')}-archive-${month}.json`);
  try {
    const stored = await loadStoredDocument(archive);
    const seen = new Set(stored.map((e) => e.id));
    for (const e of overflow) if (!seen.has(e.id)) stored.push(e);
    await saveStoredDocument(archive, stored, stored);
  } catch (error) {
    // Архив не записался: записи остаются в основном документе, ничего не теряется.
    console.warn('archive failed', baseKey, error?.message || error);
    return list;
  }
  return keep;
}

const auditWriter = createBatchedWriter(auditDocumentSpec, (list) => trimToArchive(list, AUDIT_CAP, AUDIT_S3_KEY()));
const eventsWriter = createBatchedWriter(eventsDocumentSpec, (list) => trimToArchive(list, ANALYTICS_CAP, ANALYTICS_S3_KEY()));
const loginStateWriter = createBatchedWriter(loginStateSpec, async (doc) => {
  const now = Date.now();
  for (const [id, row] of Object.entries(doc.users)) {
    const locked = Date.parse(row?.lockedUntil || '') > now;
    const failing = row?.failedLogins && now - Number(row.failedLogins.since || 0) < LOGIN_LOCK.windowMs;
    if (!locked && !failing) delete doc.users[id];
  }
  return doc;
});

async function flushRequestActivity(store) {
  const list = store?.activity;
  if (!list || !list.length) return;
  store.activity = [];
  try {
    await auditWriter.enqueue((doc) => {
      for (const ev of list) doc.unshift(ev);
    });
  } catch (error) {
    console.warn('activity not saved', error?.message || error);
  }
}

async function loadLoginStateView() {
  try {
    return (await loadSharedDocument(loginStateSpec())).value;
  } catch (error) {
    console.warn('login state unavailable', error?.message || error);
    return { version: 1, users: {} };
  }
}

/** Время последнего входа по организации и по пользователю: из нового журнала и из старой записи platform.activity. */
async function lastLoginIndex(platform) {
  const byOrg = new Map();
  const byUser = new Map();
  const take = (list) => {
    for (const a of list || []) {
      if (a?.action !== 'login') continue;
      if (a.orgId && !byOrg.has(a.orgId)) byOrg.set(a.orgId, a.at);
      if (a.userId && !byUser.has(a.userId)) byUser.set(a.userId, a.at);
    }
  };
  try {
    take((await loadSharedDocument(auditDocumentSpec())).value);
  } catch (error) {
    console.warn('audit unavailable', error?.message || error);
  }
  take(platform.activity);
  return { byOrg, byUser };
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

/** Запись журнала действий. Уходит в отдельный объект activity-log.json в конце запроса, не в platform-v2.json. */
function pushActivity(platform, partial) {
  void platform;
  const ev = {
    id: uid('act'),
    at: partial.at || new Date().toISOString(),
    orgId: partial.orgId ?? null,
    userId: partial.userId ?? null,
    login: partial.login || '',
    action: partial.action,
    detail: partial.detail,
  };
  const store = requestContext.getStore();
  if (store) {
    store.activity.push(ev);
    return;
  }
  // Вне запроса (скрипты, тесты): записываем сразу, не теряя запись.
  void auditWriter.enqueue((doc) => {
    doc.unshift(ev);
  }).catch((error) => console.warn('activity not saved', error?.message || error));
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

/** Счётчик неверных паролей: в отдельном документе login-state.json, общем для всех экземпляров функции. */
async function recordLoginFailure(platform, user, nowMs) {
  void platform;
  try {
    let locked = false;
    await loginStateWriter.enqueue((doc) => {
      const row = doc.users[user.id] || {};
      const prev = row.failedLogins;
      const fresh = prev && nowMs - Number(prev.since || 0) < LOGIN_LOCK.windowMs;
      const count = (fresh ? Number(prev.count) || 0 : 0) + 1;
      const next = { ...row, failedLogins: { count, since: fresh ? prev.since : nowMs } };
      if (count >= LOGIN_LOCK.failures) {
        next.lockedUntil = new Date(nowMs + LOGIN_LOCK.lockMs).toISOString();
        next.failedLogins = { count: 0, since: nowMs };
        locked = true;
      }
      doc.users[user.id] = next;
    });
    if (locked) {
      pushActivity(null, {
        orgId: user.orgId,
        userId: user.id,
        login: user.login,
        action: 'login_locked',
        detail: 'Серия неверных паролей',
      });
    }
  } catch (error) {
    console.warn('login failure counter not saved', error?.message || error);
  }
}

/** Снять блокировку и счётчик неверных паролей (вход, смена пароля админом). */
async function clearLoginState(userId) {
  try {
    await loginStateWriter.enqueue((doc) => {
      delete doc.users[userId];
    });
  } catch (error) {
    console.warn('login state not cleared', error?.message || error);
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

/** { readonly: true } — platform в ответе общий и неизменяемый: для обработчиков, которые только читают. */
async function requireAuth(event, { readonly = false } = {}) {
  const token = getAuth(event);
  if (!token) throw Object.assign(new Error('Unauthorized'), { status: 401 });
  const { payload, usedPreviousKey } = await verifyToken(token);
  let version = null;
  let platform;
  if (readonly) {
    const meta = await loadPlatformViewMeta();
    platform = meta.value;
    version = meta.version;
  } else {
    platform = await loadPlatform();
  }
  // Только по идентификатору из токена: совпадение по логину позволило бы старому токену
  // подойти новой учётной записи с тем же логином.
  const user = (platform.users || []).find((u) => u.id === payload.sub) || null;
  if (!user || user.loginDisabled || (payload.sessionVersion || 0) !== (user.sessionVersion || 0)) throw Object.assign(new Error('Unauthorized'), { status: 401 });
  const role = normalizeRole(user.role);
  // Менеджеру StP закрыто всё, чего нет в списке разрешённого (packages/shared/rolePermissions.js).
  if (isStpManager(role) && !stpManagerMayCall(getMethod(event), getPath(event))) {
    throw Object.assign(new Error('Недостаточно прав'), { status: 403 });
  }
  return { platform, user: { ...user, role }, payload, usedPreviousKey, version };
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
    // Телефон клиента: только владелец, менеджер, замерщик и монтажник, и только с этапа «Замер».
    clientPhone: roleSeesClientPhone(role) && phoneRoomStatusAllowed(obj.status) ? obj.clientPhone || '' : '',
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
  const finalStatus = allowed.includes(status) ? status : 'draft';
  const phone = objectPhone(body, existing, finalStatus);
  const refusal = objectRefusal(body, existing, finalStatus, actor, now);
  parseBody(schemas.objectInput({ isNew: !existing }), body);
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
  return {
    id: existing?.id || (body.id != null ? String(body.id) : uid('obj')),
    orgId: existing?.orgId || actor.orgId,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    createdBy: existing?.createdBy || actor.id,
    assignedTo,
    status: finalStatus,
    stageOrder: stageOrderInput(body, existing),
    clientName: String(body.clientName ?? existing?.clientName ?? '').trim().slice(0, 200),
    clientPhone: phone,
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
    ...(refusal ? { refusal } : {}),
    ...link,
  };
}

/**
 * Телефон клиента комнаты. Новый номер принимается только с этапа «Замер»: замер, КП, монтаж.
 * Очистка и неизменённое значение проходят на любом этапе.
 */
function objectPhone(body, existing, status) {
  const current = String(existing?.clientPhone ?? '').trim();
  if (body.clientPhone === undefined) return current;
  const raw = String(body.clientPhone ?? '').trim();
  if (raw === current) return current;
  const cleaned = cleanClientPhone(raw);
  if (cleaned.error) throw Object.assign(new Error(cleaned.error), { status: 400 });
  if (cleaned.value && !phoneRoomStatusAllowed(status)) {
    throw Object.assign(new Error('Телефон клиента можно указать с этапа «Замер»'), { status: 400 });
  }
  return cleaned.value;
}

/** Отказ клиента. Запись живёт только у закрытой комнаты; причина обязательна. */
function objectRefusal(body, existing, status, actor, now) {
  if (status !== 'closed') return null;
  const cleaned = cleanRefusal(body.refusal, {
    userId: actor.id,
    now,
    existing: existing?.status === 'closed' ? existing?.refusal || null : null,
  });
  if (cleaned.error) throw Object.assign(new Error(cleaned.error), { status: 400 });
  return cleaned.value || null;
}

/** Запись «Отказ: причина» в истории, когда комната закрыта отказом или причина изменилась. */
function withRefusalHistory(next, existing, actor) {
  if (!next.refusal) return next;
  const before = existing?.status === 'closed' ? existing?.refusal : null;
  if (before && before.reasonKey === next.refusal.reasonKey && before.comment === next.refusal.comment) return next;
  return {
    ...next,
    history: [historyEvent(actor, next.updatedAt, 'refusal', next.refusal.reasonKey), ...(next.history || [])].slice(0, 50),
  };
}

/* —— analytics aggregate (subset, city-aware) —— */

const DEFAULT_ANALYTICS_TZ = 'Europe/Moscow';
const dayFormatters = new Map();

/** Часовой пояс для разбивки по дням: из запроса, затем ANALYTICS_TZ, затем Москва. Неверное имя пояса игнорируется. */
export function resolveAnalyticsTz(requested) {
  for (const candidate of [requested, process.env.ANALYTICS_TZ, DEFAULT_ANALYTICS_TZ]) {
    const name = String(candidate || '').trim();
    if (!name) continue;
    try {
      new Intl.DateTimeFormat('en-CA', { timeZone: name });
      return name;
    } catch {
      /* следующий кандидат */
    }
  }
  return 'UTC';
}

/** Календарный день события в заданном часовом поясе (ГГГГ-ММ-ДД). Раньше брался пояс сервера, то есть UTC. */
export function dayKey(iso, tz = DEFAULT_ANALYTICS_TZ) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  let fmt = dayFormatters.get(tz);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
    dayFormatters.set(tz, fmt);
  }
  return fmt.format(d);
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
  const tz = resolveAnalyticsTz(opts.tz);
  const endKey = dayKey(toDate.toISOString(), tz);
  const startKey = dayKey(fromDate.toISOString(), tz);
  if (startKey && endKey && startKey <= endKey) {
    // Шаг в двенадцать часов не пропускает день при переходе на летнее время в других поясах.
    for (let t = fromDate.getTime(), n = 0; n < 4000; t += 12 * 60 * 60 * 1000, n += 1) {
      const key = dayKey(new Date(t).toISOString(), tz);
      if (key > endKey) break;
      if (key && !seriesMap.has(key)) seriesMap.set(key, { day: key, problemomer: 0, calculator: 0, pdf: 0, logins: 0 });
    }
  }
  for (const e of events) {
    const key = dayKey(e.at, tz);
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

/* —— Списки с проверкой версии и постраничной выдачей ——
 * Ответ зависит от версии документа и от пользователя. Клиент присылает If-None-Match и, если ничего не
 * изменилось, получает 304 без тела и без пересборки списка. Собранные ответы держатся в небольшом кэше. */

const listCache = new Map();
let listCacheBytes = 0;
const LIST_CACHE_BYTES = Number(process.env.LIST_CACHE_BYTES) || 64 * 1024 * 1024;

function listCacheGet(key) {
  const hit = listCache.get(key);
  if (hit) {
    listCache.delete(key);
    listCache.set(key, hit);
  }
  return hit || null;
}

function listCachePut(key, entry) {
  if (entry.body.length > LIST_CACHE_BYTES / 2) return;
  listCache.set(key, entry);
  listCacheBytes += entry.body.length;
  for (const [oldKey, old] of listCache) {
    if (listCacheBytes <= LIST_CACHE_BYTES) break;
    listCache.delete(oldKey);
    listCacheBytes -= old.body.length;
  }
}

export function resetListCacheForTests() {
  listCache.clear();
  listCacheBytes = 0;
}

/** Слабый ETag: версия документа плюс всё, от чего зависит ответ. */
function listEtag(version, parts) {
  const raw = [version, ...parts].join('|');
  return `W/"${createHash('sha1').update(raw).digest('hex').slice(0, 24)}"`;
}

function ifNoneMatchHas(event, etag) {
  const raw = header(event, 'If-None-Match');
  if (!raw) return false;
  return String(raw)
    .split(',')
    .map((x) => x.trim())
    .includes(etag);
}

/**
 * limit/offset необязательны: без них отдаётся весь список (как раньше). С limit — страница,
 * и в ответе total и nextOffset (null на последней странице).
 */
function listResponse(event, { version, user, name, query, build, field }) {
  const limitRaw = Number(query?.limit);
  const paged = Number.isFinite(limitRaw) && limitRaw > 0;
  const limit = paged ? Math.min(2000, Math.floor(limitRaw)) : 0;
  const offset = paged ? Math.max(0, Math.floor(Number(query?.offset) || 0)) : 0;
  const etag = version
    ? listEtag(version, [name, user.id, user.role, user.orgId || '', limit, offset])
    : null;
  const headers = etag ? { ETag: etag } : {};
  if (etag && ifNoneMatchHas(event, etag)) {
    return { statusCode: 304, headers: { ...json(200, {}).headers, ...headers }, body: '' };
  }
  const cached = etag ? listCacheGet(etag) : null;
  if (cached) {
    return { statusCode: 200, headers: { ...json(200, {}).headers, ...headers }, body: cached.body };
  }
  const all = build();
  const page = paged ? all.slice(offset, offset + limit) : all;
  const payload = { [field]: page };
  if (paged) {
    payload.total = all.length;
    payload.nextOffset = offset + limit < all.length ? offset + limit : null;
  }
  const out = json(200, payload, headers);
  if (etag) listCachePut(etag, { body: out.body });
  return out;
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
  const store = { origin: header(event, 'Origin') || '', activity: [] };
  return requestContext.run(store, async () => {
    try {
      return await handleRequest(event);
    } finally {
      // Записи журнала уходят пачкой до ответа: функция не «замораживается» с недописанным журналом.
      await flushRequestActivity(store);
    }
  });
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
      requireAuthReadonly: () => requireAuth(event, { readonly: true }),
      listResponse: (opts) => listResponse(event, { ...opts, query: getQuery(event) }),
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

    const feedbackResponse = await handleFeedback({
      ...storageCtx,
      path,
      method,
      requireAuth: () => requireAuth(event),
      loadPlatform,
      getBody: () => getBody(event),
      getQuery: () => getQuery(event),
      savePlatform,
      pushActivity,
      uid,
    });
    if (feedbackResponse) return feedbackResponse;

    /* —— Auth —— */
    if (method === 'POST' && path.endsWith('/auth/login')) {
      const { login: loginText, password } = parseBody(schemas.loginRequest, getBody(event));
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
      const platform = await loadPlatformView();
      const user = findUserByLogin(platform, loginText);
      const nowMs = Date.now();
      const state = user ? (await loadLoginStateView()).users?.[user.id] || null : null;
      // Старые записи хранили блокировку прямо в пользователе: учитываем обе.
      const lockedUntil = Math.max(Date.parse(user?.lockedUntil || '') || 0, Date.parse(state?.lockedUntil || '') || 0);
      if (user && lockedUntil > nowMs) {
        rateHit(ipKey, ipLimit);
        const wait = Math.ceil((lockedUntil - nowMs) / 1000);
        return json(
          429,
          { message: 'Слишком много неверных паролей. Вход временно закрыт, повторите позже.' },
          { 'Retry-After': String(Math.max(1, wait)) },
        );
      }
      const hasHash = Boolean(user) && typeof user.passwordHash === 'string' && user.passwordHash;
      const valid = hasHash ? await bcrypt.compare(password, user.passwordHash) : false;
      if (!hasHash) await dummyCompare(password);
      if (!user || user.loginDisabled === true || !valid) {
        rateHit(ipKey, ipLimit);
        if (user && hasHash && !valid) await recordLoginFailure(platform, user, nowMs);
        return json(401, { message: 'Неверный логин или пароль' });
      }
      rateReset(ipKey);
      const token = await signToken(user);
      pushActivity(null, {
        orgId: user.orgId,
        userId: user.id,
        login: user.login,
        action: 'login',
        detail: `Роль: ${normalizeRole(user.role)}`,
      });
      // Файл платформы при входе не переписывается: сбрасываем только маленькую запись счётчика.
      if (state) await clearLoginState(user.id);
      return json(200, { token, user: await sessionUser(user, platform) });
    }

    if (method === 'GET' && path.endsWith('/auth/me')) {
      const { platform, user, payload, usedPreviousKey } = await requireAuth(event, { readonly: true });
      // Скользящая сессия: токен старше часа обновляется, чтобы активный пользователь не упирался в 12 ч.
      const stale = Number(payload?.iat) > 0 && Date.now() / 1000 - Number(payload.iat) > 3600;
      return json(200, { user: await sessionUser(user, platform), ...(usedPreviousKey || stale ? { token: await signToken(user) } : {}) });
    }

    if (method === 'POST' && path.endsWith('/auth/logout')) {
      return json(200, { ok: true });
    }

    /* —— Ссылка активации: первый пароль сотрудника и сброс пароля —— */
    if (method === 'POST' && path.endsWith('/auth/invite')) {
      const { platform, user } = await requireAuth(event);
      const inviteLimit = { limit: 20, windowMs: 15 * 60 * 1000 };
      const inviteHit = rateHit(`invite:${user.id}`, inviteLimit);
      if (!inviteHit.allowed) {
        return json(
          429,
          { message: 'Слишком много ссылок за короткое время. Повторите позже.' },
          { 'Retry-After': String(inviteHit.retryAfter) },
        );
      }
      const { userId } = getBody(event);
      const idx = platform.users.findIndex((u) => u.id === String(userId || ''));
      const target = idx < 0 ? null : platform.users[idx];
      const targetRole = target ? normalizeRole(target.role) : null;
      // Админ StP выдаёт ссылки владельцам партнёров и менеджерам StP, владелец — сотрудникам своей компании.
      const allowed =
        Boolean(target) &&
        (user.role === 'admin'
          ? targetRole === 'owner' || targetRole === STP_MANAGER_ROLE
          : STAFF_MANAGER_ROLES.includes(user.role) &&
            Boolean(user.orgId) &&
            target.orgId === user.orgId &&
            STAFF_ROLES.includes(targetRole));
      if (!allowed) return json(404, { message: 'Пользователь не найден' });
      if (target.loginDisabled === true) {
        return json(409, { message: 'Пользователь отключён: ссылку выдать нельзя' });
      }
      const nextUser = { ...target };
      const { token, expiresAt } = issueActivation(nextUser);
      platform.users[idx] = nextUser;
      pushActivity(platform, {
        orgId: nextUser.orgId,
        userId: user.id,
        login: user.login,
        action: 'issue_activation',
        detail: nextUser.login,
      });
      await savePlatform(platform);
      // Токен есть только в этом ответе: в записи пользователя лежит один хеш.
      return json(200, { path: `?activate=${token}`, expiresAt });
    }

    if (method === 'POST' && path.endsWith('/auth/activate')) {
      const ip = clientIp(event) || 'unknown';
      const activateLimit = { limit: 10, windowMs: 15 * 60 * 1000 };
      const activateHit = rateHit(`activate-ip:${ip}`, activateLimit);
      if (!activateHit.allowed) {
        return json(
          429,
          { message: 'Слишком много попыток. Подождите и повторите.' },
          { 'Retry-After': String(activateHit.retryAfter) },
        );
      }
      const body = getBody(event);
      const invalid = { message: 'Ссылка недействительна или срок истёк' };
      const token = typeof body.token === 'string' ? body.token : '';
      if (!looksLikeActivationToken(token)) return json(400, invalid);
      const platform = await loadPlatform();
      const found = findUserByActivation(platform.users, token);
      if (!found || found.loginDisabled === true) return json(400, invalid);
      const password = String(body.password ?? '');
      const weakActivation = passwordProblem(password);
      if (weakActivation) return json(400, { message: weakActivation });
      const idx = platform.users.findIndex((u) => u.id === found.id);
      let nextLogin = platform.users[idx].login;
      const wantedLogin = typeof body.login === 'string' ? body.login.trim() : '';
      if (wantedLogin) {
        if (wantedLogin.length > 64) return json(400, { message: 'Логин слишком длинный' });
        if (loginTaken(platform, wantedLogin) && wantedLogin !== platform.users[idx].login) {
          return json(409, { message: 'Такой логин уже есть' });
        }
        nextLogin = wantedLogin;
      } else if (!platform.users[idx].passwordHash && String(platform.users[idx].login || '').startsWith('inv_')) {
        return json(400, { message: 'Укажите логин' });
      }
      // Одна запись: логин, пароль, закрытые сеансы и стёртая ссылка.
      const nextUser = {
        ...platform.users[idx],
        login: nextLogin,
        passwordHash: await hashPassword(password),
        sessionVersion: (Number(platform.users[idx].sessionVersion) || 0) + 1,
      };
      delete nextUser.activation;
      delete nextUser.failedLogins;
      delete nextUser.lockedUntil;
      delete nextUser.password;
      platform.users[idx] = nextUser;
      pushActivity(platform, {
        orgId: nextUser.orgId,
        userId: nextUser.id,
        login: nextUser.login,
        action: 'activate_account',
        detail: 'Аккаунт активирован по ссылке',
      });
      await savePlatform(platform);
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
      const { platform, user } = await requireAuth(event, { readonly: true });
      assertRole(user, ['admin']);
      const owners = platform.users.filter((u) => normalizeRole(u.role) === 'owner');
      const logins = await lastLoginIndex(platform);
      const orgsById = new Map((platform.orgs || []).map((o) => [o.id, o]));
      const staffByOrg = new Map();
      for (const x of platform.users) {
        if (x.orgId && STAFF_ROLES.includes(normalizeRole(x.role))) staffByOrg.set(x.orgId, (staffByOrg.get(x.orgId) || 0) + 1);
      }
      const list = owners.map((u) => {
        const org = orgsById.get(u.orgId) || null;
        const staffCount = staffByOrg.get(u.orgId) || 0;
        const last = { at: logins.byOrg.get(u.orgId) };
        return {
          user: {
            id: u.id,
            login: u.login,
            role: 'owner',
            displayName: u.displayName,
            orgId: u.orgId,
            createdAt: u.createdAt,
            pendingActivation: awaitsActivation(u),
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
      const city = cityOrThrow(body.city ?? '', null);
      const { login, password, companyName } = parseBody(schemas.partnerCreate, body);
      // Пароль можно не задавать: владелец получит ссылку активации и придумает его сам.
      const weak = password ? passwordProblem(password) : '';
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
        ...(password ? { passwordHash: await hashPassword(password) } : {}),
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
      return json(200, {
        login,
        ...(password ? { password } : { pendingActivation: true }),
        user: publicUser(owner, org),
      });
    }

    /* —— Менеджеры StP: внутренние сотрудники MultiFrame, обучение и ссылки на инструменты —— */
    if (method === 'GET' && path.endsWith('/admin/stp-managers')) {
      const { platform, user } = await requireAuth(event, { readonly: true });
      assertRole(user, ['admin']);
      const logins = await lastLoginIndex(platform);
      const managers = platform.users
        .filter((u) => normalizeRole(u.role) === STP_MANAGER_ROLE)
        .map((u) => {
          const last = { at: logins.byUser.get(u.id) };
          return {
            id: u.id,
            login: u.login,
            role: STP_MANAGER_ROLE,
            displayName: u.displayName,
            orgId: u.orgId || null,
            createdAt: u.createdAt,
            lastLogin: last?.at || null,
            pendingActivation: awaitsActivation(u),
          };
        });
      return json(200, { managers });
    }

    if (method === 'POST' && path.endsWith('/admin/stp-managers')) {
      const { platform, user } = await requireAuth(event);
      assertRole(user, ['admin']);
      const { login, password, displayName } = parseBody(schemas.stpManagerCreate, getBody(event));
      if (findUser(platform, login)) return json(409, { message: 'Такой логин уже есть' });
      const weakManager = password ? passwordProblem(password) : '';
      if (weakManager) return json(400, { message: weakManager });
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
        ...(password ? { passwordHash: await hashPassword(password) } : {}),
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
      return json(200, {
        id: manager.id,
        login,
        ...(password ? { password } : { pendingActivation: true }),
        role: STP_MANAGER_ROLE,
        displayName,
      });
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
      await clearLoginState(platform.users[idx].id);
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
      const body = parseBody(schemas.partnerCityUpdate, getBody(event));
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
      const { platform, user } = await requireAuth(event, { readonly: true });
      assertRole(user, ['owner', 'sales']);
      if (!user.orgId) return json(400, { message: 'Нет организации' });
      const staff = platform.users
        .filter((u) => u.orgId === user.orgId && STAFF_ROLES.includes(normalizeRole(u.role)))
        .map((u) => ({
          id: u.id,
          login: u.login,
          role: normalizeRole(u.role),
          displayName: u.displayName,
          phone: u.phone || '',
          orgId: u.orgId,
          createdAt: u.createdAt,
          pendingActivation: awaitsActivation(u),
        }));
      return json(200, { staff });
    }

    if (method === 'POST' && path.endsWith('/org/staff')) {
      const { platform, user } = await requireAuth(event);
      assertRole(user, STAFF_MANAGER_ROLES);
      if (!user.orgId) return json(400, { message: 'Нет организации' });
      const parsed = parseBody(schemas.staffCreate, getBody(event));
      let { login, password, displayName, role } = parsed;
      const weak = password ? passwordProblem(password) : '';
      if (weak) return json(400, { message: weak });
      if (!login) login = `inv_${uid('x').slice(2, 10)}`;
      if (loginTaken(platform, login)) return json(409, { message: 'Такой логин уже есть' });
      const staff = {
        id: uid('u'),
        login,
        ...(password ? { passwordHash: await hashPassword(password) } : {}),
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
        ...(password ? { password } : { pendingActivation: true }),
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
      await clearLoginState(nextUser.id);
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
      const body = parseBody(schemas.staffUpdate, getBody(event));
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
      assertRole(user, ['owner']);
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
            .slice(0, 120) || (kind === 'profile' ? 'профиль.pdf' : kind === 'offer' ? 'кп.pdf' : 'смета.pdf');
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
          ...(kind === 'offer'
            ? {
                stamp: String(raw.stamp || '').replace(/[^\w-]/g, '').slice(0, 64) || null,
                projectId: existing.projectId || null,
              }
            : {}),
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
            added.every((d) => d.kind === 'profile') ? 'profile_pdf' : added.every((d) => d.kind === 'offer') ? 'offer_pdf' : 'calc_pdf',
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
      const { platform, user, version } = await requireAuth(event, { readonly: true });
      if (user.role !== 'admin' && !user.orgId) return json(400, { message: 'Нет организации' });
      const query = getQuery(event);
      return listResponse(event, {
        version,
        user,
        name: 'objects',
        query,
        build: () => (platform.objects || []).filter((o) => objectVisibleTo(user, o)).map((o) => publicObject(o, user.role)),
        field: 'objects',
      });
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
        obj = withRefusalHistory(obj, existing, user);
        platform.objects[existingIdx] = obj;
      } else {
        obj.history = [historyEvent(user, obj.createdAt, 'create', obj.status)];
        if ((platform.objects || []).length >= OBJECTS_CAP) {
          // Раньше старые комнаты молча вытеснялись. Теперь запись отклоняется, данные не теряются.
          throw Object.assign(new Error('Достигнут предел числа комнат в системе. Свяжитесь с администратором.'), {
            status: 409,
            expose: true,
          });
        }
        platform.objects = [obj, ...(platform.objects || [])];
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
      const stored = withRefusalHistory(next, existing, user);
      platform.objects[idx] = stored;
      await savePlatform(platform);
      return json(200, { object: publicObject(stored, user.role) });
    }

    if (method === 'GET' && /\/objects\/[^/]+$/.test(path) && !path.endsWith('/objects')) {
      const { platform, user } = await requireAuth(event, { readonly: true });
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
      // Одновременные события собираются в одну запись основного документа аналитики.
      await eventsWriter.enqueue((doc) => {
        const ids = new Set(doc.map((e) => e.id));
        doc.unshift(...normalized.filter((e) => !ids.has(e.id)));
      });
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
        tz: query.tz,
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
        tz: query.tz,
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
