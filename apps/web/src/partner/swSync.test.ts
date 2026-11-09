import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { DB_STORES, DB_VERSION } from './offlineDb';

const sw = readFileSync(new URL('../../public/sw-sync.js', import.meta.url), 'utf8');

test('service worker открывает ту же версию базы, что и приложение', () => {
  const match = sw.match(/const DB_VERSION = (\d+);/);
  assert.ok(match, 'в sw-sync.js есть DB_VERSION');
  assert.equal(Number(match![1]), DB_VERSION);
});

test('service worker знает все хранилища базы', () => {
  for (const [name, keyPath] of DB_STORES) {
    assert.ok(sw.includes(`['${name}', '${keyPath}']`), `хранилище ${name} в sw-sync.js`);
  }
});

test('запись с конфликтом этапа не отправляется из service worker, 409 помечает конфликт', () => {
  assert.match(sw, /!op\.conflict/);
  assert.match(sw, /stage_conflict/);
  assert.match(sw, /baseStatus/);
});
