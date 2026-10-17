/**
 * Yandex Cloud Function HTTP handler — multi-role partner platform.
 * Storage: Object Storage JSON or in-memory seed.
 */
import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { buildDemoAnalyticsEvents, buildDemoPlatform } from './demoSeed.js';

const JWT_SECRET = () => new TextEncoder().encode(process.env.JWT_SECRET || 'dev-secret-change-me');
const ANALYTICS_ADMIN_KEY = () => process.env.ANALYTICS_ADMIN_KEY || 'admin1234';
const PLATFORM_S3_KEY = () => process.env.PLATFORM_KEY || 'platform-v2.json';
const ANALYTICS_S3_KEY = () => process.env.ANALYTICS_KEY || 'analytics-events.json';
const ANALYTICS_CAP = 5000;
const OBJECTS_CAP = 5000;

const ORG_ROLES = ['owner', 'sales', 'measurer', 'crew'];
const STAFF_ROLES = ['sales', 'measurer', 'crew'];
const OFFICIAL_PANEL = 2396;
const OFFICIAL_M2 = 5990;
const DEFAULT_INSTALL = 1500;
const DEFAULT_DOWEL = 25;

const CORS = {
  'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || '*',
  'Access-Control-Allow-Headers':
    'Content-Type, Authorization, X-Analytics-Key, X-Analytics-Role, X-Analytics-Org, X-Partner-Login',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
};

/** @type {any | null} */
let memoryPlatform = null;
/** @type {any[] | null} */
let memoryEvents = null;

function uid(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

function normalizeRole(role) {
  if (role === 'partner') return 'owner';
  if (role === 'executor') return 'measurer';
  if (['admin', 'owner', 'sales', 'measurer', 'crew'].includes(role)) return role;
  return 'measurer';
}

function canSeePrices(role) {
  return role === 'admin' || role === 'owner' || role === 'sales' || role === 'measurer';
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

function redactOrg(org) {
  if (!org) return null;
  return {
    ...org,
    panelPriceRub: 0,
    pricePerM2: 0,
    installPricePerM2: null,
    dowelPriceRub: null,
  };
}

function redactEstimate(est) {
  if (!est) return null;
  return {
    panels: est.panels || 0,
    dowels: est.dowels || 0,
    panelsCost: null,
    installCost: null,
    dowelsCost: null,
    totalCost: null,
  };
}

function publicUser(user, org) {
  const role = normalizeRole(user.role);
  let settings = org ? normalizeOrgSettings(org.settings) : null;
  if (settings && !canSeePrices(role)) settings = redactOrg(settings);
  return {
    id: user.id,
    login: user.login,
    role,
    displayName: user.displayName,
    orgId: user.orgId || null,
    org: settings,
  };
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

function s3ClientConfig() {
  return {
    region: process.env.YC_REGION || 'ru-central1',
    endpoint: 'https://storage.yandexcloud.net',
    credentials: {
      accessKeyId: process.env.YC_ACCESS_KEY_ID,
      secretAccessKey: process.env.YC_SECRET_ACCESS_KEY,
    },
  };
}

async function s3Get(key) {
  const bucket = process.env.PARTNERS_BUCKET;
  if (!bucket) return null;
  const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3');
  const client = new S3Client(s3ClientConfig());
  const out = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  return out.Body.transformToString();
}

async function s3Put(key, body) {
  const bucket = process.env.PARTNERS_BUCKET;
  if (!bucket) return;
  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
  const client = new S3Client(s3ClientConfig());
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: typeof body === 'string' ? body : JSON.stringify(body),
      ContentType: 'application/json',
    }),
  );
}

/** PDF bytes live beside platform JSON. In-memory when the bucket is not configured. */
const memoryDocs = new Map();

async function s3PutBytes(key, bytes, contentType) {
  const bucket = process.env.PARTNERS_BUCKET;
  if (!bucket) {
    memoryDocs.set(key, Buffer.from(bytes));
    return;
  }
  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
  const client = new S3Client(s3ClientConfig());
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: bytes,
      ContentType: contentType || 'application/pdf',
    }),
  );
}

async function s3GetBytes(key) {
  if (memoryDocs.has(key)) return memoryDocs.get(key);
  const bucket = process.env.PARTNERS_BUCKET;
  if (!bucket) return null;
  const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3');
  const client = new S3Client(s3ClientConfig());
  const out = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  return Buffer.from(await out.Body.transformToByteArray());
}

async function s3Delete(key) {
  memoryDocs.delete(key);
  const bucket = process.env.PARTNERS_BUCKET;
  if (!bucket || !key) return;
  try {
    const { S3Client, DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    const client = new S3Client(s3ClientConfig());
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  } catch (e) {
    console.warn('s3 delete failed', key, e?.message || e);
  }
}

async function loadPlatform() {
  if (memoryPlatform) return memoryPlatform;
  const bucket = process.env.PARTNERS_BUCKET;
  if (bucket) {
    try {
      const body = await s3Get(PLATFORM_S3_KEY());
      if (body) {
        const parsed = JSON.parse(body);
        if (parsed?.users && parsed?.orgs) {
          memoryPlatform = parsed;
          return memoryPlatform;
        }
      }
    } catch (e) {
      console.warn('platform load failed', e?.message || e);
    }
    try {
      const legacyKey = process.env.PARTNERS_KEY || 'partners.json';
      const body = await s3Get(legacyKey);
      if (body) {
        const migrated = migrateLegacyPartners(JSON.parse(body));
        if (migrated) {
          memoryPlatform = migrated;
          await savePlatform(migrated);
          return memoryPlatform;
        }
      }
    } catch (e) {
      console.warn('legacy partners migrate failed', e?.message || e);
    }
  }
  memoryPlatform = defaultPlatform();
  return memoryPlatform;
}

async function savePlatform(platform) {
  memoryPlatform = platform;
  await s3Put(PLATFORM_S3_KEY(), JSON.stringify(platform, null, 2));
}

async function loadEvents() {
  if (memoryEvents) return memoryEvents;
  const bucket = process.env.PARTNERS_BUCKET;
  if (bucket) {
    try {
      const body = await s3Get(ANALYTICS_S3_KEY());
      if (body) {
        const parsed = JSON.parse(body);
        memoryEvents = Array.isArray(parsed) ? parsed : parsed?.events || [];
        return memoryEvents;
      }
    } catch (e) {
      console.warn('S3 analytics load failed', e?.message || e);
    }
  }
  memoryEvents = [];
  return memoryEvents;
}

async function saveEvents(list) {
  memoryEvents = list;
  await s3Put(ANALYTICS_S3_KEY(), JSON.stringify(list));
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
  return new SignJWT({ login: user.login, role: normalizeRole(user.role), orgId: user.orgId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime('12h')
    .sign(JWT_SECRET());
}

async function requireAuth(event) {
  const token = getAuth(event);
  if (!token) throw Object.assign(new Error('Unauthorized'), { status: 401 });
  const { payload } = await jwtVerify(token, JWT_SECRET());
  const platform = await loadPlatform();
  const user = findUser(platform, payload.sub) || findUser(platform, payload.login);
  if (!user) throw Object.assign(new Error('Unauthorized'), { status: 401 });
  return { platform, user: { ...user, role: normalizeRole(user.role) }, payload };
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
    return obj.createdBy === user.id || obj.assignedTo === user.id;
  }
  if (user.role === 'crew') {
    // Задание видно только тому монтажнику, на кого его назначили.
    return obj.assignedTo === user.id;
  }
  return false;
}

function publicDocument(doc) {
  if (!doc) return null;
  return {
    id: doc.id,
    versionId: doc.versionId || doc.id,
    createdAt: doc.createdAt,
    createdBy: doc.createdBy || null,
    kind: doc.kind === 'spec' ? 'spec' : 'estimate',
    filename: doc.filename || 'MultiFrame.pdf',
    hasScheme: Boolean(doc.hasScheme),
    panels: doc.panels ?? null,
    areaM2: doc.areaM2 ?? null,
  };
}

/** Монтажник получает спецификацию без цен. Если её нет — ту же смету, чтобы файл не пропал. */
function documentsForRole(docs, role) {
  const list = [...(docs || [])].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const estimates = list.filter((d) => d.kind === 'estimate');
  const specs = list.filter((d) => d.kind === 'spec');
  const picked = canSeePrices(role) ? (estimates.length ? estimates : specs) : specs.length ? specs : estimates;
  return picked.map(publicDocument);
}

function publicObject(obj, role) {
  const copy = { ...obj, history: obj.history || [], documents: documentsForRole(obj.documents, role) };
  if (!canSeePrices(role)) {
    copy.estimate = redactEstimate(obj.estimate);
  }
  return copy;
}

function normalizeObjectInput(body, existing, actor, org) {
  const now = new Date().toISOString();
  const status = body.status || existing?.status || 'draft';
  const allowed = ['draft', 'measured', 'quote_sent', 'install', 'closed'];
  return {
    id: existing?.id || body.id || uid('obj'),
    orgId: existing?.orgId || actor.orgId,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    createdBy: existing?.createdBy || actor.id,
    assignedTo: body.assignedTo !== undefined ? body.assignedTo : existing?.assignedTo ?? null,
    status: allowed.includes(status) ? status : 'draft',
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
  };
}

/* —— analytics aggregate (subset, city-aware) —— */

function dayKey(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function filterAnalyticsEvents(allEvents, opts) {
  const fromMs = opts.from ? Date.parse(opts.from) : null;
  const toMs = opts.to ? Date.parse(opts.to) : null;
  return allEvents
    .filter((e) => {
      const t = Date.parse(e.at);
      if (Number.isNaN(t)) return false;
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

function aggregateAnalyticsDashboard(allEvents, opts) {
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
    funnel: {
      problemomer: {
        open: events.filter((e) => e.tool === 'problemomer' && e.action === 'open').length,
        result: events.filter((e) => e.tool === 'problemomer' && e.action === 'result').length,
        pdf: events.filter((e) => e.tool === 'problemomer' && e.action === 'pdf').length,
        share: events.filter((e) => e.tool === 'problemomer' && e.action === 'share').length,
      },
      calculator: {
        open: events.filter((e) => e.tool === 'calculator' && e.action === 'open').length,
        calcDone: events.filter((e) => e.tool === 'calculator' && e.action === 'calc_done').length,
        pdf: events.filter((e) => e.tool === 'calculator' && e.action === 'pdf').length,
      },
    },
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
      .slice(0, 40),
    events: events.slice(0, 200),
  };
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS },
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
    /* —— Auth —— */
    if (method === 'POST' && path.endsWith('/auth/login')) {
      const { login, password } = getBody(event);
      const platform = await loadPlatform();
      const user = findUser(platform, String(login || '').trim());
      if (!user || !bcrypt.compareSync(String(password || ''), user.passwordHash)) {
        return json(401, { message: 'Неверный логин или пароль' });
      }
      const org = user.orgId ? findOrg(platform, user.orgId) : null;
      const token = await signToken(user);
      pushActivity(platform, {
        orgId: user.orgId,
        userId: user.id,
        login: user.login,
        action: 'login',
        detail: `Роль: ${normalizeRole(user.role)}`,
      });
      await savePlatform(platform);
      return json(200, { token, user: publicUser(user, org) });
    }

    if (method === 'GET' && path.endsWith('/auth/me')) {
      const { platform, user } = await requireAuth(event);
      const org = user.orgId ? findOrg(platform, user.orgId) : null;
      return json(200, { user: publicUser(user, org) });
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
      const city = String(body.city || '').trim();
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
      assertRole(user, ['owner']);
      if (!user.orgId) return json(400, { message: 'Нет организации' });
      const body = getBody(event);
      const login = String(body.login || '').trim();
      const password = String(body.password || '').trim();
      const displayName = String(body.displayName || login).trim();
      const role = normalizeRole(body.role || 'measurer');
      if (!STAFF_ROLES.includes(role)) {
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
      assertRole(user, ['owner']);
      const { staffUserId, password } = getBody(event);
      const idx = platform.users.findIndex(
        (u) =>
          u.id === staffUserId &&
          u.orgId === user.orgId &&
          STAFF_ROLES.includes(normalizeRole(u.role)),
      );
      if (idx < 0) return json(404, { message: 'Сотрудник не найден' });
      const pw = String(password || '').trim();
      if (!pw) return json(400, { message: 'Пустой пароль' });
      platform.users[idx] = {
        ...platform.users[idx],
        passwordHash: bcrypt.hashSync(pw, 10),
      };
      await savePlatform(platform);
      return json(200, { password: pw });
    }

    if (method === 'DELETE' && /\/org\/staff\/[^/]+$/.test(path)) {
      const { platform, user } = await requireAuth(event);
      assertRole(user, ['owner']);
      const staffUserId = path.split('/').pop();
      const staff = platform.users.find(
        (u) =>
          u.id === staffUserId &&
          u.orgId === user.orgId &&
          STAFF_ROLES.includes(normalizeRole(u.role)),
      );
      if (!staff) return json(404, { message: 'Сотрудник не найден' });
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
      if (!obj || !objectVisibleTo(user, obj)) return json(404, { message: 'Объект не найден' });
      const visible = documentsForRole(obj.documents, user.role);
      const meta = visible.find((d) => d.id === docId);
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
      if (idx < 0) return json(404, { message: 'Объект не найден' });
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
        const kind = raw.kind === 'spec' ? 'spec' : 'estimate';
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
          String(raw.filename || '').replace(/[^\w.\-а-яА-ЯёЁ ]+/g, '').trim() ||
          (kind === 'spec' ? 'MultiFrame_spec.pdf' : 'MultiFrame.pdf');
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
          {
            at: now,
            userId: user.id,
            login: user.login,
            action: 'calc_pdf',
            detail: added.map((d) => d.kind).join('+'),
          },
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
      if (!['owner', 'sales', 'measurer'].includes(user.role)) {
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
      const obj = normalizeObjectInput(body, existing, user, org);
      if (existing) {
        if (body.status && body.status !== existing.status) {
          obj.history = [
            {
              at: obj.updatedAt,
              userId: user.id,
              login: user.login,
              action: 'status',
              detail: `${existing.status}→${body.status}`,
            },
            ...(existing.history || []),
          ].slice(0, 50);
        } else {
          obj.history = [
            {
              at: obj.updatedAt,
              userId: user.id,
              login: user.login,
              action: 'update',
            },
            ...(existing.history || []),
          ].slice(0, 50);
        }
        platform.objects[existingIdx] = obj;
      } else {
        obj.history = [
          {
            at: obj.createdAt,
            userId: user.id,
            login: user.login,
            action: 'create',
            detail: obj.status,
          },
        ];
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
      if (idx < 0) return json(404, { message: 'Объект не найден' });
      const existing = platform.objects[idx];
      if (!objectVisibleTo(user, existing)) {
        return json(403, { message: 'Недостаточно прав' });
      }
      if (user.role === 'crew') {
        const body = getBody(event);
        const nextStatus = body.status;
        if (nextStatus && !['install', 'closed'].includes(nextStatus)) {
          return json(403, { message: 'Монтажник меняет только статус монтажа' });
        }
        const next = {
          ...existing,
          status: nextStatus || existing.status,
          updatedAt: new Date().toISOString(),
          history: [
            {
              at: new Date().toISOString(),
              userId: user.id,
              login: user.login,
              action: 'status',
              detail: nextStatus || existing.status,
            },
            ...(existing.history || []),
          ].slice(0, 50),
        };
        platform.objects[idx] = next;
        await savePlatform(platform);
        return json(200, { object: publicObject(next, user.role) });
      }
      const org = findOrg(platform, existing.orgId);
      const body = getBody(event);
      if (body.assignedTo !== undefined && !['owner', 'sales'].includes(user.role)) {
        return json(403, { message: 'Назначать объекты может владелец или менеджер' });
      }
      const next = normalizeObjectInput(body, existing, user, org);
      if (body.status && body.status !== existing.status) {
        next.history = [
          {
            at: next.updatedAt,
            userId: user.id,
            login: user.login,
            action: 'status',
            detail: `${existing.status}→${body.status}`,
          },
          ...(existing.history || []),
        ].slice(0, 50);
      } else if (body.assignedTo !== undefined && body.assignedTo !== existing.assignedTo) {
        next.history = [
          {
            at: next.updatedAt,
            userId: user.id,
            login: user.login,
            action: 'assign',
            detail: String(body.assignedTo || '—'),
          },
          ...(existing.history || []),
        ].slice(0, 50);
      } else {
        next.history = [
          {
            at: next.updatedAt,
            userId: user.id,
            login: user.login,
            action: 'update',
          },
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
      if (!obj || !objectVisibleTo(user, obj)) return json(404, { message: 'Объект не найден' });
      return json(200, { object: publicObject(obj, user.role) });
    }

    if (method === 'DELETE' && /\/objects\/[^/]+$/.test(path)) {
      const { platform, user } = await requireAuth(event);
      if (!['owner', 'sales', 'measurer'].includes(user.role)) {
        return json(403, { message: 'Недостаточно прав' });
      }
      const objectId = path.split('/').pop();
      const idx = (platform.objects || []).findIndex((o) => o.id === objectId);
      if (idx < 0) return json(404, { message: 'Объект не найден' });
      const existing = platform.objects[idx];
      if (!objectVisibleTo(user, existing)) {
        return json(403, { message: 'Недостаточно прав' });
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
      await saveEvents(merged);
      return json(200, { ok: true, accepted: normalized.length });
    }

    if (method === 'DELETE' && path.endsWith('/analytics/events')) {
      const key = header(event, 'X-Analytics-Key');
      if (key !== ANALYTICS_ADMIN_KEY()) {
        return json(403, { message: 'Admin key required' });
      }
      await saveEvents([]);
      return json(200, { ok: true, cleared: true });
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
        const events = await loadEvents();
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
        });
        return json(200, dash);
      } catch {
        /* fallback header-key admin for deploy scripts */
        if (role === 'admin') {
          const key = header(event, 'X-Analytics-Key');
          if (key !== ANALYTICS_ADMIN_KEY()) {
            return json(403, { message: 'Admin key required' });
          }
          const events = await loadEvents();
          const dash = aggregateAnalyticsDashboard(events, {
            source: 'api',
            from: query.from || null,
            to: query.to || null,
            orgId: query.orgId || null,
          });
          return json(200, dash);
        }
        if (!orgId) return json(400, { message: 'orgId required' });
        const events = await loadEvents();
        const dash = aggregateAnalyticsDashboard(events, {
          source: 'api',
          from: query.from || null,
          to: query.to || null,
          orgId,
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
