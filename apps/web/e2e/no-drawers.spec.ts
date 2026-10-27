import { expect, test, type Page } from '@playwright/test';

const password = 'ui-fixture-password-only';
const roles = ['admin', 'owner', 'sales', 'measurer', 'crew'] as const;

test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:4181/__reset');
});

async function noDrawers(page: Page, where: string) {
  await expect(page.locator('[class*="drawer" i]'), where).toHaveCount(0);
}

for (const role of roles) {
  test(`${role}: в разделах кабинета нет боковых панелей`, async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Логин', { exact: true }).fill(`ui.${role}`);
    await page.getByLabel('Пароль', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Войти', exact: true }).click();
    const nav = page.getByRole('complementary', { name: 'Разделы кабинета' });
    await expect(nav).toBeVisible();
    const tabs = nav.getByRole('tab');
    const count = await tabs.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i += 1) {
      const tab = tabs.nth(i);
      const name = ((await tab.innerText()) || (await tab.getAttribute('aria-label')) || '').trim();
      await tab.click();
      await noDrawers(page, `${role} · ${name}`);
    }

    if (role === 'owner') {
      await nav.getByRole('tab', { name: 'Сотрудники', exact: true }).click();
      await page.getByRole('button', { name: /UI sales/ }).click();
      await expect(page).toHaveURL(/#staff\//);
      await expect(page.getByRole('region', { name: 'Сотрудник' })).toBeVisible();
      await noDrawers(page, 'карточка сотрудника');

      await nav.getByRole('tab', { name: 'Проекты', exact: true }).click();
      await page.getByRole('button', { name: 'Тестовая квартира', exact: true }).click();
      await expect(page).toHaveURL(/#project\/ui_project\/overview$/);
      await noDrawers(page, 'страница проекта');
      await page.getByRole('tab', { name: 'Рабочая информация', exact: true }).click();
      await page.getByRole('button', { name: 'Спальня' }).click();
      await expect(page).toHaveURL(/#project\/ui_project\/room\//);
      await noDrawers(page, 'страница комнаты');
    }
  });
}
