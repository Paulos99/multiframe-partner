import { test, expect, type Page } from '@playwright/test';
import { openProjectRoom } from './open-room';

const password = 'ui-fixture-password-only';

test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:4181/__reset');
});

async function enter(page: Page) {
  await page.goto('/');
  await page.getByLabel('Логин', { exact: true }).fill('ui.crew');
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Проекты', exact: true })).toBeVisible();
}

test('монтажник видит цены в комнате, на странице проекта и в калькуляторе', async ({ page }) => {
  await enter(page);
  await page.getByRole('tab', { name: 'Проекты', exact: true }).click();
  const { drawer } = await openProjectRoom(page, 'Гостиная');
  await expect(drawer).toBeVisible();
  await expect(drawer.locator('[data-room-facts]').getByText('Итого комнаты', { exact: true })).toBeVisible();
  await expect(drawer.locator('[data-room-facts]')).toContainText('₽');

  await drawer.getByRole('button', { name: 'Калькулятор', exact: true }).click();
  const frame = page.locator('iframe[title="Калькулятор MultiFrame · партнёр"]');
  await expect(frame).toBeVisible();
  await expect(frame).not.toHaveAttribute('src', /hidePrices=1/);
  const calc = page.frameLocator('iframe[title="Калькулятор MultiFrame · партнёр"]');
  await expect(calc.locator('body')).not.toHaveClass(/hide-prices/);
  await expect(calc.locator('#areaOnlyInput')).toHaveValue(/24/);
  await expect(calc.locator('#totalPanels')).not.toHaveText('0 шт.', { timeout: 20000 });
  await expect(calc.locator('body')).toContainText('₽');

  await page.locator('button[aria-label="Кабинет"]').click();
  const room = page.getByRole('region', { name: 'Комната' });
  await expect(room).toBeVisible();
  await room.getByRole('button', { name: 'К проекту', exact: true }).click();
  const card = page.getByRole('region', { name: 'Проект', exact: true });
  await card.getByRole('tab', { name: 'Обзор', exact: true }).click();
  await expect(card.locator('[data-facts]').getByText('Сумма', { exact: true })).toBeVisible();
  // Ссылку клиента монтажнику по-прежнему не отдаём.
  await expect(page.getByRole('button', { name: 'Ссылка для клиента', exact: true })).toHaveCount(0);
});
