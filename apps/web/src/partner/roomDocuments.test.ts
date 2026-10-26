import assert from 'node:assert/strict';
import test from 'node:test';
import { visibleDocuments } from '../../../../packages/shared/partner.ts';
import {
  documentOpenPolicy,
  rolesSeeDocument,
  roomWithToolPdf,
  shouldHideDocumentPrices,
  toolDocument,
} from './roomDocuments.ts';

test('PDF проблемомера и калькулятора лежит в комнате и виден менеджеру и монтажнику', () => {
  const profile = toolDocument({
    kind: 'profile',
    filename: 'Никитин — профиль — 2026-10-26.pdf',
    pdfBase64: 'cHJvZmlsZQ==',
    areaM2: 18,
    at: '2026-10-26T12:00:00.000Z',
  });
  const estimate = toolDocument({
    kind: 'estimate',
    filename: 'Никитин — смета — 2026-10-26.pdf',
    pdfBase64: 'c21ldGE=',
    areaM2: 20,
    panels: 56,
    hasScheme: true,
    at: '2026-10-26T12:05:00.000Z',
  });
  const docs = roomWithToolPdf(roomWithToolPdf([], profile), estimate);
  assert.equal(docs.length, 2);
  assert.equal(visibleDocuments(docs).length, 2);
  assert.deepEqual(rolesSeeDocument(docs, profile.id), { sales: true, crew: true });
  assert.deepEqual(rolesSeeDocument(docs, estimate.id), { sales: true, crew: true });
  assert.equal('sentAt' in estimate, false);
});

test('монтажник открывает документы без цен, менеджер — с ценами', () => {
  assert.equal(shouldHideDocumentPrices('crew'), true);
  assert.equal(shouldHideDocumentPrices('sales'), false);
  assert.equal(shouldHideDocumentPrices('owner'), false);
  assert.equal(shouldHideDocumentPrices('measurer'), false);
  assert.equal(documentOpenPolicy('crew'), 'without-prices');
  assert.equal(documentOpenPolicy('sales'), 'priced-file');
  assert.equal(documentOpenPolicy('owner'), 'priced-file');
});
