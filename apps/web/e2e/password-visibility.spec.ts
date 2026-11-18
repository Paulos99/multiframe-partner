import { test, expect } from '@playwright/test';

test('на входе глазок показывает и скрывает пароль, форму не отправляет', async ({ page }) => {
  await page.goto('/');
  const field = page.getByLabel('Пароль', { exact: true });
  await expect(field).toHaveAttribute('type', 'password');
  await expect(field).toHaveAttribute('autocomplete', 'current-password');
  await field.fill('secret-word');

  const show = page.getByRole('button', { name: 'Показать пароль' });
  await show.click();
  await expect(field).toHaveAttribute('type', 'text');
  await expect(field).toHaveValue('secret-word');
  await expect(page.getByRole('heading', { name: 'Кабинет партнёра' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Войти', exact: true })).toBeVisible();

  const hide = page.getByRole('button', { name: 'Скрыть пароль' });
  await hide.focus();
  await page.keyboard.press('Enter');
  await expect(field).toHaveAttribute('type', 'password');
  await expect(field).toHaveValue('secret-word');
  await expect(page.getByRole('heading', { name: 'Кабинет партнёра' })).toBeVisible();
});

test('на регистрации глазок есть у пароля и у повтора', async ({ page }) => {
  await page.goto('/#/register');
  await expect(page.getByRole('heading', { name: 'Регистрация', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Владелец', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Регистрация компании' })).toBeVisible();

  const password = page.getByLabel('Пароль', { exact: true });
  const repeat = page.getByLabel('Повторите пароль', { exact: true });
  await expect(password).toHaveAttribute('type', 'password');
  await expect(password).toHaveAttribute('autocomplete', 'new-password');
  await expect(repeat).toHaveAttribute('type', 'password');
  await password.fill('Ceiling-2026');
  await repeat.fill('Ceiling-2026');

  await password.locator('xpath=..').getByRole('button', { name: 'Показать пароль' }).click();
  await expect(password).toHaveAttribute('type', 'text');
  await expect(password).toHaveValue('Ceiling-2026');
  await expect(repeat).toHaveAttribute('type', 'password');

  await repeat.locator('xpath=..').getByRole('button', { name: 'Показать пароль' }).click();
  await expect(repeat).toHaveAttribute('type', 'text');
  await expect(page.getByRole('heading', { name: 'Регистрация компании' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Зарегистрироваться', exact: true })).toBeVisible();
});
