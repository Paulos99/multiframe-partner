/**
 * Yandex Cloud Function HTTP handler — partner auth + profile + analytics.
 * Storage: Object Storage JSON or in-memory seed.
 */
import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';

const JWT_SECRET = () => new TextEncoder().encode(process.env.JWT_SECRET || 'dev-secret-change-me');
const ANALYTICS_ADMIN_KEY = () => process.env.ANALYTICS_ADMIN_KEY || 'admin1234';
const ANALYTICS_S3_KEY = () => process.env.ANALYTICS_KEY || 'analytics-events.json';
const ANALYTICS_CAP = 5000;

const CORS = {
  'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || '*',
  'Access-Control-Allow-Headers':
    'Content-Type, Authorization, X-Analytics-Key, X-Analytics-Role, X-Analytics-Org, X-Partner-Login',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
};

/** @typedef {{ id: string, login: string, passwordHash: string, companyName: string, panelPriceRub: number|null, pricePerM2: number|null, installPricePerM2: number|null, dowelsPerPanel: number, dowelPriceRub: number|null }} PartnerRow */

/** @type {PartnerRow[] | null} */
let memoryPartners = null;
/** @type {any[] | null} */
let memoryEvents = null;

function publicPartner(row) {
  const { passwordHash: _, ...rest } = row;
  return rest;
}

function defaultSeed() {
  const hash = bcrypt.hashSync('demo1234', 10);
  return [
    {
      id: 'p1',
      login: 'partner1',
      passwordHash: hash,
      companyName: 'Демо Партнёр',
      panelPriceRub: 2396,
      pricePerM2: 5990,
      installPricePerM2: 1500,
      dowelsPerPanel: 2,
      dowelPriceRub: 25,
    },
  ];
}

function parseSeed() {
  const raw = process.env.PARTNERS_SEED;
  if (!raw) return defaultSeed();
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : defaultSeed();
  } catch {
    return defaultSeed();
  }
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

async function loadPartners() {
  if (memoryPartners) return memoryPartners;
  const bucket = process.env.PARTNERS_BUCKET;
  const key = process.env.PARTNERS_KEY || 'partners.json';
  if (bucket) {
    try {
      const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3');
      const client = new S3Client(s3ClientConfig());
      const out = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      const body = await out.Body.transformToString();
      memoryPartners = JSON.parse(body);
      return memoryPartners;
    } catch (e) {
      console.warn('S3 partners load failed, using seed', e?.message || e);
    }
  }
  memoryPartners = parseSeed();
  return memoryPartners;
}

async function savePartners(list) {
  memoryPartners = list;
  const bucket = process.env.PARTNERS_BUCKET;
  const key = process.env.PARTNERS_KEY || 'partners.json';
  if (!bucket) return;
  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
  const client = new S3Client(s3ClientConfig());
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: JSON.stringify(list, null, 2),
      ContentType: 'application/json',
    }),
  );
}

async function loadEvents() {
  if (memoryEvents) return memoryEvents;
  const bucket = process.env.PARTNERS_BUCKET;
  if (bucket) {
    try {
      const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3');
      const client = new S3Client(s3ClientConfig());
      const out = await client.send(
        new GetObjectCommand({ Bucket: bucket, Key: ANALYTICS_S3_KEY() }),
      );
      const body = await out.Body.transformToString();
      const parsed = JSON.parse(body);
      memoryEvents = Array.isArray(parsed) ? parsed : parsed?.events || [];
      return memoryEvents;
    } catch (e) {
      console.warn('S3 analytics load failed', e?.message || e);
    }
  }
  memoryEvents = [];
  return memoryEvents;
}

async function saveEvents(list) {
  memoryEvents = list;
  const bucket = process.env.PARTNERS_BUCKET;
  if (!bucket) return;
  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
  const client = new S3Client(s3ClientConfig());
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: ANALYTICS_S3_KEY(),
      Body: JSON.stringify(list),
      ContentType: 'application/json',
    }),
  );
}

function dayKey(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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

function emptyPartnerRow(orgId, companyName) {
  return {
    orgId,
    companyName,
    logins: 0,
    problemomer: 0,
    calculator: 0,
    pdf: 0,
    shares: 0,
    areaM2: 0,
    panels: 0,
    lastActiveAt: null,
  };
}

function computeVolume(events) {
  let areaM2Sum = 0;
  let panelsSum = 0;
  let withArea = 0;
  let completedCount = 0;
  for (const e of events) {
    if (!isCompletedWork(e)) continue;
    completedCount += 1;
    const area = numOr0(e.object?.areaM2);
    const panels = numOr0(e.object?.panels);
    if (area > 0) {
      areaM2Sum += area;
      withArea += 1;
    }
    if (panels > 0) panelsSum += panels;
  }
  return {
    areaM2Sum: Math.round(areaM2Sum * 10) / 10,
    areaM2Avg: withArea ? Math.round((areaM2Sum / withArea) * 10) / 10 : 0,
    panelsSum: Math.round(panelsSum),
    completedCount,
  };
}

function computeKpi(events, opts) {
  const orgs = new Set();
  let areaM2 = 0;
  let panels = 0;
  for (const e of events) {
    orgs.add(e.orgId || e.companyName || e.login);
    if (isCompletedWork(e)) {
      areaM2 += numOr0(e.object?.areaM2);
      panels += numOr0(e.object?.panels);
    }
  }
  return {
    partners: opts.partnerCount ?? orgs.size,
    activePartners: orgs.size,
    executors: opts.executorCount ?? opts.activeExecutors,
    problemomerResults: events.filter((e) => e.tool === 'problemomer' && e.action === 'result')
      .length,
    calculatorDone: events.filter((e) => e.tool === 'calculator' && e.action === 'calc_done')
      .length,
    pdf: events.filter((e) => e.action === 'pdf').length,
    shares: events.filter((e) => e.action === 'share').length,
    logins: events.filter((e) => e.action === 'login').length,
    areaM2: Math.round(areaM2 * 10) / 10,
    panels: Math.round(panels),
  };
}

function computeFunnel(events) {
  return {
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
  };
}

function toBreakdown(counts) {
  const total = [...counts.values()].reduce((s, n) => s + n, 0) || 1;
  return [...counts.entries()]
    .map(([key, count]) => ({
      key,
      count,
      share: Math.round((count / total) * 1000) / 10,
    }))
    .sort((a, b) => b.count - a.count);
}

function computeBreakdowns(events) {
  const roomType = new Map();
  const houseType = new Map();
  const objectStage = new Map();
  const classTransition = new Map();
  const calcMode = new Map();

  const bump = (map, key) => {
    const k = (key && String(key).trim()) || 'unknown';
    map.set(k, (map.get(k) || 0) + 1);
  };

  for (const e of events) {
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

  return {
    roomType: toBreakdown(roomType),
    houseType: toBreakdown(houseType),
    objectStage: toBreakdown(objectStage),
    classTransition: toBreakdown(classTransition),
    calcMode: toBreakdown(calcMode),
  };
}

function computeSeries(events, from, to) {
  const toDate = to ? new Date(to) : new Date();
  let fromDate = from ? new Date(from) : new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);
  if (Number.isNaN(fromDate.getTime())) {
    fromDate = new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);
  }
  if (Number.isNaN(toDate.getTime())) return [];

  const start = new Date(fromDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(toDate);
  end.setHours(0, 0, 0, 0);

  const map = new Map();
  for (let t = start.getTime(); t <= end.getTime(); t += 24 * 60 * 60 * 1000) {
    const key = dayKey(new Date(t).toISOString());
    if (!key) continue;
    map.set(key, { day: key, problemomer: 0, calculator: 0, pdf: 0, logins: 0 });
  }

  for (const e of events) {
    const key = dayKey(e.at);
    if (!key) continue;
    if (!map.has(key)) {
      map.set(key, { day: key, problemomer: 0, calculator: 0, pdf: 0, logins: 0 });
    }
    const row = map.get(key);
    if (e.tool === 'problemomer' && e.action === 'result') row.problemomer += 1;
    if (e.tool === 'calculator' && e.action === 'calc_done') row.calculator += 1;
    if (e.action === 'pdf') row.pdf += 1;
    if (e.action === 'login') row.logins += 1;
  }

  return [...map.values()].sort((a, b) => (a.day < b.day ? -1 : 1));
}

function previousWindow(from, to) {
  if (!from || !to) return null;
  const fromMs = Date.parse(from);
  const toMs = Date.parse(to);
  if (Number.isNaN(fromMs) || Number.isNaN(toMs) || toMs <= fromMs) return null;
  const len = toMs - fromMs;
  return {
    from: new Date(fromMs - len).toISOString(),
    to: new Date(fromMs).toISOString(),
  };
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
      partnerMap.set(orgKey, emptyPartnerRow(e.orgId, e.companyName || e.login));
    }
    const prow = partnerMap.get(orgKey);
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

    if (e.role === 'executor') {
      const exKey = e.userId || e.login;
      if (!executorMap.has(exKey)) {
        executorMap.set(exKey, {
          userId: e.userId,
          login: e.login,
          displayName: e.login,
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

  const kpi = computeKpi(events, {
    partnerCount: opts.partnerCount,
    executorCount: opts.executorCount,
    activeExecutors,
  });

  let kpiPrev = null;
  const prev = previousWindow(opts.from, opts.to);
  if (prev) {
    const prevEvents = filterAnalyticsEvents(allEvents, {
      from: prev.from,
      to: prev.to,
      orgId: opts.orgId,
    });
    kpiPrev = computeKpi(prevEvents, {
      partnerCount: opts.partnerCount,
      executorCount: opts.executorCount,
      activeExecutors: 0,
    });
  }

  return {
    source: opts.source || 'api',
    from: opts.from || null,
    to: opts.to || null,
    kpi,
    kpiPrev,
    funnel: computeFunnel(events),
    series: computeSeries(events, opts.from || null, opts.to || null),
    breakdowns: computeBreakdowns(events),
    volume: computeVolume(events),
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
  const raw =
    event.url ||
    event.path ||
    event.requestContext?.http?.path ||
    '/';
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

async function requirePartner(event) {
  const token = getAuth(event);
  if (!token) throw Object.assign(new Error('Unauthorized'), { status: 401 });
  const { payload } = await jwtVerify(token, JWT_SECRET());
  const partners = await loadPartners();
  const row = partners.find((p) => p.id === payload.sub || p.login === payload.login);
  if (!row) throw Object.assign(new Error('Unauthorized'), { status: 401 });
  return row;
}

function normalizeIncomingEvent(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const action = String(raw.action || '');
  const tool = String(raw.tool || '');
  if (!action || !tool) return null;
  return {
    id: String(raw.id || `ae_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`),
    at: String(raw.at || new Date().toISOString()),
    orgId: raw.orgId ?? null,
    userId: raw.userId ?? null,
    login: String(raw.login || 'unknown'),
    role: String(raw.role || 'partner'),
    companyName: String(raw.companyName || ''),
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
    if (method === 'POST' && path.endsWith('/auth/login')) {
      const { login, password } = getBody(event);
      const partners = await loadPartners();
      const row = partners.find((p) => p.login === String(login || '').trim());
      if (!row || !bcrypt.compareSync(String(password || ''), row.passwordHash)) {
        return json(401, { message: 'Неверный логин или пароль' });
      }
      const token = await new SignJWT({ login: row.login })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(row.id)
        .setIssuedAt()
        .setExpirationTime('12h')
        .sign(JWT_SECRET());
      return json(200, { token, partner: publicPartner(row) });
    }

    if (method === 'GET' && path.endsWith('/auth/me')) {
      const row = await requirePartner(event);
      return json(200, { partner: publicPartner(row) });
    }

    if (method === 'POST' && path.endsWith('/auth/logout')) {
      return json(200, { ok: true });
    }

    if (method === 'PATCH' && path.endsWith('/partner/profile')) {
      const row = await requirePartner(event);
      const patch = getBody(event);
      const partners = await loadPartners();
      const idx = partners.findIndex((p) => p.id === row.id);
      if (idx < 0) return json(404, { message: 'Not found' });
      const next = { ...partners[idx] };
      if ('companyName' in patch) next.companyName = String(patch.companyName || '');
      if ('panelPriceRub' in patch) {
        next.panelPriceRub = patch.panelPriceRub == null ? null : Number(patch.panelPriceRub);
      }
      if ('pricePerM2' in patch) {
        next.pricePerM2 = patch.pricePerM2 == null ? null : Number(patch.pricePerM2);
      }
      if ('installPricePerM2' in patch) {
        next.installPricePerM2 =
          patch.installPricePerM2 == null ? null : Number(patch.installPricePerM2);
      }
      if ('dowelsPerPanel' in patch) {
        next.dowelsPerPanel = Math.max(1, Number(patch.dowelsPerPanel) || 2);
      }
      if ('dowelPriceRub' in patch) {
        next.dowelPriceRub = patch.dowelPriceRub == null ? null : Number(patch.dowelPriceRub);
      }
      partners[idx] = next;
      await savePartners(partners);
      return json(200, { partner: publicPartner(next) });
    }

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
      const role = String(header(event, 'X-Analytics-Role') || 'partner');
      const query = getQuery(event);
      let orgId = query.orgId || header(event, 'X-Analytics-Org') || null;

      if (role === 'admin') {
        const key = header(event, 'X-Analytics-Key');
        if (key !== ANALYTICS_ADMIN_KEY()) {
          return json(403, { message: 'Admin key required' });
        }
      } else {
        // Partner slice: require orgId (trusted internal portal)
        if (!orgId) return json(400, { message: 'orgId required' });
      }

      const events = await loadEvents();
      const dash = aggregateAnalyticsDashboard(events, {
        source: 'api',
        from: query.from || null,
        to: query.to || null,
        orgId: role === 'admin' && !query.orgId ? null : orgId,
      });
      return json(200, dash);
    }

    if (method === 'GET' && (path.endsWith('/health') || path === '/' || path.endsWith('/'))) {
      return json(200, { ok: true, service: 'multiframe-partner-api' });
    }

    return json(404, { message: `Not found: ${method} ${path}` });
  } catch (e) {
    const status = e.status || 500;
    return json(status, { message: e.message || 'Server error' });
  }
}
