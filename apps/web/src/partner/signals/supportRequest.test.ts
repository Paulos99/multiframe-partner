import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SUPPORT_CASES_STORAGE_KEY,
  SupportPayloadError,
  assertSupportRequestSafe,
  loadLocalSupportCases,
  saveLocalSupportCase,
} from './supportRequest';

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

const user = { id: 'u1', orgId: 'o1', role: 'sales' };

test('rejects clientPhone and clientName', () => {
  assert.throws(
    () => assertSupportRequestSafe({ category: 'sales', clientPhone: '+7 900' }),
    SupportPayloadError,
  );
  assert.throws(
    () => assertSupportRequestSafe({ category: 'sales', clientName: 'Иван' }),
    SupportPayloadError,
  );
  assert.doesNotThrow(() => assertSupportRequestSafe({ category: 'tech_error', module: 'calculator' }));
});

test('saves case locally without PII and keeps order', () => {
  const storage = memoryStorage();
  const a = saveLocalSupportCase({ category: 'sales' }, user, storage, () => '2026-01-01T00:00:00Z', () => 'a');
  saveLocalSupportCase({ category: 'install', module: 'crew' }, user, storage, () => '2026-01-02T00:00:00Z', () => 'b');
  const list = loadLocalSupportCases(storage);
  assert.equal(list.length, 2);
  assert.equal(list[0].id, 'b');
  assert.equal(a.status, 'open');
  assert.ok(storage.getItem(SUPPORT_CASES_STORAGE_KEY));
  assert.ok(!/clientName|clientPhone/.test(storage.getItem(SUPPORT_CASES_STORAGE_KEY)!));
});

test('local save refuses payload with PII and stores nothing', () => {
  const storage = memoryStorage();
  assert.throws(() =>
    saveLocalSupportCase({ category: 'other', clientPhone: '1' } as never, user, storage),
  );
  assert.equal(loadLocalSupportCases(storage).length, 0);
});

test('invalid category rejected', () => {
  assert.throws(() => assertSupportRequestSafe({ category: 'bogus' }));
});
