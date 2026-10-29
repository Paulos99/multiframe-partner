import { test, expect, type Page } from '@playwright/test';

const password = 'ui-fixture-password-only';
type Mode = '401' | '403' | '502' | 'offline';

async function openMaterialsWith(page: Page, mode: Mode) {
  await page.route('http://127.0.0.1:4181/materials', (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    if (mode === 'offline') return route.abort('internetdisconnected');
    return route.fulfill({
      status: Number(mode),
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ message: 'x' }),
    });
  });
  await page.goto('/');
  await page.getByLabel('Логин', { exact: true }).fill('ui.owner');
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Разделы кабинета' })).toBeVisible();
  const training = page.getByRole('tab', { name: 'Обучение', exact: true });
  if (await training.count()) await training.click();
  else await page.getByRole('button', { name: 'Обучение', exact: true }).click();
}

test('материалы, 401: «Сессия истекла» с одной точкой и кнопкой «Войти заново»', async ({ page }) => {
  await openMaterialsWith(page, '401');
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Сессия истекла. Выйдите и войдите заново, чтобы открыть материалы.');
  await expect(page.getByTestId('materials-relogin')).toBeVisible();
  expect(await page.locator('body').innerText()).not.toContain('..');
});

test('материалы, 502: сервер недоступен, а не «сессия истекла»', async ({ page }) => {
  await openMaterialsWith(page, '502');
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Сервер материалов временно недоступен. Повторите позже.');
  await expect(alert).not.toContainText('Сессия истекла');
  await expect(page.getByTestId('materials-relogin')).toHaveCount(0);
});

test('материалы, 403: роль без доступа', async ({ page }) => {
  await openMaterialsWith(page, '403');
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Для вашей роли материалы недоступны');
  await expect(alert).not.toContainText('Сессия истекла');
});

test('материалы, обрыв сети: просьба проверить интернет, без «войдите заново»', async ({ page }) => {
  await openMaterialsWith(page, 'offline');
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Нет связи с сервером. Проверьте интернет и повторите.');
  await expect(alert).not.toContainText('Сессия истекла');
  await expect(page.getByTestId('materials-relogin')).toHaveCount(0);
  expect(await page.locator('body').innerText()).not.toContain('..');
});
