/**
 * Demo-only smoke: менеджер открывает сделку и видит, что копирование не отправка.
 * Запуск: npx playwright test e2e/prd-commercial-demo.spec.ts --config=playwright.demo.config.ts
 */
import { expect, test } from '@playwright/test';

test('sales: демо-сделка, копирование не подтверждает отправку', async ({ page }) => {
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

  await page.getByRole('button', { name: 'Все проекты', exact: true }).click();
  await page.getByRole('button', { name: /Сорокина · до предложения/ }).click();
  await page.getByRole('button', { name: 'Собрать предложение' }).click();
  await page.getByRole('checkbox', { name: /Кухня/ }).check();
  await page.getByRole('button', { name: 'Дальше' }).click();
  await page.getByRole('button', { name: 'Собрать снимок' }).click();
  await expect(page.getByText('Это ещё не отправка.')).toBeVisible();
  await page.getByRole('button', { name: 'Дальше' }).click();
  await page.getByRole('button', { name: 'Скопировать текст' }).click();
  await expect(page.getByText('Текст скопирован. Это не отправка.')).toBeVisible();
  await expect(page.getByText('Отправка подтверждена. Версия заморожена.')).toHaveCount(0);
});
