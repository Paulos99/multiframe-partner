import { expect, test } from '@playwright/test';

const HISTORY_RESET = 'mf_partner_history_reset_v2';
const ANALYTICS = 'mf_partner_analytics_v1';
const SESSION = 'mf_partner_session_v2';
const PERIOD = 'mf_partner_analytics_period_v1';

function tileNumber(text: string): number {
  const lines = text.split('\n').map((part) => part.trim()).filter(Boolean);
  const numeric = lines.find((line) => /^-?\d+(?:[.,]\d+)?$/.test(line));
  return numeric ? Number(numeric.replace(',', '.')) : Number.NaN;
}

test('сохранённая история: плитки и рейтинг из одних комнат и событий', async ({ page }) => {
  const events = [
    {
      id: 'ev_demo_history_schema',
      schema: 3,
      at: '2025-10-01T12:00:00.000Z',
      orgId: 'org_demo',
      userId: 'u_partner1',
      login: 'partner1',
      role: 'owner',
      companyName: 'Потолки Столицы',
      tool: 'problemomer',
      action: 'result',
      object: { areaM2: 0, panels: 0 },
    },
    {
      id: 'ev_saved_tail',
      at: '2025-10-02T12:00:00.000Z',
      orgId: 'org_demo',
      userId: 'u_partner1',
      login: 'partner1',
      role: 'owner',
      companyName: 'Потолки Столицы',
      tool: 'problemomer',
      action: 'result',
      object: { areaM2: 1, panels: 1 },
    },
    {
      id: 'ev_saved_owner',
      at: '2026-10-15T12:00:00.000Z',
      orgId: 'org_demo',
      userId: 'u_partner1',
      login: 'partner1',
      role: 'owner',
      companyName: 'Потолки Столицы',
      tool: 'problemomer',
      action: 'result',
      object: { areaM2: 969.5, panels: 4000 },
    },
    {
      id: 'ev_saved_measurer',
      at: '2026-10-16T12:00:00.000Z',
      orgId: 'org_demo',
      userId: 'u_exec1',
      login: 'exec1',
      role: 'measurer',
      companyName: 'Потолки Столицы',
      tool: 'calculator',
      action: 'calc_done',
      object: { areaM2: 1433.5, panels: 1206, label: 'Кухня' },
    },
  ];

  await page.addInitScript(
    ({ historyKey, analyticsKey, sessionKey, periodKey, stored }) => {
      localStorage.setItem(historyKey, '1');
      localStorage.setItem(analyticsKey, JSON.stringify(stored));
      localStorage.setItem(periodKey, JSON.stringify({ fromYmd: '2026-10-01', toYmd: '2026-10-27' }));
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
    { historyKey: HISTORY_RESET, analyticsKey: ANALYTICS, sessionKey: SESSION, periodKey: PERIOD, stored: events },
  );

  const dashboardStatuses: number[] = [];
  const drillRequests: string[] = [];
  page.on('response', (response) => {
    if (response.url().includes('/analytics/dashboard')) dashboardStatuses.push(response.status());
  });
  page.on('request', (request) => {
    if (request.url().includes('/analytics/drill')) drillRequests.push(request.url());
  });

  await page.goto('/?demo=1');
  await expect(page.getByRole('complementary', { name: 'Разделы кабинета' })).toBeVisible();
  await page.getByRole('tab', { name: 'Проекты', exact: true }).click();
  const rooms = page.locator('[data-room-id]');
  await expect.poll(async () => rooms.count()).toBe(11);

  await page.getByRole('tab', { name: 'Аналитика', exact: true }).click();
  await expect(page.getByText('Сохранённая история · 1–27 октября 2026')).toBeVisible();
  const panelsTile = page.getByRole('button', { name: /^Панели/ }).first();
  const areaTile = page.getByRole('button', { name: /Площадь, м²/ }).first();
  await expect.poll(async () => tileNumber(await panelsTile.innerText())).toBe(5206);
  await expect.poll(async () => tileNumber(await areaTile.innerText())).toBe(2403);
  await page.screenshot({
    path: '/opt/cursor/artifacts/screenshots/analytics-saved-history-tiles.png',
    fullPage: true,
  });

  await panelsTile.click();
  const drill = page.getByRole('dialog', { name: 'Панели' });
  const why = drill.getByTestId('why-zero');
  await expect(why).toBeVisible();
  await expect(why).toContainText('Источник: локально');
  await expect(why).toContainText('Комнат 11');
  await expect(why).toContainText('Плитка панелей 5206');
  await expect(why).toContainText('площадь 2403');
  await expect(why).toContainText(/Событий [1-9]/);

  await drill.getByRole('tab', { name: 'Монтажники' }).click();
  const mounted = drill.getByRole('button').filter({ hasText: 'Смонтировано' });
  await expect.poll(async () => mounted.count()).toBeGreaterThan(0);
  await expect.poll(async () => (await mounted.allInnerTexts()).join('\n')).not.toContain('Смонтировано 0');
  await drill.getByRole('tab', { name: 'Без исполнителя' }).click();
  await expect(drill.getByRole('button', { name: /Без исполнителя/ })).toBeVisible();
  await drill.getByRole('tab', { name: 'Замерщики' }).click();
  const measurer = drill.getByRole('button', { name: /Замерщик · Потолки Столицы/ });
  await expect(measurer).toBeVisible();
  await expect(measurer).not.toContainText('Замеры 0');
  await expect(measurer).toContainText('1433.5');
  await drill.getByRole('tab', { name: 'Монтажники' }).click();
  await drill.screenshot({ path: '/opt/cursor/artifacts/screenshots/analytics-installers-why-zero.png' });

  for (const period of ['Месяц', 'Квартал', 'Год']) {
    await drill.getByRole('button', { name: period, exact: true }).click();
    await expect.poll(async () => (await mounted.allInnerTexts()).join('\n')).not.toContain('Смонтировано 0');
  }

  await drill.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await page.getByRole('button', { name: /^Сотрудники/ }).first().click();
  const staff = page.getByRole('dialog', { name: 'Сотрудники' });
  await staff.getByRole('tab', { name: 'Менеджеры' }).click();
  const manager = staff.getByRole('button', { name: /Менеджер · Потолки Столицы/ });
  await expect(manager).toBeVisible();
  const managerText = await manager.innerText();
  const listed = Number(managerText.match(/проекты\s+(\d+)/)?.[1] || '0');
  expect(listed).toBeGreaterThan(0);
  await manager.click();
  await expect(staff.getByRole('heading', { name: 'Топ проектов' })).toBeVisible();
  const top = staff.getByRole('button').filter({ hasText: /м²/ });
  await expect.poll(async () => top.count()).toBe(listed);
  await expect(staff.getByText('Проекты', { exact: true }).locator('xpath=following-sibling::strong')).toHaveText(
    String(listed),
  );
  await staff.screenshot({ path: '/opt/cursor/artifacts/screenshots/analytics-manager-projects.png' });
  await top.filter({ hasText: 'Никитин И.' }).click();
  const card = page.getByRole('dialog', { name: 'Комната' });
  await expect(card).toBeVisible();
  await expect(card).toContainText('Никитин И.');
  await page.screenshot({
    path: '/opt/cursor/artifacts/screenshots/analytics-room-card.png',
    fullPage: true,
  });
  expect(dashboardStatuses).toContain(200);
  expect(drillRequests).toEqual([]);
});
