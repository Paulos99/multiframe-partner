import assert from 'node:assert/strict';
import test from 'node:test';
import { analyticsHash, parseAnalyticsHash } from './analyticsRoute';

test('рейтинг читает метрику и роль из hash', () => {
  const loc = parseAnalyticsHash('#analytics/rating/panels/crew', { period: 'year' });
  assert.equal(loc.page, 'rating');
  assert.equal(loc.metric, 'panels');
  assert.equal(loc.role, 'crew');
  assert.equal(loc.userId, null);
  assert.equal(loc.period, 'year');
  assert.equal(analyticsHash(loc), '#analytics/rating/panels/crew');
});

test('сотрудник берёт метрику из state, в адресе только id', () => {
  const loc = parseAnalyticsHash('#analytics/staff/u_sales1', { metric: 'area', role: 'sales', period: 'month' });
  assert.equal(loc.page, 'staff');
  assert.equal(loc.userId, 'u_sales1');
  assert.equal(loc.metric, 'area');
  assert.equal(loc.role, 'sales');
  assert.equal(loc.period, 'month');
  assert.equal(analyticsHash(loc), '#analytics/staff/u_sales1');
});

test('чужой hash — это сводка', () => {
  assert.equal(parseAnalyticsHash('#project/obj/room/room', null).page, 'overview');
  assert.equal(parseAnalyticsHash('', null).page, 'overview');
});

test('страницы обучения: сотрудник и компания', () => {
  const user = parseAnalyticsHash('#analytics/training/ui_sales', null);
  assert.equal(user.page, 'training-user');
  assert.equal(user.userId, 'ui_sales');
  assert.equal(analyticsHash(user), '#analytics/training/ui_sales');
  const company = parseAnalyticsHash('#analytics/training-company/ui_org_b', null);
  assert.equal(company.page, 'training-company');
  assert.equal(company.orgId, 'ui_org_b');
  assert.equal(analyticsHash(company), '#analytics/training-company/ui_org_b');
  assert.equal(parseAnalyticsHash('#analytics/training', null).page, 'overview');
});
