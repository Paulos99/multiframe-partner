/**
 * Yandex Cloud Function HTTP handler — partner auth + profile.
 * Storage: Object Storage JSON (PARTNERS_BUCKET / PARTNERS_KEY) or in-memory seed.
 */
import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';

const JWT_SECRET = () => new TextEncoder().encode(process.env.JWT_SECRET || 'dev-secret-change-me');
const CORS = {
  'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
};

/** @typedef {{ id: string, login: string, passwordHash: string, companyName: string, panelPriceRub: number|null, pricePerM2: number|null, installPricePerM2: number|null, dowelsPerPanel: number, dowelPriceRub: number|null }} PartnerRow */

/** @type {PartnerRow[] | null} */
let memoryPartners = null;

function publicPartner(row) {
  const { passwordHash: _, ...rest } = row;
  return rest;
}

function defaultSeed() {
  // password: partner1 / demo1234 — change in production via PARTNERS_SEED
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

async function loadPartners() {
  if (memoryPartners) return memoryPartners;
  const bucket = process.env.PARTNERS_BUCKET;
  const key = process.env.PARTNERS_KEY || 'partners.json';
  if (bucket) {
    try {
      const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3');
      const client = new S3Client({
        region: process.env.YC_REGION || 'ru-central1',
        endpoint: 'https://storage.yandexcloud.net',
        credentials: {
          accessKeyId: process.env.YC_ACCESS_KEY_ID,
          secretAccessKey: process.env.YC_SECRET_ACCESS_KEY,
        },
      });
      const out = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      const body = await out.Body.transformToString();
      memoryPartners = JSON.parse(body);
      return memoryPartners;
    } catch (e) {
      console.warn('S3 load failed, using seed', e?.message || e);
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
  const client = new S3Client({
    region: process.env.YC_REGION || 'ru-central1',
    endpoint: 'https://storage.yandexcloud.net',
    credentials: {
      accessKeyId: process.env.YC_ACCESS_KEY_ID,
      secretAccessKey: process.env.YC_SECRET_ACCESS_KEY,
    },
  });
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: JSON.stringify(list, null, 2),
      ContentType: 'application/json',
    }),
  );
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
    event.requestContext?.identity?.sourceIp ||
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

async function requirePartner(event) {
  const token = getAuth(event);
  if (!token) throw Object.assign(new Error('Unauthorized'), { status: 401 });
  const { payload } = await jwtVerify(token, JWT_SECRET());
  const partners = await loadPartners();
  const row = partners.find((p) => p.id === payload.sub || p.login === payload.login);
  if (!row) throw Object.assign(new Error('Unauthorized'), { status: 401 });
  return row;
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

    if (method === 'GET' && (path.endsWith('/health') || path === '/' || path.endsWith('/'))) {
      return json(200, { ok: true, service: 'multiframe-partner-api' });
    }

    return json(404, { message: `Not found: ${method} ${path}` });
  } catch (e) {
    const status = e.status || 500;
    return json(status, { message: e.message || 'Server error' });
  }
}