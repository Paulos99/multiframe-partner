import { handleProfile, profileWithAvatar } from './profileRoutes.js';
/**
 * Yandex Cloud Function HTTP handler — multi-role partner platform.
 * Storage: Object Storage JSON or in-memory seed.
 */
import bcrypt from 'bcryptjs';
import { signToken as signAuthToken, verifyToken } from './authTokens.js';
import { ensureIndexFromTsv, resolveCity } from './cityCatalog.js';
import ruCitiesTsv from './data/ru-cities.js';
import { buildDemoAnalyticsEvents, buildDemoPlatform, extendDemoAnalyticsHistory } from './demoSeed.js';
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
import { applyObjectProjectFields, ensureProjectForNewObject, handleProjects } from './projects.js';
import { computeAnalyticsFunnel } from '../../packages/shared/funnel.js';
import { buildStaffDrill } from '../../packages/shared/staffDrill.js';
import { groupOrphanRooms } from '../../packages/shared/groupProjects.js';
import { estimateForRole } from '../../packages/shared/projectAccess.js';
import { applyDemoPersonalNames, normalizePersonName } from '../../packages/shared/personName.js';
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

const CORS = {
  'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || 'https://paulos99.github.io',
  'Access-Control-Allow-Headers':
    'Content-Type, Authorization, X-Analytics-Key, X-Analytics-Role, X-Analytics-Org, X-Partner-Login',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
};

function uid(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
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
  if (['admin', 'owner', 'sales', 'measurer', 'crew'].includes(role)) return role;
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

function normalizeOrgSettings(partial = {}) {
  return {
    companyName: String(partial.companyName || '').trim(),
    city: String(partial.city || '').trim(),
    panelPriceRub:
      partial.panelPriceRub != null && Number(partial.panelPriceRub) > 0
        ? Number(partial.panelPriceRub)
        : OFFICIAL_PANEL,
    pricePerM2:
      partial.pricePerM2 != null && Number(partial.pricePerM2) > 0
        ? Number(partial.pricePerM2)
        : OFFICIAL_M2,
    installPricePerM2:
      partial.installPricePerM2 == null || Number.isNaN(Number(partial.installPricePerM2))
        ? null
        : Number(partial.installPricePerM2),
    dowelsPerPanel: Math.max(1, Number(partial.dowelsPerPanel) || 2),
    dowelPriceRub:
      partial.dowelPriceRub == null || Number.isNaN(Number(partial.dowelPriceRub))
        ? null
        : Number(partial.dowelPriceRub),
  };
}

function publicUser(user, org) {
  const role = normalizeRole(user.role);
  let settings = org ? normalizeOrgSettings(org.settings) : null;
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

function defaultPlatform() {
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
    const adminHash = bcrypt.hashSync('admin1234', 10);
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
  if (names || grouped) {
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

async function signToken(user) {
  return signAuthToken({ ...user, role: normalizeRole(user.role) });
}

async function requireAuth(event) {
  const token = getAuth(event);
  if (!token) throw Object.assign(new Error('Unauthorized'), { status: 401 });
  const { payload, usedPreviousKey } = await verifyToken(token);
  const platform = await loadPlatform();
  const user = findUser(platform, payload.sub) || findUser(platform, payload.login);
  if (!user || user.loginDisabled || (payload.sessionVersion || 0) !== (user.sessionVersion || 0)) throw Object.assign(new Error('Unauthorized'), { status: 401 });
  return { platform, user: { ...user, role: normalizeRole(user.role) }, payload, usedPreviousKey };
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
  return {
    ...obj,
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
  return {
    id: existing?.id || body.id || uid('obj'),
    orgId: existing?.orgId || actor.orgId,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    createdBy: existing?.createdBy || actor.id,
    assignedTo: body.assignedTo !== undefined ? body.assignedTo : existing?.assignedTo ?? null,
    status: allowed.includes(status) ? status : 'draft',
    stageOrder: stageOrderInput(body, existing),
    clientName: String(body.clientName ?? existing?.clientName ?? '').trim(),
    clientPhone: String(body.clientPhone ?? existing?.clientPhone ?? '').trim(),
    address: String(body.address ?? existing?.address ?? '').trim(),
    city: String(body.city ?? existing?.city ?? org?.settings?.city ?? '').trim(),
    room: body.room || existing?.room || {},
    estimate: body.estimate !== undefined ? body.estimate : existing?.estimate ?? null,
    clientSummary: String(body.clientSummary ?? existing?.clientSummary ?? ''),
    history: existing?.history || [],
    // PDF только через POST /objects/:id/documents — обычный PATCH их не затирает.
    documents: Array.isArray(existing?.documents) ? existing.documents : [],
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

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...CORS,
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
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body;
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

function normalizeIncomingEvent(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const action = String(raw.action || '');
  const tool = String(raw.tool || '');
  if (!action || !tool) return null;
  return {
    id: String(raw.id || uid('ae')),
    at: String(raw.at || new Date().toISOString()),
    orgId: raw.orgId ?? null,
    userId: raw.userId ?? null,
    login: String(raw.login || 'unknown'),
    role: String(raw.role || 'owner'),
    companyName: String(raw.companyName || ''),
    city: String(raw.city || raw.object?.city || ''),
    tool,
    action,
    sessionId:
      raw.sessionId == null || String(raw.sessionId).trim() === ''
        ? null
        : String(raw.sessionId).trim().slice(0, 80),
    object: raw.object || null,
  };
}

export async function handler(event = {}) {
  if (getMethod(event) === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
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

    /* —— Auth —— */
    if (method === 'POST' && path.endsWith('/auth/login')) {
      const { login, password } = getBody(event);
      const platform = await loadPlatform();
      const user = findUser(platform, String(login || '').trim());
      if (
        !user ||
        user.loginDisabled === true ||
        typeof user.passwordHash !== 'string' ||
        !user.passwordHash ||
        !bcrypt.compareSync(String(password || ''), user.passwordHash)
      ) {
        return json(401, { message: 'Неверный логин или пароль' });
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
      if (findUser(platform, login)) return json(409, { message: 'Такой логин уже есть' });
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
        passwordHash: bcrypt.hashSync(password, 10),
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

    if (method === 'POST' && path.endsWith('/admin/demo/reset')) {
      const { user } = await requireAuth(event);
      assertRole(user, ['admin']);
      const platform = defaultPlatform();
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
      const idx = platform.users.findIndex(
        (u) => u.id === partnerUserId && normalizeRole(u.role) === 'owner',
      );
      if (idx < 0) return json(404, { message: 'Партнёр не найден' });
      const pw = String(password || '').trim();
      if (!pw) return json(400, { message: 'Пустой пароль' });
      platform.users[idx] = {
        ...platform.users[idx],
        passwordHash: bcrypt.hashSync(pw, 10),
      };
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
      if (findUser(platform, login)) return json(409, { message: 'Такой логин уже есть' });
      const staff = {
        id: uid('u'),
        login,
        passwordHash: bcrypt.hashSync(password, 10),
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
      if (!pw) return json(400, { message: 'Пустой пароль' });
      const nextUser = {
        ...platform.users[idx],
        passwordHash: bcrypt.hashSync(pw, 10),
      };
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
      return json(200, { ok: true });
    }

    /* —— Analytics —— */
    if (method === 'POST' && path.endsWith('/analytics/events')) {
      const body = getBody(event);
      const incoming = Array.isArray(body.events) ? body.events : body.event ? [body.event] : [];
      const normalized = incoming.map(normalizeIncomingEvent).filter(Boolean);
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
        if (key && key !== ANALYTICS_ADMIN_KEY()) {
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
      let orgId = query.orgId || header(event, 'X-Analytics-Org') || null;
      let role = String(header(event, 'X-Analytics-Role') || 'owner');

      try {
        const auth = await requireAuth(event);
        role = auth.user.role;
        if (role !== 'admin') {
          if (!['owner', 'sales'].includes(role)) {
            return json(403, { message: 'Аналитика недоступна' });
          }
          orgId = auth.user.orgId;
        } else {
          const key = header(event, 'X-Analytics-Key');
          if (key && key !== ANALYTICS_ADMIN_KEY()) {
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
      } catch {
        /* fallback header-key admin for deploy scripts */
        if (role === 'admin') {
          const key = header(event, 'X-Analytics-Key');
          if (key !== ANALYTICS_ADMIN_KEY()) {
            return json(403, { message: 'Admin key required' });
          }
          const events = await eventsForAnalytics();
          const dash = aggregateAnalyticsDashboard(events, {
            source: 'api',
            from: query.from || null,
            to: query.to || null,
            orgId: query.orgId || null,
            journalAll: query.journal === '1',
          });
          return json(200, dash);
        }
        if (!orgId) return json(400, { message: 'orgId required' });
        const events = await eventsForAnalytics();
        const dash = aggregateAnalyticsDashboard(events, {
          source: 'api',
          from: query.from || null,
          to: query.to || null,
          orgId,
          journalAll: query.journal === '1',
        });
        return json(200, dash);
      }
    }

    if (method === 'GET' && (path.endsWith('/health') || path === '/' || path.endsWith('/'))) {
      return json(200, { ok: true, service: 'multiframe-partner-api', version: 2 });
    }

    return json(404, { message: `Not found: ${method} ${path}` });
  } catch (e) {
    const status = e.status || 500;
    return json(status, { message: e.message || 'Server error' });
  }
}
