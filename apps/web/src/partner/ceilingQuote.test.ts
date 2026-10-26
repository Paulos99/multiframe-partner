import assert from 'node:assert/strict';
import test from 'node:test';
import { panelsForCeilingArea } from '../../public/calculator/src/core/ceiling-quote.js';
import {
  DEFAULT_DOWEL_PRICE_RUB,
  DEFAULT_DOWELS_PER_PANEL,
  DEFAULT_INSTALL_PRICE_PER_M2,
  OFFICIAL_PANEL_PRICE_RUB,
} from '../../../../packages/shared/partner.ts';
import { buildPartnerEstimate } from './estimate.ts';

test('20 m² ceiling uses the shared area formula: 49 panels', () => {
  assert.equal(panelsForCeilingArea(20), 49);
  const est = buildPartnerEstimate(20, {
    panelPriceRub: OFFICIAL_PANEL_PRICE_RUB,
    installPricePerM2: DEFAULT_INSTALL_PRICE_PER_M2,
    dowelsPerPanel: DEFAULT_DOWELS_PER_PANEL,
    dowelPriceRub: DEFAULT_DOWEL_PRICE_RUB,
  });
  assert.ok(est);
  assert.equal(est.panels, 49);
  assert.equal(est.totalCost, 150229);
});
