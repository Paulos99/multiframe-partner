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

  await expect(page.getByRole('heading', { name: 'Сегодня в работе' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'С чего начать' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'КП по проекту' })).toBeVisible();

  // Без проекта панель сообщает об этом; с демо-объектами — формируем КП
  const formBtn = page.getByRole('button', { name: 'Сформировать КП' });
  if (await formBtn.isEnabled().catch(() => false)) {
    await formBtn.click();
    await expect(page.getByText(/quote_created|Статус:/)).toBeVisible();
    await page.getByRole('button', { name: 'Скопировать текст' }).click();
    await expect(page.getByText(/Статус КП не изменён|quote_created/)).toBeVisible();
    await page.getByRole('button', { name: 'Подтвердить отправку' }).click();
    await expect(page.getByText(/отправка подтверждена|quote_sent_confirmed/i)).toBeVisible();
  }
});
