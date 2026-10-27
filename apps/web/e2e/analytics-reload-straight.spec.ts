import { expect, test } from '@playwright/test';

const HISTORY_RESET = 'mf_partner_history_reset_v2';
const ANALYTICS = 'mf_partner_analytics_v1';
const SESSION = 'mf_partner_session_v2';
const PERIOD = 'mf_partner_analytics_period_v1';
const ORIGIN = 'http://127.0.0.1:4180';

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

  await page.goto('/?demo=1');
  await expect(page.getByRole('complementary', { name: 'Разделы кабинета' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('complementary', { name: 'Разделы кабинета' })).toBeVisible();

  await page.getByRole('tab', { name: 'Аналитика', exact: true }).click();
  await expect(page.getByText(/Сохранённая история/)).toBeVisible();
  const panelsTile = page.getByRole('button', { name: /^Панели/ }).first();
  const areaTile = page.getByRole('button', { name: /Площадь, м²/ }).first();
  await expect.poll(async () => tileNumber(await panelsTile.innerText())).toBe(5206);
  const areaOnTile = tileNumber(await areaTile.innerText());
  expect(areaOnTile).toBe(2403);

  await panelsTile.click();
  const why = page.getByRole('dialog', { name: 'Панели' }).getByTestId('why-zero');
  await expect(why).toBeVisible();
  const report = await why.innerText();
  const panelsInReport = paragraphTile(report, 'Плитка панелей');
  const areaInReport = paragraphTile(report, 'площадь');
  const tileNow = tileNumber(await panelsTile.innerText());
  expect(panelsInReport).toBe(tileNow);
  expect(areaInReport).toBe(areaOnTile);
  expect(tileNow).toBe(5206);
  await page.getByRole('dialog', { name: 'Панели' }).screenshot({
    path: '/opt/cursor/artifacts/screenshots/analytics-reload-straight-why-zero.png',
  });
  await context.close();
});
