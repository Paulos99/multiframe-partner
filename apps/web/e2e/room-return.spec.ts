import { expect, test, type Page } from '@playwright/test';

const password = 'ui-fixture-password-only';
const API = 'http://127.0.0.1:4181';

test.beforeEach(async ({ request }) => {
  await request.post(`${API}/__reset`);
});

async function enter(page: Page) {
  await page.goto('/');
  await page.getByLabel('Логин', { exact: true }).fill('ui.owner');
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Объекты', exact: true })).toBeVisible();
}

test('из комнаты «Назад в комнату», без сохранения — «Сохранить в комнату»', async ({ page }) => {
  await enter(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: /Спальня · UI Client/ }).click();
  await page.getByRole('button', { name: 'Рассчитать', exact: true }).click();

  const back = page.getByRole('button', { name: 'Назад в комнату', exact: true });
  await expect(back).toBeVisible();
  await expect(page.getByRole('button', { name: 'Назад', exact: true })).toHaveCount(0);
  const bar = back.locator('xpath=..');
  const title = bar.getByText('Калькулятор', { exact: true });
  await expect(title).toBeVisible();
  const fit = await Promise.all([back, title].map((locator) =>
    locator.evaluate((el) => {
      const box = el.getBoundingClientRect();
      return {
        text: el.textContent,
        full: el.scrollWidth <= el.clientWidth + 1,
        inside: box.left >= -1 && box.right <= window.innerWidth + 1,
      };
    }),
  ));
  expect(fit, JSON.stringify(fit)).toEqual([
    expect.objectContaining({ full: true, inside: true }),
    expect.objectContaining({ full: true, inside: true }),
  ]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

  await page.evaluate(() => {
    window.postMessage(
      { type: 'mf-cabinet-calc', areaM2: 18, panels: 12, dowels: 24, areaEstimate: true, hasScheme: false },
      window.location.origin,
    );
  });
  await expect(page.getByRole('button', { name: 'Сохранить в комнату', exact: true })).toBeVisible();

  await back.click();
  await expect(page.getByRole('button', { name: 'Рассчитать', exact: true })).toBeVisible();
  const save = page.getByRole('button', { name: 'Сохранить в комнату', exact: true });
  await expect(save).toBeVisible();
  await expect(page.getByRole('button', { name: 'Куда сохранить?', exact: true })).toHaveCount(0);
});
