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

test('монтажник не видит цены в комнате, калькуляторе и Проблемомере', async ({ page }) => {
  await enter(page);
  await page.getByRole('tab', { name: 'Проекты', exact: true }).click();
  const { drawer } = await openProjectRoom(page, 'Гостиная');
  await expect(drawer).toBeVisible();
  await expect(drawer).not.toContainText('₽');
  await expect(drawer.getByText('Итого комнаты')).toHaveCount(0);

  await drawer.getByRole('button', { name: 'Калькулятор', exact: true }).click();
  const frame = page.locator('iframe[title="Калькулятор MultiFrame · партнёр"]');
  await expect(frame).toHaveAttribute('src', /hidePrices=1/);
  await expect(frame).not.toHaveAttribute('src', /panelPrice|pricePerM2|installPerM2|dowelPrice/);
  const calc = page.frameLocator('iframe[title="Калькулятор MultiFrame · партнёр"]');
  await expect(calc.locator('body')).toHaveClass(/hide-prices/);
  await expect(calc.locator('#areaOnlyInput')).toHaveValue(/24/);
  await expect(calc.locator('#totalPanels')).not.toHaveText('0 шт.', { timeout: 20000 });
  await expect(calc.locator('body')).not.toContainText('₽');
  await expect(calc.locator('body')).not.toContainText(/93\s*444|24\s*000|119\s*694/);

  await page.locator('button[aria-label="Кабинет"]').click();
  await expect(page.getByRole('region', { name: 'Комната' })).toBeVisible();
  await page.getByRole('region', { name: 'Комната' }).getByRole('button', { name: 'Проблемомер', exact: true }).click();
  await page.getByRole('button', { name: 'Начать', exact: true }).click();

  const result = page.getByRole('heading', { name: 'Акустический профиль помещения' });
  for (let i = 0; i < 12 && !(await result.isVisible().catch(() => false)); i += 1) {
    const next = page.getByRole('button', { name: 'Далее', exact: true });
    if (await next.isVisible().catch(() => false) && (await next.isEnabled().catch(() => false))) {
      await next.click();
    }
    await page.waitForTimeout(300);
  }
  await expect(result).toBeVisible({ timeout: 20000 });
  await expect(page.locator('body')).not.toContainText('₽');
  await expect(page.getByText(/бескаркас/i).filter({ visible: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Сохранить', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Рассчитать количество', exact: true })).toHaveCount(0);
});
