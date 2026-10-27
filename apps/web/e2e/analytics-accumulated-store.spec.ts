import { expect, test } from '@playwright/test';
import {
  buildLocalDemoAnalytics,
  buildLocalDemoObjects,
  buildLocalDemoOrgs,
  buildLocalDemoUsers,
} from '../src/partner/demoSeed';

const HISTORY_RESET = 'mf_partner_history_reset_v2';
const ANALYTICS = 'mf_partner_analytics_v1';
const SESSION = 'mf_partner_session_v2';
const PERIOD = 'mf_partner_analytics_period_v1';
const DB = 'mf_partner_db_v5';
const OBJECTS_CACHE = 'mf_partner_objects_v1';
const ORIGIN = 'http://127.0.0.1:4180';

function tileNumber(text: string): number {
  const lines = text.split('\n').map((part) => part.trim()).filter(Boolean);
  const numeric = lines.find((line) => /^-?\d+(?:[.,]\d+)?$/.test(line));
  return numeric ? Number(numeric.replace(',', '.')) : Number.NaN;
}

function paragraphTile(text: string, label: string): number {
  const match = text.match(new RegExp(`${label}\\s+(-?\\d+(?:[.,]\\d+)?)`));
  return match ? Number(match[1].replace(',', '.')) : Number.NaN;
}

test('накопленное хранилище: сессия, v5 и история, сразу Аналитика', async ({ browser, request }) => {
  const killer = await request.get('/sw.js');
  expect(killer.ok()).toBeTruthy();
  expect(await killer.text()).toContain('unregister');

  const users = buildLocalDemoUsers();
  const objects = buildLocalDemoObjects();
  const events = buildLocalDemoAnalytics();
  const companyRooms = objects.filter((object) => object.orgId === 'org_demo').length;
  const context = await browser.newContext({
    baseURL: ORIGIN,
    storageState: {
      cookies: [],
      origins: [
        {
          origin: ORIGIN,
          localStorage: [
            { name: HISTORY_RESET, value: '1' },
            {
              name: DB,
              value: JSON.stringify({
                users,
                orgs: buildLocalDemoOrgs(),
                links: [],
                activity: [],
                objects,
                projects: [],
              }),
            },
            { name: OBJECTS_CACHE, value: JSON.stringify([{ id: 'blocked', orgId: 'org_demo' }]) },
            { name: ANALYTICS, value: JSON.stringify(events) },
            { name: PERIOD, value: JSON.stringify({ fromYmd: '2026-10-01', toYmd: '2026-10-27' }) },
            {
              name: SESSION,
              value: JSON.stringify({
                id: 'u_partner1',
                login: 'partner1',
                role: 'owner',
                displayName: 'Владелец',
                orgId: 'org_demo',
                org: null,
              }),
            },
          ],
        },
      ],
    },
  });
  const page = await context.newPage();
  await page.goto('/?demo=1&debug=1');
  await expect(page.getByRole('complementary', { name: 'Разделы кабинета' })).toBeVisible({ timeout: 15000 });
  await page.reload();
  await expect(page.getByRole('complementary', { name: 'Разделы кабинета' })).toBeVisible();
  await expect
    .poll(async () => page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length))
    .toBe(0);
  await expect(page.locator('[data-room-id]')).toHaveCount(0);

  await page.getByRole('tab', { name: 'Аналитика', exact: true }).click();
  await expect(page.getByText(/Сохранённая история/)).toBeVisible();
  const panelsTile = page.getByRole('button', { name: /^Панели/ }).first();
  const areaTile = page.getByRole('button', { name: /Площадь, м²/ }).first();
  await expect.poll(async () => tileNumber(await panelsTile.innerText())).toBeGreaterThan(0);
  const panelsOnTile = tileNumber(await panelsTile.innerText());
  const areaOnTile = tileNumber(await areaTile.innerText());
  expect(areaOnTile).toBeGreaterThan(0);

  await panelsTile.click();
  await expect(page).toHaveURL(/#analytics\/rating\/panels/);
  const drill = page.getByRole('region', { name: 'Панели' });
  const why = drill.getByTestId('why-zero');
  await expect(why).toBeVisible();
  const report = await why.innerText();
  expect(report.startsWith('Почему 0.')).toBe(true);
  expect(paragraphTile(report, 'Комнат')).toBe(companyRooms);
  expect(paragraphTile(report, 'Событий')).toBeGreaterThan(0);
  expect(paragraphTile(report, 'Плитка панелей')).toBe(panelsOnTile);
  expect(paragraphTile(report, 'площадь')).toBe(areaOnTile);
  const paragraphFits = await why.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const pageBox = el.closest('[role="region"]')?.getBoundingClientRect();
    const style = getComputedStyle(el);
    const clamp = style.getPropertyValue('-webkit-line-clamp');
    return Boolean(
      pageBox &&
        rect.top >= pageBox.top - 1 &&
        rect.left >= pageBox.left - 1 &&
        rect.bottom <= pageBox.bottom + 1 &&
        rect.height > 24 &&
        (clamp === '' || clamp === 'none'),
    );
  });
  expect(paragraphFits).toBe(true);

  async function installerLines() {
    await drill.getByRole('tab', { name: 'Монтажники' }).click();
    return drill.getByRole('button').filter({ hasText: 'Смонтировано' }).allInnerTexts();
  }
  const mountedNow = await installerLines();
  expect(mountedNow.length).toBeGreaterThan(0);
  expect(mountedNow.some((line) => !line.includes('Смонтировано 0'))).toBe(true);
  for (const period of ['Месяц', 'Квартал', 'Год']) {
    await drill.getByRole('button', { name: period, exact: true }).click();
    const lines = await installerLines();
    expect(lines.some((line) => !line.includes('Смонтировано 0'))).toBe(true);
  }
  await drill.screenshot({
    path: '/opt/cursor/artifacts/screenshots/analytics-accumulated-why-zero.png',
  });
  await page.goBack();
  await expect(page).not.toHaveURL(/#analytics\//);
  await expect(page.getByRole('button', { name: /^Панели/ }).first()).toBeVisible();

  await page.getByRole('button', { name: /^Сотрудники/ }).first().click();
  const staff = page.getByRole('region', { name: 'Сотрудники' });
  await expect(staff.getByTestId('why-zero')).toContainText('Почему 0. Источник:');
  await staff.getByRole('tab', { name: 'Замерщики' }).click();
  const measurer = staff.getByRole('button', { name: /Замерщик · Потолки Столицы/ });
  await expect(measurer).toBeVisible();
  await expect(measurer).not.toContainText('Замеры 0');
  await staff.getByRole('tab', { name: 'Менеджеры' }).click();
  const manager = staff.getByRole('button', { name: /Менеджер · Потолки Столицы/ });
  const listed = Number((await manager.innerText()).match(/проекты\s+(\d+)/)?.[1] || '0');
  expect(listed).toBeGreaterThan(0);
  await manager.click();
  await expect(page).toHaveURL(/#analytics\/staff\//);
  const top = staff.getByRole('button').filter({ hasText: /м²/ });
  await expect.poll(async () => top.count()).toBe(listed);
  await expect(top.filter({ hasText: 'Никитин И.' })).toBeVisible();
  await expect(top.filter({ hasText: 'Морозова Е.' })).toBeVisible();
  await expect(top.filter({ hasText: 'Вася' })).toBeVisible();
  await expect(staff.getByText('Проекты', { exact: true }).locator('xpath=following-sibling::strong')).toHaveText(
    String(listed),
  );
  await staff.screenshot({
    path: '/opt/cursor/artifacts/screenshots/analytics-accumulated-top.png',
  });
  await context.close();
});
