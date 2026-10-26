/**
 * Репозиторий YDB. Endpoint и database только из env.
 * В лог не пишутся адрес, путь базы, токен и ключ сервисного аккаунта.
 * Схему этот модуль не создаёт.
 */

import { httpError } from '../../../packages/shared/commercialRules.js';
import { commercialSql, tableRef } from './sql.js';
import { createYdbAuthService } from './ydbAuth.js';

function asNumber(value) {
  if (value == null) return 0;
  if (typeof value === 'object' && typeof value.toNumber === 'function') return value.toNumber();
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toRow(native) {
  if (!native) return null;
  let payload = native.payload;
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload);
    } catch {
      payload = {};
    }
  }
  return {
    orgId: native.orgId,
    kind: native.kind,
    id: native.id,
    projectId: native.projectId || '',
    parentId: native.parentId || '',
    version: asNumber(native.version),
    updatedAt: native.updatedAt || '',
    payload,
  };
}

function extractRows(result, readRows) {
  if (Array.isArray(result?.rows)) return result.rows.map(toRow).filter(Boolean);
  const set = result?.resultSets?.[0];
  if (!set || !readRows) return [];
  return readRows(set).map(toRow).filter(Boolean);
}

function bind(typed, spec) {
  const out = {};
  for (const [name, value] of Object.entries(spec)) {
    out[name] = typeof value === 'number' ? typed.uint64(value) : typed.utf8(value == null ? '' : String(value));
  }
  return out;
}

export function createYdbRepository({ withSession, database, typed, readRows }) {
  const sql = commercialSql(tableRef(database));

  async function transaction(fn) {
    return withSession(async (session) => {
      const meta = await session.beginTransaction({ serializableReadWrite: {} });
      const txId = meta.id;
      let committed = false;
      const exec = async (text, spec) =>
        session.executeQuery(text, bind(typed, spec), { txId });
      const api = makeApi(exec);
      try {
        const result = await fn(api);
        await session.commitTransaction({ txId });
        committed = true;
        return result;
      } finally {
        if (!committed) {
          try {
            await session.rollbackTransaction({ txId });
          } catch {
            /* транзакция уже закрыта */
          }
        }
      }
    });
  }

  function makeApi(exec) {
    async function get(orgId, kind, id) {
      const result = await exec(sql.get, { $org_id: orgId, $kind: kind, $id: id });
      return extractRows(result, readRows)[0] || null;
    }
    return {
      get,
      async list(filter) {
        if (!filter.orgId || !filter.kind) throw httpError(400, 'Список требует orgId и kind');
        if (filter.projectId) {
          return extractRows(await exec(sql.listByProject, {
            $org_id: filter.orgId,
            $project_id: filter.projectId,
            $kind: filter.kind,
          }), readRows);
        }
        if (filter.parentId) {
          return extractRows(await exec(sql.listByParent, {
            $org_id: filter.orgId,
            $parent_id: filter.parentId,
            $kind: filter.kind,
          }), readRows);
        }
        return extractRows(await exec(sql.listByOrgKind, {
          $org_id: filter.orgId,
          $kind: filter.kind,
        }), readRows);
      },
      async insert(row) {
        await exec(sql.insert, {
          $org_id: row.orgId,
          $kind: row.kind,
          $id: row.id,
          $project_id: row.projectId || '',
          $parent_id: row.parentId || '',
          $version: 1,
          $payload: JSON.stringify(row.payload ?? {}),
          $updated_at: row.updatedAt || row.payload?.updatedAt || '',
        });
        return get(row.orgId, row.kind, row.id);
      },
      async update(row, expected) {
        const next = Number(expected) + 1;
        await exec(sql.update, {
          $org_id: row.orgId,
          $kind: row.kind,
          $id: row.id,
          $project_id: row.projectId || '',
          $parent_id: row.parentId || '',
          $expected: Number(expected),
          $version: next,
          $payload: JSON.stringify(row.payload ?? {}),
          $updated_at: row.updatedAt || row.payload?.updatedAt || '',
        });
        const got = await get(row.orgId, row.kind, row.id);
        if (!got || got.version !== next) throw httpError(409, 'Конфликт версии', { current: got });
        return got;
      },
    };
  }

  return { transaction, kind: 'ydb' };
}

function connectionString(endpoint, database) {
  const base = String(endpoint || '').replace(/\/$/, '');
  const path = String(database || '');
  if (!base || !path) return '';
  if (base.endsWith(path)) return base;
  return `${base}${path.startsWith('/') ? '' : '/'}${path}`;
}

const silentLogger = {
  fatal() {},
  error() {},
  warn() {},
  info() {},
  debug() {},
  trace() {},
};

export async function openYdbRepository(env = process.env) {
  const endpoint = env.YDB_ENDPOINT;
  const database = env.YDB_DATABASE;
  if (!endpoint || !database) {
    throw httpError(503, 'Коммерческое хранилище YDB не настроено');
  }
  const sdkModule = await import('ydb-sdk');
  const sdk = sdkModule.default ?? sdkModule;
  const driver = new sdk.Driver({
    connectionString: connectionString(endpoint, database),
    authService: createYdbAuthService(sdk, env),
    logger: silentLogger,
  });
  const ready = await driver.ready(10000);
  if (!ready) {
    try {
      await driver.destroy();
    } catch {
      /* нет соединения */
    }
    throw httpError(503, 'YDB не отвечает');
  }
  return createYdbRepository({
    database,
    typed: sdk.TypedValues,
    readRows: (set) => sdk.TypedData.createNativeObjects(set),
    withSession: (fn) => driver.tableClient.withSession(fn),
  });
}

export function connectionStringForTests(endpoint, database) {
  return connectionString(endpoint, database);
}
