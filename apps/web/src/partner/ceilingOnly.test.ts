// @ts-nocheck
import assert from 'node:assert/strict';
import test from 'node:test';
import { Room } from '../../public/calculator/src/core/room-model.js';
import { WallCalculator } from '../../public/calculator/src/calculators/wall-calculator.js';
import { PolygonPanelCalculator } from '../../public/calculator/src/calculators/polygon-ceiling-calculator.js';
import { buildBOM, renderResultsHtml } from '../../public/calculator/src/calculators/materials-bom.js';
import { ceilingQuoteLine } from '../../public/calculator/src/export/pdf-export.js';

test('5×4: в смете только потолок, без стен и без каркаса', () => {
  const room = Room.createDefault();
  assert.equal(room.getTotalArea(), 20);

  const wallResults = new WallCalculator(room).calculateAllWalls();
  const wallPanels = wallResults.reduce((sum, wall) => sum + wall.panels.length, 0);
  assert.ok(wallPanels > 0, 'контрольный расчёт стен не пустой');

  const ceiling = new PolygonPanelCalculator(room.vertices).calculateBestScheme({ fast: true });
  const bom = buildBOM({
    room,
    ceilingResult: ceiling,
    wallResult: {
      wallResults,
      stats: {
        withReserve: wallPanels,
        totalCost: 1,
        dowels: { withReserve: wallPanels },
      },
    },
    options: {
      calcCeiling: true,
      calcWalls: true,
      ceilingMounting: 'ceiling_framed',
      wallMounting: 'wall_framed',
    },
  });

  assert.equal(bom.walls, null);
  assert.equal(bom.ceiling.area, 20);
  assert.equal(bom.ceiling.frame, null);
  assert.equal(bom.total.frame, null);
  assert.equal(bom.ceilingMounting, 'ceiling_frameless');
  assert.equal(bom.total.panelsWithReserve, ceiling.stats.withReserve);
  assert.notEqual(bom.total.panelsWithReserve, ceiling.stats.withReserve + wallPanels);

  const html = renderResultsHtml(bom);
  assert.match(html, /Потолок/);
  assert.doesNotMatch(html, /Стены|Каркас/);

  const plain = ceilingQuoteLine(bom, true);
  const priced = ceilingQuoteLine(bom, false);
  assert.match(plain, /пан/);
  assert.doesNotMatch(plain, /₽|руб/i);
  assert.match(priced, /₽/);
});
