import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { documentsForRole as serverDocuments, findVisibleDocument } from './documentAccess.js';

// Клиентский отбор лежит в TypeScript. Берём тело функции как есть, без загрузчика типов.
const partnerSource = readFileSync(new URL('../../packages/shared/partner.ts', import.meta.url), 'utf8');

function functionBody(name) {
  const start = partnerSource.indexOf(`export function ${name}`);
  const brace = partnerSource.indexOf('{', start);
  assert.ok(start >= 0 && brace > start, name);
  let depth = 0;
  for (let i = brace; i < partnerSource.length; i += 1) {
    if (partnerSource[i] === '{') depth += 1;
    else if (partnerSource[i] === '}') {
      depth -= 1;
      if (depth === 0) return partnerSource.slice(brace, i + 1);
    }
  }
  throw new Error(`Не закрыта функция ${name}`);
}

const clientDocuments = runInNewContext(
  `function canSeePrices(role) ${functionBody('canSeePrices')}
   function documentsForRole(docs, role) ${functionBody('documentsForRole')}
   documentsForRole`,
);

const estimate = {
  id: 'priced',
  kind: 'estimate',
  createdAt: '2026-10-18T10:00:00Z',
  filename: 'estimate.pdf',
  totalCost: 180000,
  panelsCost: 120000,
  installCost: 40000,
  dowelsCost: 20000,
  storageKey: 'docs/org/obj/priced.pdf',
  pdfBase64: 'priced-bytes',
};
const spec = {
  id: 'unpriced',
  kind: 'spec',
  createdAt: '2026-10-18T09:00:00Z',
  filename: 'spec.pdf',
  totalCost: 180000,
  panelsCost: 120000,
  storageKey: 'docs/org/obj/unpriced.pdf',
  pdfBase64: 'spec-bytes',
};
const priceKeys = ['totalCost', 'panelsCost', 'installCost', 'dowelsCost', 'pdfBase64', 'storageKey'];

for (const [name, select] of [['client', clientDocuments], ['server', serverDocuments]]) {
  test(`${name}: crew cannot list or select an estimate when no specification exists`, () => {
    assert.equal(select([estimate], 'crew').length, 0);
    assert.equal(select([estimate], 'crew').find((d) => d.id === estimate.id), undefined);
    assert.equal(select([], 'crew').length, 0);
    assert.equal(select(undefined, 'crew').length, 0);
  });

  test(`${name}: crew receives only specifications across document versions`, () => {
    const older = { ...spec, id: 'older', createdAt: '2026-10-17T09:00:00Z' };
    const input = [older, estimate, spec];
    assert.deepEqual(Array.from(select(input, 'crew'), (d) => d.id), ['unpriced', 'older']);
    assert.deepEqual(Array.from(select(input, 'crew'), (d) => d.kind), ['spec', 'spec']);
    assert.equal(input[0].id, 'older');
  });

  test(`${name}: owner, manager and STP see estimate and spec together`, () => {
    for (const role of ['admin', 'owner', 'sales', 'measurer']) {
      const both = select([spec, estimate], role);
      assert.deepEqual(Array.from(both, (d) => d.id), [estimate.id, spec.id]);
      assert.deepEqual(Array.from(both, (d) => d.kind), ['estimate', 'spec']);
      assert.equal(select([spec], role)[0].id, spec.id);
      assert.equal(select([estimate], role)[0].id, estimate.id);
    }
  });
}

test('server: crew document list has no prices and hides the estimate file', () => {
  const docs = serverDocuments([estimate, spec], 'crew');
  assert.deepEqual(Array.from(docs, (d) => d.id), [spec.id]);
  assert.equal(docs.some((d) => d.kind === 'estimate'), false);
  for (const doc of docs) {
    for (const key of priceKeys) assert.equal(doc[key], undefined);
  }
});

test('server: owner keeps both files, crew estimate read is 404', () => {
  for (const role of ['admin', 'owner', 'sales']) {
    assert.equal(findVisibleDocument([estimate, spec], role, estimate.id)?.kind, 'estimate');
    assert.equal(findVisibleDocument([estimate, spec], role, spec.id)?.kind, 'spec');
  }
  assert.equal(findVisibleDocument([estimate, spec], 'crew', spec.id)?.kind, 'spec');
  assert.equal(findVisibleDocument([estimate, spec], 'crew', estimate.id), null);
  assert.equal(findVisibleDocument([estimate], 'crew', estimate.id), null);
});

test('download route uses the shared visibility check and answers 404', () => {
  const source = readFileSync(new URL('./index.js', import.meta.url), 'utf8');
  assert.match(source, /from '\.\/documentAccess\.js'/);
  assert.match(source, /findVisibleDocument\(obj\.documents, user\.role, docId\)/);
  assert.match(source, /if \(!meta\) return json\(404, \{ message: 'Документ не найден' \}\)/);
  assert.doesNotMatch(source, /estimates\.length \? estimates : specs/);
});
