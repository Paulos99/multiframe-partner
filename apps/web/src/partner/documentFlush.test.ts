import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import {
  clearObjectDocumentQueue,
  enqueueObjectDocuments,
  peekObjectDocumentQueue,
  removeQueuedObjectDocuments,
  patchQueuedObjectDocuments,
} from './localStore';
import { isFinalHttpStatus, isRegenerableDocumentKind } from './offlineQueue';

class MemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string) {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.map.set(key, String(value));
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  clear() {
    this.map.clear();
  }
}

const PDF = Buffer.from('%PDF-1.4\n%%EOF\n').toString('base64');

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', { value: new MemoryStorage(), configurable: true });
  clearObjectDocumentQueue();
});

afterEach(() => {
  clearObjectDocumentQueue();
});

test('застрявший PDF снимается из очереди по окончательной ошибке', () => {
  enqueueObjectDocuments('obj_missing', [
    {
      objectId: 'obj_missing',
      versionId: 'ver_1',
      kind: 'estimate',
      filename: 'смета.pdf',
      pdfBase64: PDF,
      hasScheme: true,
      roomName: 'Спальня',
    },
  ]);
  assert.equal(peekObjectDocumentQueue().length, 1);
  assert.equal(isRegenerableDocumentKind('estimate'), true);
  assert.equal(isFinalHttpStatus(404), true);
  removeQueuedObjectDocuments('obj_missing', 'ver_1');
  assert.equal(peekObjectDocumentQueue().length, 0);
});

test('после сбоев PDF помечается ошибкой и ждёт «Убрать из очереди»', () => {
  enqueueObjectDocuments('obj_1', [
    {
      objectId: 'obj_1',
      versionId: 'ver_2',
      kind: 'estimate',
      filename: 'профиль.pdf',
      pdfBase64: PDF,
      hasScheme: false,
      roomName: 'Кухня',
    },
  ]);
  patchQueuedObjectDocuments('obj_1', 'ver_2', {
    attempts: 5,
    failed: true,
    lastError: 'Нет связи с сервером. Проверьте интернет и повторите.',
    roomName: 'Кухня',
  });
  const row = peekObjectDocumentQueue()[0]!;
  assert.equal(row.failed, true);
  assert.match(row.lastError || '', /Нет связи/);
  removeQueuedObjectDocuments('obj_1', 'ver_2');
  assert.equal(peekObjectDocumentQueue().length, 0);
});

test('пять застрявших PDF: очередь чистится целиком', () => {
  for (let i = 0; i < 5; i += 1) {
    enqueueObjectDocuments(`obj_${i}`, [
      {
        objectId: `obj_${i}`,
        versionId: `ver_${i}`,
        kind: 'profile',
        filename: `профиль-${i}.pdf`,
        pdfBase64: PDF,
        hasScheme: false,
        roomName: `Комната ${i}`,
      },
    ]);
  }
  assert.equal(peekObjectDocumentQueue().length, 5);
  clearObjectDocumentQueue();
  assert.equal(peekObjectDocumentQueue().length, 0);
});
