import { test, expect, type Page } from '@playwright/test';

// Кабинет с сервером (как боевой): демо-база браузера не должна попадать в аналитику.
const API = 'http://127.0.0.1:4181';
const password = 'ui-fixture-password-only';
const DEMO_NAMES = /Крылова|Лебедев|Павел Орлов|Дмитрий Волков|Андрей Соколов/;

test.beforeEach(async ({ request }) => {
  await request.post(`${API}/__reset`);
});

async function enter(page: Page, login: string) {
  await page.goto('/');
  await page.getByLabel('Логин', { exact: true }).fill(login);
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Разделы кабинета' })).toBeVisible();
}

for (const login of ['ui.admin', 'ui.owner']) {
  test(`${login}: в аналитике и рейтинге сотрудников нет демо-людей`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await enter(page, login);
    await page.getByRole('tab', { name: 'Аналитика', exact: true }).click();
    const root = page.locator('[data-analytics-root]');
    await expect(root).toBeVisible({ timeout: 30000 });
    await expect(root).toHaveAttribute('data-analytics-busy', '0', { timeout: 30000 });
    await expect(root).not.toContainText(DEMO_NAMES);
    // Рейтинг «Сотрудники» строится из того же набора, что и плитки.
    await page.evaluate(() => {
      window.location.hash = '#analytics/rating/staff';
    });
    await expect(page.locator('body')).not.toContainText(DEMO_NAMES);
    await expect(page.locator('body')).not.toContainText('За период нет данных по этому показателю');
  });
}
