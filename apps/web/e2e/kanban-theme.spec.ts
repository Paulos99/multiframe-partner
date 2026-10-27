import { test, expect, type Page } from '@playwright/test';

test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:4181/__reset');
});

async function enter(page: Page) {
  await page.goto('/');
  await page.getByLabel('Логин', { exact: true }).fill('ui.owner');
  await page.getByLabel('Пароль', { exact: true }).fill('ui-fixture-password-only');
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await page.getByRole('tab', { name: 'Проекты', exact: true }).click();
}

test('projects page has no room stage board', async ({ page }) => {
  await enter(page);
  await expect(page.getByRole('heading', { name: 'Проекты', exact: true })).toBeVisible();
  await expect(page.getByText('Комнаты по стадиям')).toHaveCount(0);
  await expect(page.locator('[aria-label="Доска проектов"]')).toHaveCount(0);
  await expect(page.locator('[data-kanban-stage]')).toHaveCount(0);
  await expect(page.locator('[data-room-id]')).toHaveCount(0);
  await expect(page.locator('#kanban-help')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Фильтры' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Сортировка/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Тестовая квартира', exact: true }).click();
  const card = page.getByRole('dialog', { name: 'Карточка проекта' });
  await card.getByRole('tab', { name: 'Рабочая информация', exact: true }).click();
  await expect(card.getByRole('button', { name: 'Спальня' })).toBeVisible();
});
