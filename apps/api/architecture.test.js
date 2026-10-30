import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { checkBoundaries, collectSources } from '../../scripts/architecture-check.mjs';

// Запускается в CI вместе с тестами API: границы apps/web, apps/api и packages/shared (см. AGENTS.md).
test('границы архитектуры: web не импортирует api, api не импортирует web, shared не импортирует приложения', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  assert.deepEqual(checkBoundaries(collectSources(root)), []);
});
