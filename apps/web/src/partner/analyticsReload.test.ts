import assert from 'node:assert/strict';
import test from 'node:test';
import { analyticsFiltersKey, shouldFlashAnalyticsReload } from './analyticsReload.ts';

const base = {
  mode: 'partner',
  fromYmd: '2026-01-01',
  toYmd: '2026-01-31',
  focusOrg: '',
  orgId: 'org1',
  login: 'owner',
  section: 'overview',
};

test('первый заход — жёсткая перезагрузка со скелетом', () => {
  const key = analyticsFiltersKey(base);
  assert.equal(
    shouldFlashAnalyticsReload({ loadedOnce: false, prevFiltersKey: key, nextFiltersKey: key }),
    true,
  );
});

test('смена периода или вкладки — снова со скелетом и анимацией', () => {
  const prev = analyticsFiltersKey(base);
  const next = analyticsFiltersKey({ ...base, fromYmd: '2026-02-01', toYmd: '2026-02-28' });
  assert.equal(
    shouldFlashAnalyticsReload({ loadedOnce: true, prevFiltersKey: prev, nextFiltersKey: next }),
    true,
  );
  const tab = analyticsFiltersKey({ ...base, section: 'team' });
  assert.equal(
    shouldFlashAnalyticsReload({ loadedOnce: true, prevFiltersKey: prev, nextFiltersKey: tab }),
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

test('ключ фильтров стабилен при том же наборе', () => {
  assert.equal(analyticsFiltersKey(base), analyticsFiltersKey({ ...base }));
});
