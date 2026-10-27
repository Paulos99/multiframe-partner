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

test('короткий архив остаётся в хранилище, а месяц, квартал и год расходятся при чтении', async ({ page }) => {
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
      object: { areaM2: 10, panels: 4, roomType: 'kitchen' },
    },
    {
      id: 'ae_kept_custom',
      at: noonDaysAgo(2),
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
  expect(migrated.span).toBeLessThan(40 * 24 * 60 * 60 * 1000);
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
  const monthFunnel = (await drill.locator('text=/Открыли:/').allInnerTexts()).join('\n');
  await drill.getByRole('button', { name: 'Квартал', exact: true }).click();
  await expect.poll(async () => (await monthRows()).join('\n')).not.toBe(monthText);
  const quarterText = (await monthRows()).join('\n');
  await drill.getByRole('button', { name: 'Год', exact: true }).click();
  await expect.poll(async () => (await monthRows()).join('\n')).not.toBe(quarterText);
  await expect.poll(async () => (await drill.locator('text=/Открыли:/').allInnerTexts()).join('\n')).not.toBe(monthFunnel);
  await expect.poll(async () => tile.innerText()).toBe(tileText);

  await drill.getByRole('tab', { name: 'Менеджеры' }).click();
  await drill.getByRole('button', { name: /Менеджер · Потолки Столицы/ }).first().click();
  await expect(drill.getByRole('heading', { name: 'Топ проектов' })).toBeVisible();
  await expect(drill.getByText('За период проектов нет')).toHaveCount(0);
  await expect.poll(async () => {
    const text = await drill.innerText();
    return ['Иванова А.', 'Петров С.', 'Сидорова М.', 'Козлов Д.', 'Морозова Е.', 'Никитин И.'].some((name) =>
      text.includes(name),
    );
  }).toBe(true);

  await drill.getByRole('button', { name: 'Назад', exact: true }).click();
  await drill.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await page.getByRole('button', { name: /Панели/ }).first().click();
  const panels = page.getByRole('dialog', { name: 'Панели' });
  await panels.getByRole('tab', { name: 'Монтажники' }).click();
  await panels.getByRole('button', { name: 'Месяц', exact: true }).click();
  const mounted = panels.getByRole('button').filter({ hasText: 'Смонтировано' });
  await expect.poll(async () => mounted.count()).toBeGreaterThan(1);
  await expect.poll(async () => (await mounted.allInnerTexts()).join('\n')).not.toContain('Смонтировано 0');
  const ranked = (await mounted.allInnerTexts()).map((row) => {
    const value = rowNumber(row);
    const panelsInLine = Number(row.match(/панели\s+(\d+(?:[.,]\d+)?)/)?.[1]?.replace(',', '.') || '');
    return { value, panelsInLine };
  });
  expect(ranked.every((row) => row.value === row.panelsInLine && row.value > 0)).toBe(true);
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

test('накопленное хранилище: старые id, без вспышки цифр, период помнится', async ({ page }) => {
  const at = noonDaysAgo;
  const room = {
    id: 'room_click',
    orgId: 'org_demo',
    projectId: 'room_click',
    createdAt: at(12),
    updatedAt: at(1),
    createdBy: 'u_partner1',
    assignedTo: 'u_measurer1',
    status: 'quote_sent',
    clientName: 'Старая гостиная',
    clientPhone: '',
    address: 'ул. Арбат, 12',
    city: 'Москва',
    room: { roomType: 'living', areaM2: 18 },
    estimate: { panels: 44, dowels: 0, panelsCost: 0, installCost: 0, dowelsCost: 0, totalCost: 0 },
    clientSummary: 'Старая гостиная',
    history: [],
  };
  const mount = {
    ...room,
    id: 'room_mount',
    projectId: 'room_mount',
    status: 'install',
    assignedTo: 'u_crew1',
    clientName: 'Смонтированная',
    clientSummary: 'Смонтированная',
    updatedAt: at(2),
    room: { roomType: 'bedroom', areaM2: 22 },
    estimate: { panels: 54, dowels: 0, panelsCost: 0, installCost: 0, dowelsCost: 0, totalCost: 0 },
  };
  const mountSecond = {
    ...mount,
    id: 'room_mount_b',
    projectId: 'room_mount_b',
    assignedTo: 'u_crew1b',
    clientName: 'Вторая бригада',
    clientSummary: 'Вторая бригада',
    updatedAt: at(1),
    room: { roomType: 'living', areaM2: 9 },
    estimate: { panels: 12, dowels: 0, panelsCost: 0, installCost: 0, dowelsCost: 0, totalCost: 0 },
  };
  const mountQuarter = {
    ...mount,
    id: 'room_mount_quarter',
    projectId: 'room_mount_quarter',
    updatedAt: at(45),
    clientName: 'Квартальный монтаж',
    clientSummary: 'Квартальный монтаж',
    room: { roomType: 'kitchen', areaM2: 11 },
    estimate: { panels: 20, dowels: 0, panelsCost: 0, installCost: 0, dowelsCost: 0, totalCost: 0 },
  };
  const mountYear = {
    ...mountSecond,
    id: 'room_mount_year',
    projectId: 'room_mount_year',
    updatedAt: at(200),
    clientName: 'Годовой монтаж',
    clientSummary: 'Годовой монтаж',
    room: { roomType: 'office', areaM2: 13 },
    estimate: { panels: 18, dowels: 0, panelsCost: 0, installCost: 0, dowelsCost: 0, totalCost: 0 },
  };
  const users = [
    { id: 'u_partner1', login: 'partner1', password: 'demo1234', role: 'owner', displayName: 'Владелец', orgId: 'org_demo', createdAt: at(40) },
    { id: 'u_fresh_sales', login: 'sales1', password: 'exec1234', role: 'manager', displayName: 'Менеджер', orgId: 'org_demo', createdAt: at(40) },
    { id: 'u_fresh_exec', login: 'exec1', password: 'exec1234', role: 'executor', displayName: 'Замерщик', orgId: 'org_demo', createdAt: at(40) },
    { id: 'u_fresh_crew', login: 'crew1', password: 'exec1234', role: 'installer', displayName: 'Монтажник', orgId: 'org_demo', createdAt: at(40) },
    { id: 'u_fresh_crew_b', login: 'crew1b', password: 'exec1234', role: 'installer', displayName: 'Монтажник 2', orgId: 'org_demo', createdAt: at(40) },
  ];
  const org = (id: string, companyName: string, city: string) => ({
    id,
    createdAt: at(40),
    createdBy: 'u_admin',
    settings: { companyName, city, panelPriceRub: 1000, pricePerM2: 1000, installPricePerM2: 500, dowelsPerPanel: 2, dowelPriceRub: 10 },
  });
  const events = [1, 40, 200].map((day) => ({
    id: `ae_legacy_sales_${day}`,
    at: at(day),
    orgId: 'org_demo',
    userId: 'u_sales_old',
    login: 'sales1',
    role: 'manager',
    companyName: 'Потолки Столицы',
    tool: 'calculator',
    action: 'calc_done',
    object: { areaM2: 100 + day, panels: 40, clientName: 'Старая гостиная' },
  }));
  await page.addInitScript(
    ({ historyKey, analyticsKey, sessionKey, dbKey, periodKey, stored, db }) => {
      localStorage.setItem(historyKey, '1');
      if (sessionStorage.getItem('mf_e2e_period_guard') !== '1') {
        localStorage.removeItem(periodKey);
        sessionStorage.setItem('mf_e2e_period_guard', '1');
      }
      localStorage.setItem(analyticsKey, JSON.stringify(stored));
      localStorage.setItem(dbKey, JSON.stringify(db));
      localStorage.setItem(
        sessionKey,
        JSON.stringify({ id: 'u_partner1', login: 'partner1', role: 'owner', displayName: 'Владелец', orgId: 'org_demo', org: null }),
      );
    },
    {
      historyKey: HISTORY_RESET,
      analyticsKey: ANALYTICS,
      sessionKey: SESSION,
      dbKey: 'mf_partner_db_v5',
      periodKey: 'mf_partner_analytics_period_v1',
      stored: events,
      db: {
        users,
        orgs: [org('org_demo', 'Потолки Столицы', 'Москва'), org('org_demo_spb', 'Северный Потолок', 'Санкт-Петербург')],
        links: [],
        activity: [],
        objects: [room, mount, mountSecond, mountQuarter, mountYear],
        projects: [],
      },
    },
  );

  await page.goto('/');
  await expect(page.getByRole('complementary', { name: 'Разделы кабинета' })).toBeVisible();
  await page.getByRole('tab', { name: 'Аналитика', exact: true }).click();
  const tile = page.getByRole('button', { name: /Площадь, м²/ }).first();
  await expect(tile).toBeVisible();
  const firstTile = await tile.innerText();
  expect(tileNumber(firstTile)).toBeGreaterThan(0);
  await page.waitForTimeout(1200);
  expect(await tile.innerText()).toBe(firstTile);

  await page.getByRole('button', { name: /Панели/ }).first().click();
  const panels = page.getByRole('dialog', { name: 'Панели' });
  await panels.getByRole('tab', { name: 'Монтажники' }).click();
  const mounted = () => panels.getByRole('button').filter({ hasText: 'Смонтировано' });
  await expect.poll(async () => mounted().count()).toBe(2);
  const lines = async () => (await mounted().allInnerTexts()).join('\n');
  await panels.getByRole('button', { name: 'Месяц', exact: true }).click();
  await expect.poll(async () => lines()).not.toContain('Смонтировано 0');
  const monthText = await lines();
  await panels.getByRole('button', { name: 'Квартал', exact: true }).click();
  await expect.poll(async () => lines()).not.toBe(monthText);
  const quarterText = await lines();
  await panels.getByRole('button', { name: 'Год', exact: true }).click();
  await expect.poll(async () => lines()).not.toBe(quarterText);
  expect(await lines()).not.toContain('Смонтировано 0');
  await panels.getByRole('button', { name: 'Закрыть', exact: true }).click();

  await tile.click();
  const drill = page.getByRole('dialog', { name: 'Площадь, м²' });
  await drill.getByRole('tab', { name: 'Менеджеры' }).click();
  await drill.getByRole('button', { name: 'Год', exact: true }).click();
  await drill.getByRole('button', { name: /Менеджер/ }).first().click();
  await expect(drill.getByRole('heading', { name: 'Топ проектов' })).toBeVisible();
  await expect(drill.getByText('За период проектов нет')).toHaveCount(0);
  await expect(drill.getByText(/проекты 0/)).toHaveCount(0);
  await drill.getByRole('button', { name: /Старая гостиная/ }).first().click();
  await expect(page.getByRole('dialog', { name: 'Комната' }).getByRole('heading', { name: 'Старая гостиная' })).toBeVisible();
  await page.getByRole('dialog', { name: 'Комната' }).getByRole('button', { name: 'Закрыть', exact: true }).click();

  await page.getByRole('tab', { name: 'Аналитика', exact: true }).click();
  const trigger = page.getByRole('group', { name: 'Период аналитики' }).getByRole('button');
  const before = (await trigger.innerText()).trim();
  await trigger.click();
  await page.getByRole('dialog', { name: 'Период' }).getByRole('button', { name: '30 дней', exact: true }).click();
  await expect.poll(async () => (await trigger.innerText()).trim()).not.toBe(before);
  const saved = (await trigger.innerText()).trim();
  await page.reload();
  await expect(page.getByRole('complementary', { name: 'Разделы кабинета' })).toBeVisible();
  await page.getByRole('tab', { name: 'Аналитика', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Период аналитики' }).getByRole('button')).toHaveText(saved);
});

test('вход владельца через интерфейс: монтажники и топ проектов с доски', async ({ page }) => {
  await page.route('**/auth/login', (route) => route.abort());
  await page.route('**/auth/me', (route) => route.abort());

  async function signIn(login: string, password: string) {
    await page.getByLabel('Логин', { exact: true }).fill(login);
    await page.getByLabel('Пароль', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Войти', exact: true }).click();
    await expect(page.getByRole('complementary', { name: 'Разделы кабинета' })).toBeVisible();
  }

  await page.goto('/');
  await signIn('exec1', 'exec1234');
  await page.getByRole('button', { name: 'Выйти', exact: true }).click();
  await expect(page.getByLabel('Логин', { exact: true })).toBeVisible();
  await signIn('partner1', 'demo1234');

  await page.getByRole('tab', { name: 'Аналитика', exact: true }).click();
  await page.getByRole('button', { name: /Панели/ }).first().click();
  const panels = page.getByRole('dialog', { name: 'Панели' });
  await panels.getByRole('tab', { name: 'Монтажники' }).click();
  const mounted = () => panels.getByRole('button').filter({ hasText: 'Смонтировано' });
  await expect.poll(async () => mounted().count()).toBe(2);
  for (const period of ['Месяц', 'Квартал', 'Год'] as const) {
    await panels.getByRole('button', { name: period, exact: true }).click();
    await expect.poll(async () => mounted().count()).toBe(2);
    const lines = await mounted().allInnerTexts();
    expect(lines.join('\n'), period).not.toContain('Смонтировано 0');
    expect(lines.some((line) => line.includes('Монтажник 2'))).toBe(true);
    expect(lines.some((line) => /Монтажник(?! 2)/.test(line))).toBe(true);
  }
  await panels.screenshot({ path: '/opt/cursor/artifacts/screenshots/analytics-installers.png' });
  await panels.getByRole('button', { name: 'Закрыть', exact: true }).click();

  await page.getByRole('button', { name: /Площадь, м²/ }).first().click();
  const drill = page.getByRole('dialog', { name: 'Площадь, м²' });
  await drill.getByRole('tab', { name: 'Менеджеры' }).click();
  await drill.getByRole('button', { name: 'Месяц', exact: true }).click();
  await drill.getByRole('button', { name: /Менеджер · Потолки Столицы/ }).first().click();
  await expect(drill.getByRole('heading', { name: 'Топ проектов' })).toBeVisible();
  await expect(drill.getByText('За период проектов нет')).toHaveCount(0);
  await expect(drill.getByText(/проекты 0/)).toHaveCount(0);
  await expect(drill.getByText('Проекты', { exact: true }).locator('xpath=..')).toContainText('11');
  const project = drill.getByRole('button', { name: /Козлов Д\./ });
  await expect(project).toBeVisible();
  await drill.screenshot({ path: '/opt/cursor/artifacts/screenshots/analytics-manager-projects.png' });
  await project.click();
  await expect(page.getByRole('dialog', { name: 'Комната' }).getByRole('heading', { name: 'Козлов Д.' })).toBeVisible();
});
