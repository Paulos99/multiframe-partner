import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import {
  clearYdbAuthForTests,
  createYdbAuthService,
  noteInvocationIamToken,
} from './commercial/ydbAuth.js';

const require = createRequire(import.meta.url);
const MISSING_MODULE = '@yandex-cloud/nodejs-sdk/dist/token-service/metadata-token-service';

async function loadSdk() {
  const mod = await import('ydb-sdk');
  return mod.default ?? mod;
}

function ticketOf(metadata) {
  const value = metadata.get('x-ydb-auth-ticket')[0];
  return Buffer.isBuffer(value) ? value.toString('utf8') : String(value);
}

function okMetadata(token, expiresIn = 3600) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ access_token: token, expires_in: expiresIn, token_type: 'Bearer' }),
  };
}

test('в архиве нет peer-модуля метаданных, а свой TokenAuthService всё равно выдаёт билет', async () => {
  assert.throws(
    () => require.resolve(MISSING_MODULE),
    (error) => error.code === 'MODULE_NOT_FOUND' && String(error.message).includes(MISSING_MODULE),
  );
  const sdk = await loadSdk();
  await assert.rejects(
    () => new sdk.MetadataAuthService().getAuthMetadata(),
    (error) => String(error.message).includes(MISSING_MODULE) && String(error.message).includes('Cannot find module'),
  );

  const auth = createYdbAuthService(sdk, {}, {
    readContextToken: () => null,
    fetchImpl: async () => okMetadata('iam-from-metadata'),
  });
  const metadata = await auth.getAuthMetadata();
  assert.equal(ticketOf(metadata), 'iam-from-metadata');
});

test('функция не конструирует MetadataAuthService', () => {
  const repo = readFileSync(new URL('./commercial/ydbRepository.js', import.meta.url), 'utf8');
  const auth = readFileSync(new URL('./commercial/ydbAuth.js', import.meta.url), 'utf8');
  const index = readFileSync(new URL('./index.js', import.meta.url), 'utf8');
  assert.equal(repo.includes('MetadataAuthService'), false);
  assert.equal(repo.includes('metadata-token-service'), false);
  assert.equal(auth.includes('metadata-token-service'), false);
  assert.match(repo, /createYdbAuthService\(sdk, env\)/);
  assert.match(index, /noteInvocationIamToken\(context\)/);
});

test('контекст вызова и кэш метаданных', async () => {
  clearYdbAuthForTests();
  const sdk = await loadSdk();
  let clock = 1_000_000_000;
  const now = () => clock;
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return okMetadata(calls === 1 ? 'iam-fresh' : 'iam-refreshed', 3600);
  };
  try {
    noteInvocationIamToken({ token: { access_token: 'iam-from-context', expires_in: 3600 } }, now);
    const fresh = createYdbAuthService(sdk, {}, { now, fetchImpl });
    assert.equal(ticketOf(await fresh.getAuthMetadata()), 'iam-from-context');
    assert.equal(calls, 0);

    noteInvocationIamToken({ token: { access_token: 'iam-stale', expires_in: 30 } }, now);
    const expired = createYdbAuthService(sdk, {}, { now, fetchImpl });
    assert.equal(ticketOf(await expired.getAuthMetadata()), 'iam-fresh');
    assert.equal(ticketOf(await expired.getAuthMetadata()), 'iam-fresh');
    assert.equal(calls, 1);
    clock += 3600 * 1000;
    assert.equal(ticketOf(await expired.getAuthMetadata()), 'iam-refreshed');
    assert.equal(calls, 2);
  } finally {
    clearYdbAuthForTests();
  }
});

test('явный YDB_ACCESS_TOKEN_CREDENTIALS не ходит в метаданные', async () => {
  const sdk = await loadSdk();
  let calls = 0;
  const auth = createYdbAuthService(sdk, { YDB_ACCESS_TOKEN_CREDENTIALS: 'iam-static' }, {
    fetchImpl: async () => {
      calls += 1;
      return okMetadata('iam-other');
    },
  });
  assert.equal(ticketOf(await auth.getAuthMetadata()), 'iam-static');
  assert.equal(calls, 0);
});

test('ошибка метаданных не содержит токен', async () => {
  const sdk = await loadSdk();
  const secret = 'iam-must-not-leak';
  const auth = createYdbAuthService(sdk, {}, {
    readContextToken: () => null,
    fetchImpl: async () => ({
      ok: false,
      status: 503,
      json: async () => ({ access_token: secret }),
    }),
  });
  await assert.rejects(
    () => auth.getAuthMetadata(),
    (error) => {
      assert.equal(String(error.message).includes(secret), false);
      assert.match(error.message, /HTTP 503/);
      return true;
    },
  );
});
