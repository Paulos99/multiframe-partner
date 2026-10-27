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

function tileNumber(text: string): number {
  const lines = text.split('\n').map((part) => part.trim()).filter(Boolean);
  const numeric = lines.find((line) => /^-?\d+(?:[.,]\d+)?$/.test(line));
  return numeric ? Number(numeric.replace(',', '.')) : Number.NaN;
}

function rowNumber(text: string): number {
  const line = text.split('\n').map((part) => part.trim()).filter(Boolean)[1] || '';
  const match = line.match(/-?\d+(?:[.,]\d+)?/);
  return match ? Number(match[0].replace(',', '.')) : Number.NaN;
}

test('схема до заморозки: владелец видит роли, сумма равна плитке', async ({ page }) => {
  const events = [
    {
      id: 'ae_legacy_measurer',
      at: noonDaysAgo(1),
      orgId: 'org_demo',
      userId: 'u_measurer1',
      login: 'exec1',
      role: 'executor',
      companyName: 'Потолки Столицы',
      tool: 'problemomer',
      action: 'result',
      object: { areaM2: 22, panels: 8, label: 'Кухня на Арбате' },
    },
    {
      id: 'ae_legacy_sales',
      at: noonDaysAgo(1),
      orgId: 'org_demo',
      userId: 'u_sales_old',
      login: 'sales1',
      role: 'manager',
      companyName: 'Потолки Столицы',
      tool: 'calculator',
      action: 'calc_done',
      object: { areaM2: 400, panels: 5, label: 'Офис на Патриарших' },
    },
    {
      id: 'ae_legacy_crew',
      at: noonDaysAgo(1),
      orgId: 'org_demo',
      userId: 'u_installer_old',
      login: 'crew1',
      role: 'installer',
      companyName: 'Потолки Столицы',
      tool: 'problemomer',
      action: 'result',
      object: { areaM2: 6, panels: 99 },
    },
    {
      id: 'ae_legacy_quarter',
      at: noonDaysAgo(40),
      orgId: 'org_demo',
      userId: 'u_sales_old',
      login: 'sales1',
      role: 'manager',
      companyName: 'Потолки Столицы',
      tool: 'problemomer',
      action: 'result',
      object: { areaM2: 30, panels: 10 },
    },
    {
      id: 'ae_legacy_year',
      at: noonDaysAgo(200),
      orgId: 'org_demo',
      userId: 'u_sales_old',
      login: 'sales1',
      role: 'manager',
      companyName: 'Потолки Столицы',
      tool: 'problemomer',
      action: 'result',
      object: { areaM2: 50, panels: 12 },
    },
    {
      id: 'ev_result_org_demo_0_0',
      at: noonDaysAgo(2),
      orgId: 'org_demo',
      userId: 'u_measurer1',
      login: 'exec1',
      role: 'executor',
      companyName: 'Потолки Столицы',
      tool: 'problemomer',
      action: 'result',
      object: { areaM2: 3, panels: 1 },
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
    { historyKey: HISTORY_RESET, analyticsKey: ANALYTICS, sessionKey: SESSION, stored: events },
  );

  await page.goto('/');
  await expect(page.getByRole('complementary', { name: 'Разделы кабинета' })).toBeVisible();
  const migrated = await page.evaluate((key) => localStorage.getItem(key), ANALYTICS);
  const parsed = JSON.parse(migrated || '[]') as Array<{ id?: string; at?: string }>;
  const stamps = parsed.map((event) => Date.parse(event.at || '')).filter((stamp) => !Number.isNaN(stamp));
  expect(Math.max(...stamps) - Math.min(...stamps)).toBeGreaterThan(300 * 24 * 60 * 60 * 1000);
  expect(parsed.some((event) => event.id === 'ae_legacy_measurer')).toBe(true);
  expect(parsed.some((event) => event.id === 'ae_legacy_year')).toBe(true);

  await page.reload();
  expect(await page.evaluate((key) => localStorage.getItem(key), ANALYTICS)).toBe(migrated);

  await page.getByRole('tab', { name: 'Аналитика', exact: true }).click();
  const tile = page.getByRole('button', { name: /Площадь, м²/ }).first();
  let settled = '';
  await expect.poll(async () => {
    const text = await tile.innerText();
    const ready = text === settled && tileNumber(text) > 0;
    settled = text;
    return ready;
  }).toBe(true);
  const tileText = await tile.innerText();
  await tile.click();
  const drill = page.getByRole('dialog', { name: 'Площадь, м²' });
  await expect(drill.getByRole('tab', { name: 'Менеджеры' })).toBeVisible();
  await expect(drill.getByRole('tab', { name: 'Замерщики' })).toBeVisible();
  await expect(drill.getByRole('tab', { name: 'Монтажники' })).toBeVisible();
  await expect.poll(async () => {
    const tabs = drill.getByRole('tab');
    const count = await tabs.count();
    let sum = 0;
    for (let index = 0; index < count; index += 1) {
      await tabs.nth(index).click();
      const rows = await drill.getByRole('button').filter({ hasText: /^\d+\./ }).allInnerTexts();
      if (!rows.length) return 0;
      sum += rows.reduce((total, row) => total + rowNumber(row), 0);
    }
    return Math.round(sum * 10) / 10;
  }).toBe(tileNumber(tileText));

  const periodRows = () => drill.getByRole('button').filter({ hasText: /^\d+\./ }).allInnerTexts();
  await drill.getByRole('tab', { name: 'Менеджеры' }).click();
  await drill.getByRole('button', { name: 'Месяц', exact: true }).click();
  await expect.poll(async () => (await periodRows()).length).toBeGreaterThan(0);
  const monthText = (await periodRows()).join('\n');
  await drill.getByRole('button', { name: 'Квартал', exact: true }).click();
  await expect.poll(async () => (await periodRows()).join('\n')).not.toBe(monthText);
  const quarterText = (await periodRows()).join('\n');
  await drill.getByRole('button', { name: 'Год', exact: true }).click();
  await expect.poll(async () => (await periodRows()).join('\n')).not.toBe(quarterText);
  await expect.poll(async () => tile.innerText()).toBe(tileText);

  await drill.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await page.getByRole('button', { name: /Панели/ }).first().click();
  const panels = page.getByRole('dialog', { name: 'Панели' });
  await panels.getByRole('tab', { name: 'Монтажники' }).click();
  const mounted = panels.getByRole('button').filter({ hasText: 'Смонтировано' });
  await expect.poll(async () => mounted.count()).toBeGreaterThan(0);
  const ranked = (await mounted.allInnerTexts()).map((row) => {
    const value = rowNumber(row);
    const panelsInLine = Number(row.match(/панели\s+(\d+(?:[.,]\d+)?)/)?.[1]?.replace(',', '.') || '');
    return { value, panelsInLine };
  });
  expect(ranked.every((row) => row.value === row.panelsInLine && row.value !== 99)).toBe(true);
  expect(ranked.some((row) => row.value > 0)).toBe(true);
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

test('менеджер из старой истории видит топ проектов своей команды', async ({ page }) => {
  const events = [
    {
      id: 'ae_legacy_sales',
      at: noonDaysAgo(1),
      orgId: 'org_demo',
      userId: 'u_sales_old',
      login: 'sales1',
      role: 'manager',
      companyName: 'Потолки Столицы',
      tool: 'calculator',
      action: 'calc_done',
      object: { areaM2: 400, panels: 5, label: 'Офис на Патриарших' },
    },
    {
      id: 'ae_legacy_measurer',
      at: noonDaysAgo(1),
      orgId: 'org_demo',
      userId: 'u_measurer1',
      login: 'exec1',
      role: 'executor',
      companyName: 'Потолки Столицы',
      tool: 'problemomer',
      action: 'result',
      object: { areaM2: 22, panels: 8 },
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
          id: 'u_sales1',
          login: 'sales1',
          role: 'sales',
          displayName: 'Менеджер',
          orgId: 'org_demo',
          org: null,
        }),
      );
    },
    { historyKey: HISTORY_RESET, analyticsKey: ANALYTICS, sessionKey: SESSION, stored: events },
  );
  await page.goto('/');
  await expect(page.getByRole('complementary', { name: 'Разделы кабинета' })).toBeVisible();
  await page.getByRole('tab', { name: 'Аналитика', exact: true }).click();
  await page.getByRole('button', { name: /Площадь, м²/ }).first().click();
  const drill = page.getByRole('dialog', { name: 'Площадь, м²' });
  await expect(drill.getByText('Моя команда')).toBeVisible();
  await expect(drill.getByRole('tab', { name: 'Менеджеры' })).toBeVisible();
  await expect(drill.getByRole('tab', { name: 'Замерщики' })).toBeVisible();
  await drill.getByRole('button', { name: /Менеджер · Потолки Столицы/ }).first().click();
  await expect(drill.getByRole('heading', { name: 'Топ проектов' })).toBeVisible();
  await expect(drill.getByText('За период проектов нет')).toHaveCount(0);
  await expect(drill.getByText('Офис на Патриарших')).toBeVisible();
});

test('сервер: реальные события с чужими id попадают в рейтинг', async ({ page, request }) => {
  expect((await request.post('http://127.0.0.1:4181/__reset')).ok()).toBeTruthy();
  function at(days: number) {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() - days);
    return date.toISOString();
  }
  function item(partial: Record<string, unknown>) {
    return {
      orgId: 'ui_org',
      companyName: 'UI test company',
      city: 'Москва',
      tool: 'problemomer',
      action: 'result',
      ...partial,
    };
  }
  expect(
    (
      await request.post('http://127.0.0.1:4181/analytics/events', {
        data: {
          events: [
            item({
              id: 'srv_sales',
              at: at(0),
              userId: 'legacy_sales',
              login: 'ui.sales',
              role: 'manager',
              tool: 'calculator',
              action: 'calc_done',
              object: { areaM2: 11, panels: 4, projectId: 'ui_project' },
            }),
            item({
              id: 'srv_measurer',
              at: at(0),
              userId: 'legacy_measurer',
              login: 'ui.measurer',
              role: 'executor',
              object: { areaM2: 13, panels: 5, label: 'Замер' },
            }),
            item({
              id: 'srv_crew',
              at: at(0),
              userId: 'legacy_crew',
              login: 'ui.crew',
              role: 'installer',
              object: { areaM2: 7, panels: 99 },
            }),
            item({
              id: 'srv_quarter',
              at: at(40),
              userId: 'legacy_sales',
              login: 'ui.sales',
              role: 'manager',
              object: { areaM2: 20, panels: 6, projectId: 'ui_project' },
            }),
            item({
              id: 'srv_year',
              at: at(200),
              userId: 'legacy_sales',
              login: 'ui.sales',
              role: 'manager',
              object: { areaM2: 40, panels: 8, projectId: 'ui_project' },
            }),
          ],
        },
      })
    ).ok(),
  ).toBeTruthy();

  async function enter(login: string) {
    await page.goto('/');
    await page.getByLabel('Логин', { exact: true }).fill(login);
    await page.getByLabel('Пароль', { exact: true }).fill('ui-fixture-password-only');
    await page.getByRole('button', { name: 'Войти', exact: true }).click();
    await expect(page.getByRole('complementary', { name: 'Разделы кабинета' })).toBeVisible();
  }

  await enter('ui.owner');
  await page.getByRole('tab', { name: 'Аналитика', exact: true }).click();
  const tile = page.getByRole('button', { name: /Площадь, м²/ }).first();
  await expect.poll(async () => tileNumber(await tile.innerText())).toBe(31);
  await tile.click();
  const drill = page.getByRole('dialog', { name: 'Площадь, м²' });
  await expect(drill.getByRole('tab', { name: 'Менеджеры' })).toBeVisible();
  await expect(drill.getByRole('tab', { name: 'Замерщики' })).toBeVisible();
  await expect(drill.getByRole('tab', { name: 'Монтажники' })).toBeVisible();
  const tabs = drill.getByRole('tab');
  const count = await tabs.count();
  let sum = 0;
  for (let index = 0; index < count; index += 1) {
    await tabs.nth(index).click();
    const rows = await drill.getByRole('button').filter({ hasText: /^\d+\./ }).allInnerTexts();
    sum += rows.reduce((total, row) => total + rowNumber(row), 0);
  }
  expect(Math.round(sum * 10) / 10).toBe(31);
  const periodRows = () => drill.getByRole('button').filter({ hasText: /^\d+\./ }).allInnerTexts();
  await drill.getByRole('tab', { name: 'Менеджеры' }).click();
  await drill.getByRole('button', { name: 'Месяц', exact: true }).click();
  await expect.poll(async () => (await periodRows()).length).toBeGreaterThan(0);
  const monthText = (await periodRows()).join('\n');
  await drill.getByRole('button', { name: 'Квартал', exact: true }).click();
  await expect.poll(async () => (await periodRows()).join('\n')).not.toBe(monthText);
  const quarterText = (await periodRows()).join('\n');
  await drill.getByRole('button', { name: 'Год', exact: true }).click();
  await expect.poll(async () => (await periodRows()).join('\n')).not.toBe(quarterText);
  await expect.poll(async () => tileNumber(await tile.innerText())).toBe(31);
  await drill.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await page.getByRole('button', { name: /Панели/ }).first().click();
  const panels = page.getByRole('dialog', { name: 'Панели' });
  await panels.getByRole('tab', { name: 'Монтажники' }).click();
  const crew = panels.getByRole('button', { name: /UI crew/ });
  await expect(crew).toContainText('Смонтировано');
  await expect(crew).toContainText('16');
  expect(rowNumber(await crew.innerText())).toBe(16);

  await page.getByRole('button', { name: 'Выйти', exact: true }).click();
  await enter('ui.sales');
  await page.getByRole('tab', { name: 'Аналитика', exact: true }).click();
  await page.getByRole('button', { name: /Площадь, м²/ }).first().click();
  const team = page.getByRole('dialog', { name: 'Площадь, м²' });
  await expect(team.getByText('Моя команда')).toBeVisible();
  await team.getByRole('button', { name: /UI sales/ }).click();
  await expect(team.getByRole('heading', { name: 'Топ проектов' })).toBeVisible();
  await expect(team.getByText('За период проектов нет')).toHaveCount(0);
  await expect(team.getByText('Тестовая квартира')).toBeVisible();
});
