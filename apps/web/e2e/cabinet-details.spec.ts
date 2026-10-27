import { test, expect, type Page } from '@playwright/test';
import { openProjectRoom } from './open-room';

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

test('карточка сотрудника открывается страницей и возвращается назад', async ({ page }) => {
  await enter(page);
  await page.getByRole('tab', { name: 'Сотрудники', exact: true }).click();
  await page.getByRole('button', { name: /UI sales/ }).click();
  await expect(page).toHaveURL(/#staff\//);
  const card = page.getByRole('region', { name: 'Сотрудник' });
  await expect(card.getByRole('heading', { level: 1, name: 'UI sales' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'UI sales' })).toHaveCount(0);
  await expect(page.locator('[class*="drawer" i]')).toHaveCount(0);
  await page.reload();
  await expect(page).toHaveURL(/#staff\//);
  await expect(card.getByRole('heading', { level: 1, name: 'UI sales' })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Сотрудники', exact: true })).toBeVisible();
  await expect(page).not.toHaveURL(/#staff\//);
  await expect(page.getByRole('tab', { name: 'Сотрудники', exact: true })).toHaveAttribute('aria-selected', 'true');
});

test('у новой комнаты написано, что площадь не указана', async ({ page }) => {
  await enter(page);
  await page.getByRole('tab', { name: 'Проекты', exact: true }).click();
  const { drawer } = await openProjectRoom(page, 'Спальня');
  await drawer.getByLabel('Новая комната').fill('Кладовая');
  await drawer.getByRole('button', { name: 'Добавить комнату', exact: true }).click();
  await expect(drawer.getByText('Кладовая')).toBeVisible();
  await expect(drawer.getByText(/площадь не указана/i).first()).toBeVisible();
  await expect(drawer.getByText('— м²')).toHaveCount(0);
  await expect(drawer.getByText(/Задайте её в Проблемомере/)).toBeVisible();
  await drawer.getByRole('button', { name: 'Указать площадь в Проблемомере', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Начать', exact: true })).toBeVisible();
});
