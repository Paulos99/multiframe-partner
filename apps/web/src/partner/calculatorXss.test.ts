// @ts-nocheck
import assert from 'node:assert/strict';
import test from 'node:test';
import { escapeHtml, safeId, safeLabel } from '../../public/calculator/src/core/html-escape.js';
import { Room, Opening } from '../../public/calculator/src/core/room-model.js';
import { createRectangleVertices } from '../../public/calculator/src/core/polygon-geometry.js';

const PAYLOAD = '<img src=x onerror=alert(1)>';

test('escapeHtml экранирует теги, кавычки и амперсанд', () => {
  assert.equal(escapeHtml(PAYLOAD), '&lt;img src=x onerror=alert(1)&gt;');
  assert.equal(escapeHtml(`"'&`), '&quot;&#39;&amp;');
  assert.equal(escapeHtml(null), '');
});

test('safeId и safeLabel вырезают всё, кроме безопасных символов', () => {
  assert.equal(safeId('a"><script>1</script>'), 'ascript1script');
  assert.equal(safeId('', 'fallback'), 'fallback');
  assert.equal(/[<>=()"']/.test(safeLabel(PAYLOAD, 'A')), false);
  assert.ok(safeLabel(PAYLOAD, 'A').length <= 12);
  assert.equal(safeLabel('<>', 'Б'), 'Б');
});

test('подписи вершин из ссылки не попадают в стены как разметка', () => {
  const vertices = createRectangleVertices(4, 3).map((v: Record<string, unknown>, i: number) => ({ ...v, label: i === 0 ? PAYLOAD : v.label }));
  const room = new Room({ vertices, edgeDimensions: { 0: 4, 1: 3, 2: 4, 3: 3 } });
  for (const wall of room.walls) {
    assert.equal(/[<>"]/.test(wall.label), false, wall.label);
    assert.match(wall.id, /^[A-Za-z0-9_-]+$/);
  }
});

test('идентификаторы проёмов из ссылки не ломают атрибуты', () => {
  const opening = new Opening({ id: 'x" onmouseover="alert(1)', wallId: 'wall-0"><b>', type: 'door', offset: 0, width: 1, height: 2 });
  assert.match(opening.id, /^[A-Za-z0-9_-]+$/);
  assert.match(opening.wallId, /^[A-Za-z0-9_-]*$/);
});
