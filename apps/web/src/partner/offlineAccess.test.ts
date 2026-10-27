import assert from 'node:assert/strict';
import test from 'node:test';
import { offlineAccessMode } from './offlineMaterialsPlan.ts';

test('офлайн-доступ: предложение, прогресс и шестерёнка', () => {
  assert.equal(offlineAccessMode({ enabled: false, running: false }), 'offer');
  assert.equal(offlineAccessMode({ enabled: false, running: true }), 'progress');
  assert.equal(offlineAccessMode({ enabled: true, running: true }), 'progress');
  assert.equal(offlineAccessMode({ enabled: true, running: false }), 'gear');
});
