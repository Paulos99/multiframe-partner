import { expect, test } from '@playwright/test';

const HISTORY_RESET = 'mf_partner_history_reset_v2';
const VERSION = 'mf_partner_demo_analytics_version';
const ANALYTICS = 'mf_partner_analytics_v1';
const SESSION = 'mf_partner_session_v2';

function noonDaysAgo(days: number): string {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

test('сохранённая демо-история не меняется после двух перезагрузок', async ({ page }) => {
  const events = [
    {
      id: 'ae_frozen_pm',
      at: noonDaysAgo(1),
      orgId: 'org_demo',
      userId: 'u_sales1',
      login: 'sales1',
      role: 'sales',
      companyName: 'Потолки Столицы',
      city: 'Москва',
      tool: 'problemomer',
      action: 'result',
      object: { areaM2: 40.5, panels: 12, label: 'Кухня' },
    },
    {
      id: 'ae_frozen_calc',
      at: noonDaysAgo(2),
      orgId: 'org_demo',
      userId: 'u_sales1',
      login: 'sales1',
      role: 'sales',
      companyName: 'Потолки Столицы',
      city: 'Москва',
      tool: 'calculator',
      action: 'calc_done',
      object: { areaM2: 22, panels: 7 },
    },
    {
      id: 'ae_frozen_pdf',
      at: noonDaysAgo(2),
      orgId: 'org_demo',
      userId: 'u_sales1',
      login: 'sales1',
      role: 'sales',
      companyName: 'Потолки Столицы',
      city: 'Москва',
      tool: 'problemomer',
      action: 'pdf',
      object: { areaM2: 40.5, panels: 12 },
    },
    {
      id: 'ae_frozen_old',
      at: noonDaysAgo(40),
      orgId: 'org_demo',
      userId: 'u_sales1',
      login: 'sales1',
      role: 'sales',
      companyName: 'Потолки Столицы',
      city: 'Москва',
      tool: 'problemomer',
      action: 'result',
      object: { areaM2: 99, panels: 30 },
    },
  ];
  await page.addInitScript(
    ({ historyKey, versionKey, analyticsKey, sessionKey, stored }) => {
      localStorage.setItem(historyKey, '1');
      localStorage.setItem(versionKey, '3');
      localStorage.setItem(analyticsKey, JSON.stringify(stored));
      localStorage.setItem(
        sessionKey,
        JSON.stringify({
          id: 'u_partner1',
          login: 'partner1',
          role: 'owner',
          displayName: 'Владелец',
          orgId: 'org_demo',
          org: null,
        }),
      );
    },
    { historyKey: HISTORY_RESET, versionKey: VERSION, analyticsKey: ANALYTICS, sessionKey: SESSION, stored: events },
  );

  await page.goto('/');
  await expect(page.getByRole('complementary', { name: 'Разделы кабинета' })).toBeVisible();
  await page.getByRole('tab', { name: 'Аналитика', exact: true }).click();
  const area = page.getByRole('button', { name: /Площадь, м²/ });
  await expect(area).toContainText('62.5');
  const stored = await page.evaluate((key) => localStorage.getItem(key), ANALYTICS);

  await page.reload();
  await expect(page.getByRole('complementary', { name: 'Разделы кабинета' })).toBeVisible();
  await page.getByRole('tab', { name: 'Аналитика', exact: true }).click();
  await expect(area).toContainText('62.5');
  expect(await page.evaluate((key) => localStorage.getItem(key), ANALYTICS)).toBe(stored);

  await page.reload();
  await expect(page.getByRole('complementary', { name: 'Разделы кабинета' })).toBeVisible();
  await page.getByRole('tab', { name: 'Аналитика', exact: true }).click();
  await expect(area).toContainText('62.5');
  expect(await page.evaluate((key) => localStorage.getItem(key), ANALYTICS)).toBe(stored);
  await expect(page.getByRole('button', { name: /Панели/ }).first()).toContainText('19');
});

test('короткая демо-история один раз дополняется до года и больше не меняется', async ({ page }) => {
  const short = [
    {
      id: 'ev_result_org_demo_0_0',
      at: noonDaysAgo(1),
      orgId: 'org_demo',
      userId: 'u_sales1',
      login: 'sales1',
      role: 'sales',
      companyName: 'Потолки Столицы',
      tool: 'problemomer',
      action: 'result',
      object: { areaM2: 10, panels: 4 },
    },
    {
      id: 'ev_result_org_demo_200_0',
      at: noonDaysAgo(200),
      orgId: 'org_demo',
      userId: 'u_sales1',
      login: 'sales1',
      role: 'sales',
      companyName: 'Потолки Столицы',
      tool: 'problemomer',
      action: 'result',
      object: { areaM2: 12, panels: 5 },
    },
    {
      id: 'ae_kept_custom',
      at: noonDaysAgo(1),
      orgId: 'org_demo',
      userId: 'u_sales1',
      login: 'sales1',
      role: 'sales',
      companyName: 'Потолки Столицы',
      tool: 'calculator',
      action: 'calc_done',
      object: { areaM2: 4, panels: 1 },
    },
  ];
  await page.addInitScript(
    ({ historyKey, analyticsKey, sessionKey, stored }) => {
      localStorage.setItem(historyKey, '1');
      localStorage.removeItem('mf_partner_demo_analytics_version');
      localStorage.setItem(analyticsKey, JSON.stringify(stored));
      localStorage.setItem(
        sessionKey,
        JSON.stringify({
          id: 'u_partner1',
          login: 'partner1',
          role: 'owner',
          displayName: 'Владелец',
          orgId: 'org_demo',
          org: null,
        }),
      );
    },
    { historyKey: HISTORY_RESET, analyticsKey: ANALYTICS, sessionKey: SESSION, stored: short },
  );

  await page.goto('/');
  await expect(page.getByRole('complementary', { name: 'Разделы кабинета' })).toBeVisible();
  const migrated = await page.evaluate(
    ({ versionKey, analyticsKey }) => {
      const list = JSON.parse(localStorage.getItem(analyticsKey) || '[]') as Array<{ id?: string; at?: string }>;
      const stamps = list.map((event) => Date.parse(event.at || '')).filter((stamp) => !Number.isNaN(stamp));
      return {
        version: localStorage.getItem(versionKey),
        span: Math.max(...stamps) - Math.min(...stamps),
        kept: list.some((event) => event.id === 'ae_kept_custom'),
        raw: localStorage.getItem(analyticsKey),
      };
    },
    { versionKey: VERSION, analyticsKey: ANALYTICS },
  );
  expect(migrated.version).toBe('3');
  expect(migrated.span).toBeGreaterThan(300 * 24 * 60 * 60 * 1000);
  expect(migrated.kept).toBe(true);

  await page.reload();
  expect(await page.evaluate((key) => localStorage.getItem(key), ANALYTICS)).toBe(migrated.raw);
  await page.reload();
  expect(await page.evaluate((key) => localStorage.getItem(key), ANALYTICS)).toBe(migrated.raw);

  await page.getByRole('tab', { name: 'Аналитика', exact: true }).click();
  const tile = page.getByRole('button', { name: /Площадь, м²/ }).first();
  await tile.click();
  const drill = page.getByRole('dialog', { name: 'Площадь, м²' });
  await drill.getByRole('button', { name: 'Месяц', exact: true }).click();
  await expect(drill.getByRole('button', { name: 'Месяц', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const monthRows = () => drill.getByRole('button').filter({ hasText: /^\d+\./ }).allInnerTexts();
  await expect.poll(async () => (await monthRows()).length).toBeGreaterThan(0);
  const monthText = (await monthRows()).join('\n');
  const tileText = await tile.innerText();
  await drill.getByRole('button', { name: 'Год', exact: true }).click();
  await expect.poll(async () => (await monthRows()).join('\n')).not.toBe(monthText);
  await expect.poll(async () => tile.innerText()).toBe(tileText);
});
