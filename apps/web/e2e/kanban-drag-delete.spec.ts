import { test, expect, type Page } from '@playwright/test';
import { openProjectRoom } from './open-room';

const password = 'ui-fixture-password-only';
test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:4181/__reset');
});
async function enter(page: Page, role = 'owner') {
  await page.goto('/');
  await page.getByLabel('Логин', { exact: true }).fill(`ui.${role}`);
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Мой профиль', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Проекты', exact: true }).click();
}

test('owner deletes a room from its card; it is gone after reload', async ({ page }) => {
  await enter(page);
  await expect(page.locator('[aria-label="Доска проектов"]')).toHaveCount(0);
  const { card, drawer } = await openProjectRoom(page, 'Спальня');
  await drawer.getByRole('button', { name: 'Удалить комнату', exact: true }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('Удалить комнату «');
  await expect(dialog).toContainText('Действие нельзя отменить');
  await dialog.getByRole('button', { name: 'Отмена' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(drawer.getByRole('heading', { level: 1, name: 'Спальня' })).toBeVisible();

  await drawer.getByRole('button', { name: 'Удалить комнату', exact: true }).click();
  const del = page.waitForRequest(
    (r) => r.method() === 'DELETE' && new URL(r.url()).pathname === '/objects/ui_room',
  );
  await page.getByRole('alertdialog').getByRole('button', { name: 'Удалить', exact: true }).click();
  await del;
  await expect(page.getByRole('status').filter({ hasText: 'Комната удалена' })).toBeVisible();
  await page.reload();
  await page.getByRole('tab', { name: 'Проекты', exact: true }).click();
  await page.getByRole('button', { name: 'Тестовая квартира', exact: true }).click();
  await card.getByRole('tab', { name: 'Комнаты', exact: true }).click();
  await expect(card.getByRole('button', { name: 'Кухня' })).toBeVisible();
  await expect(card.getByRole('button', { name: 'Спальня' })).toHaveCount(0);
});

test('crew has no delete action on a room', async ({ page }) => {
  await enter(page, 'crew');
  const { drawer } = await openProjectRoom(page, 'Гостиная');
  await expect(drawer.getByRole('button', { name: 'Удалить комнату', exact: true })).toHaveCount(0);
  await expect(drawer.getByRole('button', { name: 'Удалить проект', exact: true })).toHaveCount(0);
});
