import { test, expect, type Page } from '@playwright/test';

const password = 'ui-fixture-password-only';

test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:4181/__reset');
});

async function enter(page: Page) {
  await page.goto('/');
  await page.getByLabel('Логин', { exact: true }).fill('ui.owner');
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Проекты', exact: true })).toBeVisible();
}

test('карточка сотрудника закрывается по Esc', async ({ page }) => {
  await enter(page);
  await page.getByRole('tab', { name: 'Сотрудники', exact: true }).click();
  await page.getByRole('button', { name: /UI sales/ }).click();
  const card = page.getByRole('region', { name: 'UI sales' });
  await expect(card).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(card).toHaveCount(0);
});

test('у новой комнаты написано, что площадь не указана', async ({ page }) => {
  await enter(page);
  await page.getByRole('tab', { name: 'Проекты', exact: true }).click();
  await page.locator('[data-room-id="ui_room"]').click();
  const drawer = page.getByRole('region', { name: 'Комната' });
  await drawer.getByLabel('Новая комната').fill('Кладовая');
  await drawer.getByRole('button', { name: 'Добавить комнату', exact: true }).click();
  await expect(drawer.getByText('Кладовая')).toBeVisible();
  await expect(drawer.getByText(/площадь не указана/i).first()).toBeVisible();
  await expect(drawer.getByText('— м²')).toHaveCount(0);
});
