import { expect, test } from '@playwright/test';

const ROLES = [
  { login: 'admin', password: 'admin1234', home: /Партнёрская сеть|Аналитика/ },
  { login: 'partner1', password: 'demo1234', home: /Сегодня в работе|С чего начать/ },
  { login: 'sales1', password: 'exec1234', home: /Сегодня в работе|С чего начать/ },
  { login: 'exec1', password: 'exec1234', home: /Мои замеры|С чего начать/ },
  { login: 'crew1', password: 'exec1234', home: /Мои задания|Задания на монтаж/ },
] as const;

for (const role of ROLES) {
  test(`role ${role.login}: home loads`, async ({ page }) => {
    await page.goto('/?demo=1');
    await page.evaluate(() => localStorage.clear());
    await page.goto('/?demo=1');

    const decline = page.getByRole('button', { name: 'Отклонить' });
    if (await decline.isVisible().catch(() => false)) await decline.click();

    const manual = page.getByRole('button', { name: /Войти по логину/ });
    if (await manual.isVisible().catch(() => false)) await manual.click();

    await page.getByLabel('Логин').fill(role.login);
    await page.getByLabel('Пароль').fill(role.password);
    await page.getByRole('button', { name: 'Войти', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Выйти' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(role.home).first()).toBeVisible({ timeout: 15_000 });
  });
}
