/**
 * IAM для YDB в Cloud Function.
 * ydb-sdk MetadataAuthService тянет необязательный @yandex-cloud/nodejs-sdk,
 * этого модуля в архиве функции нет. Токен берём сами и отдаём в TokenAuthService:
 * сначала из контекста вызова, иначе из сервиса метаданных.
 * В сообщениях об ошибках нет токена, адреса базы и ключа.
 */

const METADATA_URL = 'http://169.254.169.254/computeMetadata/v1/instance/service-accounts/default/token';
const SKEW_MS = 60_000;
const METADATA_TIMEOUT_MS = 5_000;

/** @type {null | { token: string, expiresAt: number }} */
let invocationToken = null;

export function noteInvocationIamToken(context, now = Date.now) {
  if (context == null) return;
  const raw = context.token;
  const access = typeof raw === 'string' ? raw : raw?.access_token;
  if (typeof access !== 'string' || access.trim() === '') {
    invocationToken = null;
    return;
  }
  const expiresIn = Number(typeof raw === 'object' && raw ? raw.expires_in : NaN);
  const ttl = Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600;
  invocationToken = { token: access.trim(), expiresAt: now() + ttl * 1000 };
}

export function clearYdbAuthForTests() {
  invocationToken = null;
}

function currentInvocationToken(now) {
  if (!invocationToken) return null;
  if (invocationToken.expiresAt - SKEW_MS <= now()) return null;
  return invocationToken.token;
}

async function fetchMetadataIamToken(fetchImpl, now) {
  const signal = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
    ? AbortSignal.timeout(METADATA_TIMEOUT_MS)
    : undefined;
  let response;
  try {
    response = await fetchImpl(METADATA_URL, {
      headers: { 'Metadata-Flavor': 'Google' },
      signal,
    });
  } catch {
    throw new Error('IAM token from metadata failed: network');
  }
  if (!response || response.ok !== true) {
    const status = response && Number.isFinite(response.status) ? response.status : 0;
    throw new Error(`IAM token from metadata failed: HTTP ${status}`);
  }
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error('IAM token from metadata failed: bad response');
  }
  const token = body && typeof body.access_token === 'string' ? body.access_token.trim() : '';
  if (!token) throw new Error('IAM token from metadata failed: empty token');
  const expiresIn = Number(body.expires_in);
  const ttl = Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600;
  return { token, expiresAt: now() + ttl * 1000 };
}

export function createYdbAuthService(sdk, env = process.env, options = {}) {
  if (env && env.YDB_SERVICE_ACCOUNT_KEY_FILE_CREDENTIALS) {
    return new sdk.IamAuthService(
      sdk.getSACredentialsFromJson(env.YDB_SERVICE_ACCOUNT_KEY_FILE_CREDENTIALS),
    );
  }
  if (env && env.YDB_ACCESS_TOKEN_CREDENTIALS) {
    return new sdk.TokenAuthService(env.YDB_ACCESS_TOKEN_CREDENTIALS);
  }

  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const now = options.now || Date.now;
  const readContextToken = options.readContextToken || (() => currentInvocationToken(now));
  let cached = null;
  let pending = null;

  async function tokenFromMetadata() {
    const clock = now();
    if (cached && cached.expiresAt - SKEW_MS > clock) return cached.token;
    if (!pending) {
      pending = fetchMetadataIamToken(fetchImpl, now)
        .then((entry) => {
          cached = entry;
          return entry.token;
        })
        .finally(() => {
          pending = null;
        });
    }
    return pending;
  }

  return {
    async getAuthMetadata() {
      const fromContext = readContextToken();
      const token = fromContext || await tokenFromMetadata();
      if (typeof token !== 'string' || token === '') {
        throw new Error('IAM token missing');
      }
      return new sdk.TokenAuthService(token).getAuthMetadata();
    },
  };
}
