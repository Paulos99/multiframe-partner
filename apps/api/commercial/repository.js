/**
 * Выбор хранилища. В Cloud Function с бакетом без YDB коммерческие записи не пишутся.
 * Локальные тесты подменяют репозиторий моком.
 */

import { createMemoryRepository } from './memoryRepository.js';
import { httpError } from '../../../packages/shared/commercialRules.js';

/** @type {null | { transaction: Function, kind?: string }} */
let override = null;
/** @type {null | { transaction: Function, kind?: string }} */
let memorySingleton = null;
/** @type {null | Promise<any>} */
let ydbSingleton = null;

export function setCommercialRepositoryForTests(repo) {
  override = repo;
  ydbSingleton = null;
}

export function resetCommercialRepositoryForTests() {
  override = createMemoryRepository();
  memorySingleton = null;
  ydbSingleton = null;
}

export function clearCommercialRepositoryForTests() {
  override = null;
  memorySingleton = null;
  ydbSingleton = null;
}

export async function getCommercialRepository() {
  if (override) return override;
  if (process.env.YDB_ENDPOINT && process.env.YDB_DATABASE) {
    if (!ydbSingleton) {
      const { openYdbRepository } = await import('./ydbRepository.js');
      ydbSingleton = openYdbRepository(process.env).catch((error) => {
        ydbSingleton = null;
        throw error;
      });
    }
    return ydbSingleton;
  }
  if (process.env.PARTNERS_BUCKET) {
    throw httpError(503, 'Коммерческое хранилище YDB не настроено');
  }
  if (!memorySingleton) memorySingleton = createMemoryRepository();
  return memorySingleton;
}
