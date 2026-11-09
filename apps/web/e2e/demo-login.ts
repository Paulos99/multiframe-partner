import { expect, type Page } from '@playwright/test';

/** Демо-учётки из apps/web/src/partner/demoSeed.ts (режим без сервера / ?demo=1). */
export const DEMO_LOGINS = {
  admin: { login: 'admin', password: 'admin1234' },
  stp_manager: { login: 'stpmgr1', password: 'exec1234' },
  owner: { login: 'partner1', password: 'demo1234' },
  sales: { login: 'sales1', password: 'exec1234' },
  measurer: { login: 'exec1', password: 'exec1234' },
  crew: { login: 'crew1', password: 'exec1234' },
  crew2: { login: 'crew1b', password: 'exec1234' },
} as const;

export type DemoRole = keyof typeof DEMO_LOGINS;

/**
 * Вход по логину/паролю в демо-режиме.
 * Переключателя ролей больше нет: форма всегда на экране.
 * API фикстуры e2e не знает демо-логины (partner1 и т.п.), поэтому обрываем
 * /auth/login и /auth/me — тогда при ?demo=1 срабатывает локальный демо-вход
 * (как раньше с { demoAccount: true } у кнопки роли).
 */
export async function demoSignIn(
  page: Page,
  role: DemoRole = 'owner',
  opts: { path?: string; expectCabinet?: boolean } = {},
) {
  const path = opts.path ?? '/?demo=1';
  const account = DEMO_LOGINS[role];
  await page.route('**/auth/login', (route) => route.abort());
  await page.route('**/auth/me', (route) => route.abort());
  await page.goto(path);
  await page.getByLabel('Логин', { exact: true }).fill(account.login);
  await page.getByLabel('Пароль', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  if (opts.expectCabinet !== false) {
    await expect(page.getByRole('complementary', { name: 'Разделы кабинета' })).toBeVisible({ timeout: 30000 });
  }
}
