import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import {
  findVisibleDocument,
  incomingDocumentKind,
  visibleDocuments as serverDocuments,
} from './documentAccess.js';

// Клиентский отбор лежит в TypeScript. Берём тело функции и снимаем аннотации типов.
const partnerSource = readFileSync(new URL('../../packages/shared/partner.ts', import.meta.url), 'utf8');

function functionSource(name) {
  const start = partnerSource.indexOf(`export function ${name}`);
  const brace = partnerSource.indexOf('{\n', start);
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
  `function visibleDocuments(docs) ${functionSource('visibleDocuments')}
   visibleDocuments`,
);

const estimate = {
  id: 'priced',
  versionId: 'v2',
  kind: 'estimate',
  createdAt: '2026-10-18T10:00:00Z',
  filename: 'estimate.pdf',
  storageKey: 'docs/org/obj/priced.pdf',
  pdfBase64: 'priced-bytes',
};
const pairedSpec = {
  id: 'paired-spec',
  versionId: 'v2',
  kind: 'spec',
  createdAt: '2026-10-18T10:00:00Z',
  filename: 'spec.pdf',
  storageKey: 'docs/org/obj/paired-spec.pdf',
};
const loneSpec = {
  id: 'lone-spec',
  versionId: 'v1',
  kind: 'spec',
  createdAt: '2026-10-17T09:00:00Z',
  filename: 'old-spec.pdf',
  storageKey: 'docs/org/obj/lone-spec.pdf',
};
const profile = {
  id: 'profile',
  versionId: 'p1',
  kind: 'profile',
  createdAt: '2026-10-18T11:00:00Z',
  filename: 'profile.pdf',
  storageKey: 'docs/org/obj/profile.pdf',
};

for (const [name, select] of [['client', clientDocuments], ['server', serverDocuments]]) {
  test(`${name}: estimate and profile are listed newest first`, () => {
    const docs = select([estimate, profile]);
    assert.deepEqual(Array.from(docs, (d) => d.id), ['profile', 'priced']);
    assert.deepEqual(Array.from(docs, (d) => d.kind), ['profile', 'estimate']);
  });

  test(`${name}: old estimate + spec pair shows one estimate`, () => {
    const docs = select([pairedSpec, estimate]);
    assert.deepEqual(Array.from(docs, (d) => d.id), ['priced']);
  });

  test(`${name}: old spec without estimate stays visible`, () => {
    const docs = select([loneSpec]);
    assert.deepEqual(Array.from(docs, (d) => d.id), ['lone-spec']);
    assert.equal(select([estimate, pairedSpec, loneSpec]).length, 2);
  });

  test(`${name}: empty input`, () => {
    assert.equal(select([]).length, 0);
    assert.equal(select(undefined).length, 0);
  });
}

test('server: list has no storage key or bytes', () => {
  for (const doc of serverDocuments([estimate, profile, loneSpec])) {
    assert.equal(doc.storageKey, undefined);
    assert.equal(doc.pdfBase64, undefined);
  }
});

test('server: download finds estimate, profile and old spec for any document id', () => {
  const docs = [estimate, pairedSpec, loneSpec, profile];
  assert.equal(findVisibleDocument(docs, estimate.id)?.kind, 'estimate');
  assert.equal(findVisibleDocument(docs, profile.id)?.kind, 'profile');
  assert.equal(findVisibleDocument(docs, loneSpec.id)?.kind, 'spec');
  assert.equal(findVisibleDocument(docs, pairedSpec.id)?.kind, 'spec');
  assert.equal(findVisibleDocument(docs, 'missing'), null);
  assert.equal(findVisibleDocument(docs, ''), null);
});

test('incoming kind: profile is kept, spec and unknown become estimate', () => {
  assert.equal(incomingDocumentKind('profile'), 'profile');
  assert.equal(incomingDocumentKind('estimate'), 'estimate');
  assert.equal(incomingDocumentKind('spec'), 'estimate');
  assert.equal(incomingDocumentKind(undefined), 'estimate');
});

test('API has no role-based price hiding', () => {
  const source = readFileSync(new URL('./index.js', import.meta.url), 'utf8');
  assert.match(source, /from '\.\/documentAccess\.js'/);
  assert.match(source, /findVisibleDocument\(obj\.documents, docId\)/);
  assert.match(source, /if \(!meta\) return json\(404, \{ message: 'Документ не найден' \}\)/);
  assert.doesNotMatch(source, /canSeePrices|redactOrg|redactEstimate/);
});
