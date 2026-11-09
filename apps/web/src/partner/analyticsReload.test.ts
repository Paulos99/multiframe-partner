import assert from 'node:assert/strict';
import test from 'node:test';
import {
  analyticsFiltersKey,
  analyticsSectionTitle,
  shouldFlashAnalyticsReload,
} from './analyticsReload.ts';

const base = {
  mode: 'partner',
  fromYmd: '2026-01-01',
  toYmd: '2026-01-31',
  focusOrg: '',
  orgId: 'org1',
  login: 'owner',
};

test('первый заход — жёсткая перезагрузка со скелетом', () => {
  const key = analyticsFiltersKey(base);
  assert.equal(
    shouldFlashAnalyticsReload({ loadedOnce: false, prevFiltersKey: key, nextFiltersKey: key }),
    true,
  );
});

test('смена периода — снова со скелетом и анимацией', () => {
  const prev = analyticsFiltersKey(base);
  const next = analyticsFiltersKey({ ...base, fromYmd: '2026-02-01', toYmd: '2026-02-28' });
  assert.equal(
    shouldFlashAnalyticsReload({ loadedOnce: true, prevFiltersKey: prev, nextFiltersKey: next }),
    true,
  );
});

test('фоновый опрос при тех же фильтрах — тихо, без скелета', () => {
  const key = analyticsFiltersKey(base);
  assert.equal(
    shouldFlashAnalyticsReload({ loadedOnce: true, prevFiltersKey: key, nextFiltersKey: key }),
    false,
  );
});

test('ключ фильтров не зависит от раздела: Обзор → Журнал не вспыхивает скелетом', () => {
  const key = analyticsFiltersKey(base);
  assert.equal(analyticsFiltersKey({ ...base }), key);
  assert.equal(
    shouldFlashAnalyticsReload({ loadedOnce: true, prevFiltersKey: key, nextFiltersKey: key }),
    false,
  );
});

test('заголовки разделов на русском', () => {
  assert.equal(analyticsSectionTitle('photos', 'admin'), 'Фото отчёты');
  assert.equal(analyticsSectionTitle('objects', 'admin'), 'Журнал');
  assert.equal(analyticsSectionTitle('overview', 'partner'), 'Аналитика команды');
  assert.equal(analyticsSectionTitle('overview', 'admin'), 'Аналитика');
});
