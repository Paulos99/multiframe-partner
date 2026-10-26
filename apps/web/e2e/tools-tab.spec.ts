import { test, expect, type Page } from '@playwright/test';

const password = 'ui-fixture-password-only';
const roles = ['admin', 'owner', 'sales', 'measurer', 'crew'] as const;

test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:4181/__reset');
});

async function enter(page: Page, role: string) {
  await page.goto('/');
  await page.getByLabel('Логин', { exact: true }).fill(`ui.${role}`);
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Разделы кабинета' })).toBeVisible();
}

for (const role of roles) {
  test(`${role}: «Сегодня» открывает Проблемомер и Калькулятор, отдельного раздела нет`, async ({ page }) => {
    await enter(page, role);
    await expect(page.getByRole('tab', { name: 'Инструменты', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Проблемомер', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Калькулятор', exact: true })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Сегодня', exact: true })).toHaveAttribute('aria-selected', 'true');
  });
}

test('карточки открывают нужный инструмент, «Назад» возвращает во вкладку', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await enter(page, 'owner');

  await page.getByRole('button', { name: 'Проблемомер', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Начать', exact: true })).toBeVisible();
  await expect(page.getByRole('tablist', { name: 'Инструмент' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Кабинет', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Сегодня', exact: true })).toHaveAttribute('aria-selected', 'true');

  await page.getByRole('button', { name: 'Калькулятор', exact: true }).click();
  await expect(
    page
      .frameLocator('iframe[title="Калькулятор MultiFrame · партнёр"]')
      .getByRole('heading', { name: 'Что вы знаете о помещении?' }),
  ).toBeVisible();
  await expect(page.getByRole('tablist', { name: 'Инструмент' })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('монтажник: калькулятор с ценами, как у всех', async ({ page }) => {
  await enter(page, 'crew');
  await expect(page.getByText('спецификац', { exact: false })).toHaveCount(0);
  await page.getByRole('button', { name: 'Калькулятор', exact: true }).click();
  const frame = page.locator('iframe[title="Калькулятор MultiFrame · партнёр"]');
  await expect(frame).toBeVisible();
  await expect(frame).not.toHaveAttribute('src', /hidePrices/);
  await expect(frame).toHaveAttribute('src', /panelPrice=2396/);
});

for (const vp of [
  { width: 390, height: 844 },
  { width: 820, height: 1180 },
]) {
  test(`${vp.width}px: «Инструменты» видны в меню без прокрутки, карточки помещаются`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await enter(page, 'owner');
    const problem = page.getByRole('button', { name: 'Проблемомер', exact: true });
    const calc = page.getByRole('button', { name: 'Калькулятор', exact: true });
    await expect(problem).toBeInViewport({ ratio: 1 });
    await expect(calc).toBeInViewport({ ratio: 1 });
    expect(
      await page.evaluate(() => document.scrollingElement!.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });
}

/** Относительная яркость по WCAG для `rgb(r, g, b)`. */
function luminance(rgb: string) {
  // Chromium отдаёт color-mix() как `color(srgb 0.1 0.3 0.2)` — каналы 0..1.
  const scale = rgb.startsWith('color(') ? 1 : 255;
  const [r, g, b] = (rgb.match(/\d+(\.\d+)?/g) || []).slice(0, 3).map((v) => {
    const c = Number(v) / scale;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
};

for (const theme of ['light', 'dark'] as const) {
  test(`${theme}: карточки инструментов зелёные, текст и маркеры белые, AA`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await enter(page, 'owner');
    if (theme === 'dark') await page.evaluate(() => document.body.classList.add('theme-dark'));
    const button = page.getByRole('button', { name: 'Проблемомер', exact: true });
    const bg = await button.evaluate((el) => getComputedStyle(el).backgroundColor);
    const color = await button.evaluate((el) => getComputedStyle(el).color);
    expect(bg).toBe('rgb(1, 100, 79)');
    expect(color).toBe('rgb(255, 255, 255)');
    expect(contrast(color, bg)).toBeGreaterThanOrEqual(4.5);
  });
}
