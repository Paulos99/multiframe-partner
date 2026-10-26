import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

test('скрипт схемы без --apply не подключается к YDB и не печатает адрес', () => {
  const result = spawnSync(process.execPath, ['scripts/apply-ydb-schema.mjs'], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    encoding: 'utf8',
    env: {
      ...process.env,
      YDB_ENDPOINT: 'grpcs://ydb.example:2135',
      YDB_DATABASE: '/ru/hidden/database',
    },
  });
  assert.equal(result.status, 0, result.stderr);
  const output = `${result.stdout}\n${result.stderr}`;
  assert.match(output, /не применялась/);
  assert.equal(output.includes('grpcs://'), false);
  assert.equal(output.includes('/ru/hidden/database'), false);
});
