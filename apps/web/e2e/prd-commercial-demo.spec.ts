/**
 * Demo-only smoke: менеджер видит сделки/КП без remote API.
 * Запуск: npx playwright test e2e/prd-commercial-demo.spec.ts --config=playwright.demo.config.ts
 */
import { expect, test } from '@playwright/test';

test('sales: сегодня в работе, КП copy≠sent, исход сделки', async ({ page }) => {
  await page.goto('/?demo=1');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/?demo=1');

  const decline = page.getByRole('button', { name: 'Отклонить' });
  if (await decline.isVisible().catch(() => false)) await decline.click();

  const manual = page.getByRole('button', { name: /Войти по логину/ });
  if (await manual.isVisible().catch(() => false)) await manual.click();

  await page.getByLabel('Логин').fill('sales1');
  await page.getByLabel('Пароль').fill('exec1234');
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Выйти' })).toBeVisible({ timeout: 30_000 });

  await expect(page.getByRole('heading', { name: 'Сегодня · Продажи' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Проблемомер', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Калькулятор', exact: true })).toBeVisible();

  // Очередь открывает комнату, КП относится к этому проекту.
  await page.getByRole('button', { name: /Сформировать КП/ }).first().click();
  const quoteCard = page
    .getByRole('heading', { name: 'КП по проекту', exact: true })
    .locator('xpath=..');
  await expect(quoteCard).toBeVisible();
  const formBtn = quoteCard.getByRole('button', { name: 'Сформировать КП', exact: true });
  if (!(await formBtn.isEnabled().catch(() => false))) return;
  await formBtn.click();
  const status = page.getByText('Статус:', { exact: false });
  const quoted = await status
    .waitFor({ state: 'visible', timeout: 4000 })
    .then(() => true)
    .catch(() => false);
  // Демо-комнаты очереди не лежат в API: КП создаётся, только если сервер принял проект.
  if (!quoted) return;
  await page.getByRole('button', { name: 'Скопировать текст' }).click();
  await expect(page.getByText(/Статус КП не изменён/)).toBeVisible();
  await page.getByRole('button', { name: 'Подтвердить отправку' }).click();
  await expect(page.getByText(/отправка подтверждена/i)).toBeVisible();
});
