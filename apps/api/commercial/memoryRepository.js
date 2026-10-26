/**
 * Мок репозитория коммерческих записей. Тесты и локальный процесс без YDB.
 * Это не файл и не бакет: данные живут только в памяти процесса.
 */

import { httpError } from '../../../packages/shared/commercialRules.js';

export function createMemoryRepository() {
  /** @type {Array<Record<string, any>>} */
  let rows = [];
  let queue = Promise.resolve();

  function transaction(fn) {
    const run = queue.then(async () => {
      const draft = rows.map((row) => ({ ...row, payload: structuredClone(row.payload) }));
      const result = await fn(api(draft));
      rows = draft;
      return result;
    });
    queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  function api(draft) {
    function keyEq(row, orgId, kind, id) {
      return row.orgId === orgId && row.kind === kind && row.id === id;
    }
    return {
      async get(orgId, kind, id) {
        return draft.find((row) => keyEq(row, orgId, kind, id)) || null;
      },
      async list(filter) {
        return draft.filter((row) => {
          if (filter.kind && row.kind !== filter.kind) return false;
          if (filter.orgId && row.orgId !== filter.orgId) return false;
          if (filter.projectId && row.projectId !== filter.projectId) return false;
          if (filter.parentId && row.parentId !== filter.parentId) return false;
          return true;
        });
      },
      async insert(row) {
        if (draft.some((item) => keyEq(item, row.orgId, row.kind, row.id))) {
          throw httpError(409, 'Запись уже существует');
        }
        draft.push({
          orgId: row.orgId,
          kind: row.kind,
          id: row.id,
          projectId: row.projectId || '',
          parentId: row.parentId || '',
          version: 1,
          updatedAt: row.updatedAt || row.payload?.updatedAt || '',
          payload: row.payload,
        });
        return draft[draft.length - 1];
      },
      async update(row, expected) {
        const index = draft.findIndex((item) => keyEq(item, row.orgId, row.kind, row.id));
        if (index < 0) throw httpError(404, 'Не найдено');
        if (Number(draft[index].version) !== Number(expected)) {
          throw httpError(409, 'Конфликт версии', { current: draft[index] });
        }
        const next = {
          ...draft[index],
          projectId: row.projectId ?? draft[index].projectId,
          parentId: row.parentId ?? draft[index].parentId,
          updatedAt: row.updatedAt || row.payload?.updatedAt || draft[index].updatedAt,
          payload: row.payload,
          version: Number(expected) + 1,
        };
        draft[index] = next;
        return next;
      },
    };
  }

  return { transaction, kind: 'memory' };
}
