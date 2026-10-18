import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { documentsForRole as clientDocuments, canSeePrices } from '../../packages/shared/partner.ts';

// Exercise the actual server selectors without starting the cloud handler or loading credentials.
const source = readFileSync(new URL('./index.js', import.meta.url), 'utf8');
const selectors = source.slice(source.indexOf('function publicDocument('), source.indexOf('function publicObject('));
assert.ok(selectors.includes('function documentsForRole('));
const serverDocuments = runInNewContext(`${selectors}\ndocumentsForRole`, { canSeePrices });
const estimate = { id: 'priced', kind: 'estimate', createdAt: '2026-10-18T10:00:00Z', filename: 'estimate.pdf' };
const spec = { id: 'unpriced', kind: 'spec', createdAt: '2026-10-18T09:00:00Z', filename: 'spec.pdf' };

for (const [name, select] of [['client', clientDocuments], ['server', serverDocuments]]) {
  test(`${name}: crew cannot list or select an estimate when no specification exists`, () => {
    assert.equal(select([estimate], 'crew').length, 0);
    assert.equal(select([estimate], 'crew').find(d => d.id === estimate.id), undefined);
    assert.equal(select([], 'crew').length, 0);
    assert.equal(select(undefined, 'crew').length, 0);
  });
  test(`${name}: crew receives only specifications across document versions`, () => {
    const older = { ...spec, id: 'older', createdAt: '2026-10-17T09:00:00Z' };
    const input = [older, estimate, spec];
    assert.deepEqual(Array.from(select(input, 'crew'), d => d.id), ['unpriced', 'older']);
    assert.equal(input[0].id, 'older');
  });
  test(`${name}: permitted roles retain estimates and specification fallback`, () => {
    for (const role of ['admin', 'owner', 'sales', 'measurer']) {
      assert.equal(select([spec, estimate], role)[0].id, estimate.id);
      assert.equal(select([spec], role)[0].id, spec.id);
    }
  });
}
