import { expect, test } from '@playwright/test';

const HISTORY_RESET = 'mf_partner_history_reset_v2';
const ANALYTICS = 'mf_partner_analytics_v1';
const SESSION = 'mf_partner_session_v2';
const PERIOD = 'mf_partner_analytics_period_v1';
const DB = 'mf_partner_db_v5';
const OBJECTS_CACHE = 'mf_partner_objects_v1';
const ORIGIN = 'http://127.0.0.1:4180';
const COMPANY_ROOMS = 11;

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

function tileNumber(text: string): number {
  const lines = text.split('\n').map((part) => part.trim()).filter(Boolean);
  const numeric = lines.find((line) => /^-?\d+(?:[.,]\d+)?$/.test(line));
  return numeric ? Number(numeric.replace(',', '.')) : Number.NaN;
}

function paragraphTile(text: string, label: string): number {
  const match = text.match(new RegExp(`${label}\\s+(-?\\d+(?:[.,]\\d+)?)`));
  return match ? Number(match[1].replace(',', '.')) : Number.NaN;
}

function installerPanelSum(texts: string[]): number {
  let sum = 0;
  for (const text of texts) {
    if (text.includes('Смонтировано')) {
      const panels = text.match(/панели\s+(-?\d+(?:[.,]\d+)?)/);
      if (panels) sum += Number(panels[1].replace(',', '.'));
    }
    if (text.includes('Без исполнителя')) {
      const numeric = text
        .split('\n')
        .map((line) => line.trim())
        .find((line) => /^-?\d+(?:[.,]\d+)?$/.test(line));
      if (numeric) sum += Number(numeric.replace(',', '.'));
    }
  }
  return sum;
}

function emptyCompanyDb() {
  const user = (
    id: string,
    login: string,
    role: string,
    orgId: string | null,
    displayName: string,
  ) => ({
    id,
    login,
    password: 'exec1234',
    role,
    displayName,
    orgId,
    createdAt: '2026-10-01T00:00:00.000Z',
  });
  return {
    users: [
      user('u_admin', 'admin', 'admin', null, 'Администратор'),
      user('u_partner1', 'partner1', 'owner', 'org_demo', 'Владелец · Потолки Столицы'),
      user('u_sales1', 'sales1', 'sales', 'org_demo', 'Менеджер · Потолки Столицы'),
      user('u_exec1', 'exec1', 'measurer', 'org_demo', 'Замерщик · Потолки Столицы'),
      user('u_crew1', 'crew1', 'crew', 'org_demo', 'Монтажник · Потолки Столицы'),
      user('u_crew1b', 'crew1b', 'crew', 'org_demo', 'Монтажник 2 · Потолки Столицы'),
      user('u_partner2', 'partner2', 'owner', 'org_demo_spb', 'Владелец · Северный Потолок'),
      user('u_sales2', 'sales2', 'sales', 'org_demo_spb', 'Менеджер · Северный Потолок'),
      user('u_exec2', 'exec2', 'measurer', 'org_demo_spb', 'Замерщик · Северный Потолок'),
      user('u_crew2', 'crew2', 'crew', 'org_demo_spb', 'Монтажник · Северный Потолок'),
    ],
    orgs: [
      {
        id: 'org_demo',
        createdAt: '2026-09-01T00:00:00.000Z',
        createdBy: 'u_admin',
        settings: { companyName: 'Потолки Столицы', city: 'Москва' },
      },
      {
        id: 'org_demo_spb',
        createdAt: '2026-09-01T00:00:00.000Z',
        createdBy: 'u_admin',
        settings: { companyName: 'Северный Потолок', city: 'Санкт-Петербург' },
      },
    ],
    links: [],
    activity: [],
    objects: [],
    projects: [],
  };
}

test('сессия уже активна: reload, сразу Аналитика, плитка в абзаце равна плитке', async ({ browser }) => {
  const context = await browser.newContext({
    baseURL: ORIGIN,
    storageState: {
      cookies: [],
      origins: [
        {
          origin: ORIGIN,
          localStorage: [
            { name: HISTORY_RESET, value: '1' },
            { name: DB, value: JSON.stringify(emptyCompanyDb()) },
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
  await expect(page.getByRole('complementary', { name: 'Разделы кабинета' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('complementary', { name: 'Разделы кабинета' })).toBeVisible();
  await expect(page.locator('[data-room-id]')).toHaveCount(0);

  await page.getByRole('tab', { name: 'Аналитика', exact: true }).click();
  await expect(page.getByText(/Сохранённая история/)).toBeVisible();
  const panelsTile = page.getByRole('button', { name: /^Панели/ }).first();
  const areaTile = page.getByRole('button', { name: /Площадь, м²/ }).first();
  await expect.poll(async () => tileNumber(await panelsTile.innerText())).toBe(5206);
  const panelsOnTile = tileNumber(await panelsTile.innerText());
  const areaOnTile = tileNumber(await areaTile.innerText());
  expect(areaOnTile).toBe(2403);

  await panelsTile.click();
  await expect(page).toHaveURL(/#analytics\/rating\/panels/);
  const why = page.getByRole('region', { name: 'Панели' }).getByTestId('why-zero');
  await expect(why).toBeVisible();
  await expect(why).toContainText('Почему 0. Источник:');
  const report = await why.innerText();
  expect(report.startsWith('Почему 0.')).toBe(true);
  const panelsInReport = paragraphTile(report, 'Плитка панелей');
  const areaInReport = paragraphTile(report, 'площадь');
  expect(panelsInReport).toBe(panelsOnTile);
  expect(areaInReport).toBe(areaOnTile);
  expect(panelsOnTile).toBe(5206);
  expect(paragraphTile(report, 'Комнат')).toBe(COMPANY_ROOMS);
  expect(paragraphTile(report, 'Событий')).toBeGreaterThan(0);

  const drill = page.getByRole('region', { name: 'Панели' });
  async function panelsOfInstallers() {
    await drill.getByRole('tab', { name: 'Монтажники' }).click();
    const crew = await drill.getByRole('button').filter({ hasText: 'Смонтировано' }).allInnerTexts();
    const unassignedTab = drill.getByRole('tab', { name: 'Без исполнителя' });
    const unassigned = (await unassignedTab.count())
      ? await unassignedTab.click().then(() => drill.getByRole('button').filter({ hasText: 'Без исполнителя' }).allInnerTexts())
      : [];
    return installerPanelSum([...crew, ...unassigned]);
  }
  expect(await panelsOfInstallers()).toBeGreaterThan(0);
  for (const period of ['Месяц', 'Квартал', 'Год']) {
    await drill.getByRole('button', { name: period, exact: true }).click();
    expect(await panelsOfInstallers()).toBeGreaterThan(0);
  }
  await drill.screenshot({
    path: '/opt/cursor/artifacts/screenshots/analytics-reload-straight-why-zero.png',
  });
  await page.goBack();
  await expect(page).not.toHaveURL(/#analytics\//);

  await page.getByRole('button', { name: /^Сотрудники/ }).first().click();
  const staff = page.getByRole('region', { name: 'Сотрудники' });
  const staffWhy = staff.getByTestId('why-zero');
  await expect(staffWhy).toContainText(`Комнат ${COMPANY_ROOMS}`);
  await staff.getByRole('tab', { name: 'Замерщики' }).click();
  const measurer = staff.getByRole('button', { name: /Замерщик · Потолки Столицы/ });
  await expect(measurer).toBeVisible();
  await expect(measurer).not.toContainText('Замеры 0');
  await expect(measurer).toContainText('1433.5');
  await staff.getByRole('tab', { name: 'Менеджеры' }).click();
  const manager = staff.getByRole('button', { name: /Менеджер · Потолки Столицы/ });
  await expect(manager).toBeVisible();
  const listed = Number((await manager.innerText()).match(/проекты\s+(\d+)/)?.[1] || '0');
  expect(listed).toBeGreaterThan(0);
  await manager.click();
  await expect(page).toHaveURL(/#analytics\/staff\//);
  await expect(staff.getByRole('heading', { name: 'Топ проектов' })).toBeVisible();
  const top = staff.getByRole('button').filter({ hasText: /м²/ });
  await expect.poll(async () => top.count()).toBe(listed);
  await expect(top.filter({ hasText: 'Никитин И.' })).toContainText('24');
  await expect(top.filter({ hasText: 'Морозова Е.' })).toBeVisible();
  await expect(top.filter({ hasText: 'Вася' })).toBeVisible();
  await expect(staff.getByText('Проекты', { exact: true }).locator('xpath=following-sibling::strong')).toHaveText(
    String(listed),
  );
  await staff.screenshot({
    path: '/opt/cursor/artifacts/screenshots/analytics-reload-straight-top.png',
  });
  await top.filter({ hasText: 'Никитин И.' }).click();
  const card = page.getByRole('region', { name: 'Комната' });
  await expect(card).toBeVisible();
  await expect(card).toContainText('Никитин И.');
  await expect(page).not.toHaveURL(/#project\//);
  await page.goBack();
  await expect(page).toHaveURL(/#analytics\/staff\//);
  await context.close();
});
