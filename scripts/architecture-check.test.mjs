import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { checkBoundaries, collectSources, importSpecifiers } from './architecture-check.mjs';

const check = (filePath, source) => checkBoundaries([{ path: filePath, source }]);

test('интерфейс не импортирует API: статический, динамический и типовой импорт', () => {
  assert.equal(check('apps/web/src/a.ts', "import { x } from '../../api/index.js';").length, 1);
  assert.equal(check('apps/web/src/partner/a.ts', "import type { M } from '../../../api/materialsLib.js';").length, 1);
  assert.equal(check('apps/web/src/a.ts', "const m = await import('../../api/x.js');").length, 1);
  assert.equal(check('apps/web/src/a.ts', "type T = import('../../api/x.js').T;").length, 1);
  assert.equal(check('apps/web/src/a.ts', "import '../../api/x.js';").length, 1);
  assert.equal(check('apps/web/src/a.ts', "import {\n  a,\n} from '../../api/x.js';").length, 1);
});

test('API не импортирует интерфейс', () => {
  assert.equal(check('apps/api/index.js', "import x from '../web/src/a.ts';").length, 1);
  assert.equal(check('apps/api/scripts/s.mjs', "import x from '../../web/src/a.ts';").length, 1);
});

test('общий код не импортирует приложения', () => {
  assert.equal(check('packages/shared/a.js', "import x from '../../apps/api/index.js';").length, 1);
  assert.equal(check('packages/shared/a.ts', "import x from '../../apps/web/src/a.ts';").length, 1);
});

test('допустимые импорты проходят', () => {
  assert.deepEqual(check('apps/web/src/a.ts', "import { x } from '../../../packages/shared/partner';"), []);
  assert.deepEqual(check('apps/api/a.js', "import { x } from '../../packages/shared/schemas.js';"), []);
  assert.deepEqual(check('apps/api/a.js', "import { z } from 'zod'; import fs from 'node:fs';"), []);
  assert.deepEqual(check('apps/web/src/a.ts', "import { a } from './b'; import React from 'react';"), []);
  assert.deepEqual(check('packages/shared/a.js', "import { a } from './b.js';"), []);
});

test('комментарии не считаются импортами, e2e-стенд интерфейса исключён', () => {
  assert.deepEqual(check('apps/web/src/a.ts', "// import x from '../../api/x.js'\n * from '../../api/y.js'"), []);
  assert.deepEqual(check('apps/web/e2e/api-server.mjs', "await import('../../api/index.js');"), []);
});

test('importSpecifiers находит все виды импорта', () => {
  assert.deepEqual(
    importSpecifiers("import a from './a';\nimport './b';\nconst c = require('./c');\nawait import('./d');"),
    ['./a', './b', './c', './d'],
  );
});

test('в репозитории нарушений нет', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const files = collectSources(root);
  assert.ok(files.length > 100, 'ожидались исходники веб-части и API');
  assert.deepEqual(checkBoundaries(files), []);
});
