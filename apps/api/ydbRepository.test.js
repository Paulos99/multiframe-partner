import assert from 'node:assert/strict';
import test from 'node:test';
import { commercialSql, tableRef } from './commercial/sql.js';
import { connectionStringForTests, createYdbRepository } from './commercial/ydbRepository.js';

test('строка подключения собирается из частей и не обязана лежать в репозитории', () => {
  const value = connectionStringForTests('grpcs://ydb.example:2135', '/ru/test/db');
  assert.equal(value, 'grpcs://ydb.example:2135/ru/test/db');
  assert.equal(connectionStringForTests(value, '/ru/test/db'), value);
});

test('обновление строки требует прежнюю version', () => {
  const sql = commercialSql(tableRef('/ru/test/db'));
  assert.match(sql.update, /version = \$expected/);
  assert.match(sql.update, /commercial_records/);
  assert.doesNotMatch(sql.update, /If-Match/);
});

test('репозиторий YDB отклоняет чужую version и откатывает транзакцию', async () => {
  const rows = [];
  let rollbacks = 0;
  const typed = {
    uint64: (n) => ({ n: Number(n) }),
    utf8: (s) => ({ s: String(s) }),
  };
  const unwrap = (value) => (value && typeof value === 'object' && ('n' in value || 's' in value) ? value.n ?? value.s : value);
  const repo = createYdbRepository({
    database: '/ru/test/db',
    typed,
    readRows: null,
    withSession: async (fn) => {
      const snapshot = rows.map((row) => ({ ...row }));
      const session = {
        async beginTransaction() {
          return { id: 'tx' };
        },
        async commitTransaction() {},
        async rollbackTransaction() {
          rollbacks += 1;
          rows.splice(0, rows.length, ...snapshot);
        },
        async executeQuery(text, params) {
          const p = Object.fromEntries(Object.entries(params).map(([key, value]) => [key, unwrap(value)]));
          if (text.includes('INSERT INTO')) {
            rows.push({
              orgId: p.$org_id,
              kind: p.$kind,
              id: p.$id,
              projectId: p.$project_id,
              parentId: p.$parent_id,
              version: Number(p.$version),
              payload: p.$payload,
              updatedAt: p.$updated_at,
            });
            return { rows: [] };
          }
          if (text.includes('version = $expected')) {
            const row = rows.find((item) => item.orgId === p.$org_id && item.kind === p.$kind && item.id === p.$id);
            if (row && Number(row.version) === Number(p.$expected)) {
              row.version = Number(p.$version);
              row.payload = p.$payload;
              row.projectId = p.$project_id;
              row.parentId = p.$parent_id;
              row.updatedAt = p.$updated_at;
            }
            return { rows: [] };
          }
          const found = rows.filter((item) => {
            if (p.$id && item.id !== p.$id) return false;
            if (p.$org_id && item.orgId !== p.$org_id) return false;
            if (p.$kind && item.kind !== p.$kind) return false;
            return true;
          });
          return { rows: found };
        },
      };
      return fn(session);
    },
  });

  await repo.transaction(async (tx) => {
    await tx.insert({
      orgId: 'o',
      kind: 'deal',
      id: 'd',
      projectId: 'p',
      parentId: 'p',
      payload: { name: 'a' },
      updatedAt: 't',
    });
  });
  await assert.rejects(
    () => repo.transaction(async (tx) => {
      await tx.update({
        orgId: 'o',
        kind: 'deal',
        id: 'd',
        projectId: 'p',
        parentId: 'p',
        payload: { name: 'b' },
        updatedAt: 't2',
      }, 7);
    }),
    (error) => error.status === 409,
  );
  assert.equal(rollbacks, 1);
  const left = await repo.transaction(async (tx) => tx.get('o', 'deal', 'd'));
  assert.equal(left.version, 1);
  assert.equal(left.payload.name, 'a');
});
