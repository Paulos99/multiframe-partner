import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { playDrillCard } from './trainer-helpers';

const API = 'http://127.0.0.1:4181';
const password = 'ui-fixture-password-only';

test.beforeEach(async ({ request }) => {
  await request.post(`${API}/__reset`);
});

async function tokenOf(request: APIRequestContext, login: string): Promise<string> {
  const res = await request.post(`${API}/auth/login`, { data: { login, password } });
  expect(res.ok()).toBeTruthy();
  return ((await res.json()) as { token: string }).token;
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

function attempt(id: string, share: number, reasonKey = 'price_too_high') {
  const now = new Date().toISOString();
  return {
    id,
    mode: 'objection',
    scheme: 2,
    itemIds: ['obj-price-expensive'],
    startedAt: now,
    finishedAt: now,
    firstTryCorrect: share,
    count: 5,
    total: 4,
    passed: share >= 0.8,
    criteria: { value: 3 },
    misses: share < 1 ? [{ objectionId: 'obj-price-expensive', reasonKey, errorType: 'vague', violates: 'value' }] : [],
  };
}

async function push(request: APIRequestContext, login: string, attempts: unknown[], materials: unknown[] = []) {
  const res = await request.post(`${API}/training/sync`, { headers: auth(await tokenOf(request, login)), data: { attempts, materials } });
  return res;
}

async function enter(page: Page, login: string) {
  await page.goto('/');
  await page.getByLabel('Логин', { exact: true }).fill(login);
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Разделы кабинета' })).toBeVisible();
}

async function openTrainingTab(page: Page) {
  await page.getByRole('complementary', { name: 'Разделы кабинета' }).getByRole('tab', { name: 'Аналитика', exact: true }).click();
  await page.getByRole('tablist', { name: 'Разделы аналитики' }).getByRole('tab', { name: 'Обучение', exact: true }).click();
  await expect(page.getByTestId('training-tab')).toBeVisible();
}

async function noDrawers(page: Page, where: string) {
  await expect(page.locator('[class*="drawer" i]'), where).toHaveCount(0);
}

test('API: запись идемпотентна, чужое обучение закрыто по ролям', async ({ request }) => {
  const mine = [attempt('e2e-a1', 0.6), attempt('e2e-a2', 1)];
  const first = await (await push(request, 'ui.sales', mine, [{ id: 'e2e-m1', materialId: 'mat1', title: 'Монтаж панелей', at: new Date().toISOString() }])).json();
  expect(first.acceptedAttemptIds).toEqual(['e2e-a1', 'e2e-a2']);
  const again = await (await push(request, 'ui.sales', mine)).json();
  expect(again.acceptedAttemptIds).toEqual(['e2e-a1', 'e2e-a2']);
  expect((await push(request, 'ui.sales_b', [attempt('e2e-b1', 0.5)])).ok()).toBeTruthy();

  const sales = auth(await tokenOf(request, 'ui.sales'));
  const me = await (await request.get(`${API}/training/me`, { headers: sales })).json();
  expect(me.summary.sets).toBe(2);
  // Менеджер не видит ни таблицу, ни чужих сотрудников, ни компании.
  expect((await request.get(`${API}/training/org`, { headers: sales })).status()).toBe(403);
  expect((await request.get(`${API}/training/companies`, { headers: sales })).status()).toBe(403);
  expect((await request.get(`${API}/training/user/ui_sales_b`, { headers: sales })).status()).toBe(403);
  expect((await request.get(`${API}/training/user/ui_sales`, { headers: sales })).status()).toBe(200);
  // Монтажник и замерщик тоже: только своё.
  for (const login of ['ui.crew', 'ui.measurer']) {
    const h = auth(await tokenOf(request, login));
    expect((await request.get(`${API}/training/org`, { headers: h })).status()).toBe(403);
    expect((await request.get(`${API}/training/user/ui_sales`, { headers: h })).status()).toBe(403);
  }

  // Владелец: только своя компания.
  const owner = auth(await tokenOf(request, 'ui.owner'));
  const org = await (await request.get(`${API}/training/org`, { headers: owner })).json();
  expect(org.org.id).toBe('ui_org');
  const ids = org.employees.map((e: { id: string }) => e.id);
  expect(ids).toContain('ui_sales');
  expect(ids).not.toContain('ui_sales_b');
  expect((await request.get(`${API}/training/org?orgId=ui_org_b`, { headers: owner })).status()).toBe(403);
  expect((await request.get(`${API}/training/user/ui_sales_b`, { headers: owner })).status()).toBe(404);
  expect((await request.get(`${API}/training/companies`, { headers: owner })).status()).toBe(403);
  const userView = await (await request.get(`${API}/training/user/ui_sales`, { headers: owner })).json();
  expect(userView.summary.sets).toBe(2);
  expect(userView.summary.recentMaterials[0].title).toBe('Монтаж панелей');

  // Администратор: все компании.
  const admin = auth(await tokenOf(request, 'ui.admin'));
  const companies = (await (await request.get(`${API}/training/companies`, { headers: admin })).json()).companies as { id: string }[];
  expect(companies.map((c) => c.id).sort()).toEqual(['ui_org', 'ui_org_b']);
  expect((await request.get(`${API}/training/user/ui_sales_b`, { headers: admin })).status()).toBe(200);
  expect((await request.get(`${API}/training/org?orgId=ui_org_b`, { headers: admin })).status()).toBe(200);
  expect((await request.post(`${API}/training/sync`, { headers: admin, data: { attempts: [attempt('x', 1)], materials: [] } })).status()).toBe(403);
  expect((await request.get(`${API}/training/org`)).status()).toBe(401);
});

test('менеджер проходит подход в тренажёре — владелец видит его в таблице обучения и открывает страницу', async ({ page, browser, request }) => {
  await enter(page, 'ui.sales');
  await page.getByRole('complementary', { name: 'Разделы кабинета' }).getByRole('tab', { name: 'Обучение', exact: true }).click();
  await page.getByRole('tab', { name: 'Тренажёр', exact: true }).click();
  await page.getByRole('button', { name: 'Подход на 5 минут', exact: true }).click();
  for (let i = 1; i <= 5; i += 1) {
    await expect(page.getByText(`Возражение ${i} из 5`)).toBeVisible();
    await playDrillCard(page, i === 1);
    await page.getByRole('region', { name: 'Итог карточки' }).getByRole('button', { name: i === 5 ? 'Закончить подход' : 'Следующее возражение', exact: true }).click();
  }
  await expect(page.getByRole('heading', { level: 3, name: 'Итог подхода' })).toBeVisible();
  const salesToken = await tokenOf(request, 'ui.sales');
  await expect
    .poll(async () => (await (await request.get(`${API}/training/me`, { headers: auth(salesToken) })).json()).summary.sets, { timeout: 15000 })
    .toBe(5);

  const ownerPage = await browser.newPage();
  await enter(ownerPage, 'ui.owner');
  await openTrainingTab(ownerPage);
  const row = ownerPage.getByTestId('training-row').filter({ hasText: 'UI sales' });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText(/Начинающий|Уверенный|Мастер/);
  await expect(row.locator('td').nth(3)).toHaveText('5');
  await expect(ownerPage.getByTestId('training-row').filter({ hasText: 'UI sales_b' })).toHaveCount(0);
  await noDrawers(ownerPage, 'таблица обучения');
  await row.getByRole('button', { name: /Обучение: UI sales/ }).click();
  await expect(ownerPage).toHaveURL(/#analytics\/training\/ui_sales$/);
  const pageRegion = ownerPage.getByRole('region', { name: 'Обучение сотрудника' });
  await expect(pageRegion).toContainText('UI sales');
  await expect(pageRegion).toContainText('Последние попытки');
  await expect(ownerPage.getByTestId('training-attempts')).toContainText('Быстрая отработка');
  await noDrawers(ownerPage, 'страница сотрудника');
  await ownerPage.getByRole('button', { name: 'Назад', exact: true }).click();
  await expect(ownerPage.getByTestId('training-tab')).toBeVisible();
  await ownerPage.close();
});

test('без сети попытки копятся в очереди и уходят на сервер один раз', async ({ page, context, request }) => {
  await enter(page, 'ui.sales');
  await page.getByRole('complementary', { name: 'Разделы кабинета' }).getByRole('tab', { name: 'Обучение', exact: true }).click();
  await page.getByRole('tab', { name: 'Тренажёр', exact: true }).click();
  await page.getByRole('button', { name: 'Подход на 5 минут', exact: true }).click();
  await expect(page.getByText('Возражение 1 из 5')).toBeVisible();
  await context.setOffline(true);
  for (let i = 1; i <= 5; i += 1) {
    await playDrillCard(page);
    await page.getByRole('region', { name: 'Итог карточки' }).getByRole('button', { name: i === 5 ? 'Закончить подход' : 'Следующее возражение', exact: true }).click();
  }
  await expect(page.getByRole('heading', { level: 3, name: 'Итог подхода' })).toBeVisible();
  const salesToken = await tokenOf(request, 'ui.sales');
  const sets = async () => (await (await request.get(`${API}/training/me`, { headers: auth(salesToken) })).json()).summary.sets as number;
  expect(await sets()).toBe(0);
  await context.setOffline(false);
  await expect.poll(sets, { timeout: 20000 }).toBe(5);
  await page.reload();
  await page.waitForTimeout(1500);
  expect(await sets()).toBe(5);
});

test('владелец: вкладка «Обучение» только про свою компанию, чужая страница не открывается', async ({ page, request }) => {
  await push(request, 'ui.sales', [attempt('own-1', 0.9)]);
  await push(request, 'ui.sales_b', [attempt('b-1', 0.9)]);
  await enter(page, 'ui.owner_b');
  await openTrainingTab(page);
  await expect(page.getByTestId('training-row')).toHaveCount(1);
  await expect(page.getByTestId('training-employees')).toContainText('UI sales_b');
  await expect(page.getByTestId('training-employees')).not.toContainText(/UI sales(?!_b)/);
  await page.goto('/#analytics/training/ui_sales');
  await expect(page.getByRole('alert')).toContainText('не найден');
});

test('менеджер, монтажник и замерщик не видят вкладку «Обучение» в аналитике', async ({ page }) => {
  for (const login of ['ui.sales', 'ui.crew', 'ui.measurer']) {
    await enter(page, login);
    const nav = page.getByRole('complementary', { name: 'Разделы кабинета' });
    if (await nav.getByRole('tab', { name: 'Аналитика', exact: true }).count()) {
      await nav.getByRole('tab', { name: 'Аналитика', exact: true }).click();
      await expect(page.getByRole('tablist', { name: 'Разделы аналитики' }).getByRole('tab', { name: 'Обучение', exact: true })).toHaveCount(0);
    }
    await page.getByRole('button', { name: 'Выйти', exact: true }).click();
  }
});

test('администратор: сводка по компаниям, страница компании, страница сотрудника', async ({ page, request }) => {
  await push(request, 'ui.sales', [attempt('adm-1', 0.7), attempt('adm-2', 1)]);
  await push(request, 'ui.sales_b', [attempt('adm-b', 0.4, 'doubt_effect')]);
  await enter(page, 'ui.admin');
  await openTrainingTab(page);
  const companies = page.getByTestId('training-companies');
  await expect(companies).toContainText('UI test company');
  await expect(companies).toContainText('UI other company');
  await noDrawers(page, 'сводка по компаниям');
  await page.getByRole('button', { name: 'Обучение компании UI other company' }).click();
  await expect(page).toHaveURL(/#analytics\/training-company\/ui_org_b$/);
  const company = page.getByRole('region', { name: 'Обучение компании' });
  await expect(company).toContainText('UI other company');
  await expect(page.getByTestId('training-employees')).toContainText('UI sales_b');
  await expect(company).toContainText('Сомнения в эффекте');
  await noDrawers(page, 'страница компании');
  await page.getByRole('button', { name: /Обучение: UI sales_b/ }).click();
  await expect(page).toHaveURL(/#analytics\/training\/ui_sales_b$/);
  await expect(page.getByRole('region', { name: 'Обучение сотрудника' })).toContainText('UI other company');
  await page.reload();
  await expect(page.getByRole('region', { name: 'Обучение сотрудника' })).toContainText('UI sales_b');
  await page.goBack();
  await page.goBack();
  await expect(page.getByTestId('training-companies')).toBeVisible();
});

test('телефон 390×844: таблица обучения без горизонтальной прокрутки, цели нажатия не меньше 44 px', async ({ page, request }) => {
  await push(request, 'ui.sales', [attempt('m-1', 0.9)]);
  await page.setViewportSize({ width: 390, height: 844 });
  await enter(page, 'ui.owner');
  await openTrainingTab(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  const button = page.getByRole('button', { name: /Обучение: UI sales/ });
  const box = await button.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  await button.click();
  await expect(page.getByRole('region', { name: 'Обучение сотрудника' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  const back = await page.getByRole('button', { name: 'Назад', exact: true }).boundingBox();
  expect(back!.height).toBeGreaterThanOrEqual(44);
});
