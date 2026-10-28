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

const calcTitle = 'iframe[title="Калькулятор MultiFrame · партнёр"]';
const tab = (page: Page, name: string) => page.getByRole('tab', { name, exact: true });

async function openTools(page: Page) {
  await tab(page, 'Инструменты').click();
  await expect(tab(page, 'Инструменты')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('region', { name: 'Инструменты' })).toBeVisible();
}

for (const role of roles) {
  test(`${role}: раздел «Инструменты» в меню, оба инструмента открываются без проекта`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await enter(page, role);
    // Меню остаётся коротким: не больше семи пунктов (на телефоне ещё «Профиль»).
    const count = await page.getByRole('complementary', { name: 'Разделы кабинета' }).getByRole('tab').count();
    expect(count).toBeGreaterThanOrEqual(4);
    expect(count).toBeLessThanOrEqual(7);
    await openTools(page);
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // Проблемомер: открывается страницей, проект не нужен.
    await page.getByRole('button', { name: 'Открыть Проблемомер', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Начать', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Кабинет', exact: true }).click();
    // «Назад» возвращает в «Инструменты», а не на стартовый экран.
    await expect(page.getByRole('region', { name: 'Инструменты' })).toBeVisible();
    await expect(tab(page, 'Инструменты')).toHaveAttribute('aria-selected', 'true');

    // Калькулятор: свой экран без привязки к комнате.
    await page.getByRole('button', { name: 'Открыть Калькулятор', exact: true }).click();
    const frame = page.locator(calcTitle);
    await expect(frame).toBeVisible();
    await expect(frame).not.toHaveAttribute('src', /objectId=/);
    await expect(
      page.frameLocator(calcTitle).getByRole('heading', { name: 'Что вы знаете о помещении?' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Кабинет', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Инструменты' })).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test('карточка целиком открывает инструмент, лишних окон и переключателей нет', async ({ page }) => {
  await enter(page, 'owner');
  await openTools(page);
  await page.locator('[data-tool="problemomer"] h3').click();
  await expect(page.getByRole('button', { name: 'Начать', exact: true })).toBeVisible();
  await expect(page.getByRole('tablist', { name: 'Инструмент' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Кабинет', exact: true }).click();
  await page.locator('[data-tool="calculator"] h3').click();
  await expect(page.locator(calcTitle)).toBeVisible();
  await expect(page.getByRole('tablist', { name: 'Инструмент' })).toHaveCount(0);
});

test('«Сегодня» по-прежнему открывает оба инструмента', async ({ page }) => {
  await enter(page, 'sales');
  await expect(tab(page, 'Сегодня')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('button', { name: 'Проблемомер', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Калькулятор', exact: true })).toBeVisible();
});

test('монтажник: в «Инструментах» и калькуляторе нет цен', async ({ page }) => {
  await enter(page, 'crew');
  await openTools(page);
  const section = page.getByRole('region', { name: 'Инструменты' });
  await expect(section).not.toContainText('₽');
  await expect(section).not.toContainText(/сумм|смет|прайс|цен/i);
  await page.getByRole('button', { name: 'Открыть Калькулятор', exact: true }).click();
  const frame = page.locator(calcTitle);
  await expect(frame).toBeVisible();
  await expect(frame).toHaveAttribute('src', /hidePrices=1/);
  await expect(frame).not.toHaveAttribute('src', /panelPrice|pricePerM2|installPerM2|dowelPrice/);
  const calc = page.frameLocator(calcTitle);
  await expect(calc.getByRole('heading', { name: 'Что вы знаете о помещении?' })).toBeVisible();
  await expect(calc.locator('body')).toHaveClass(/hide-prices/);
  await expect(calc.locator('body')).not.toContainText('₽');
  // Проблемомер без проекта тоже без цен.
  await page.getByRole('button', { name: 'Кабинет', exact: true }).click();
  await page.getByRole('button', { name: 'Открыть Проблемомер', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Начать', exact: true })).toBeVisible();
  await expect(page.locator('body')).not.toContainText('₽');
});

for (const role of ['measurer', 'sales'] as const) {
  test(`${role}: калькулятор без проекта получает цены компании`, async ({ page }) => {
    await enter(page, role);
    await openTools(page);
    await page.getByRole('button', { name: 'Открыть Калькулятор', exact: true }).click();
    const frame = page.locator(calcTitle);
    await expect(frame).toBeVisible();
    await expect(frame).not.toHaveAttribute('src', /hidePrices=1/);
    await expect(frame).toHaveAttribute('src', /panelPrice=/);
    await expect(page.frameLocator(calcTitle).locator('body')).not.toHaveClass(/hide-prices/);
  });
}

test('на телефоне и в узком меню «Инструменты» доступны и открываются страницей', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // Телефон: нижняя панель разделов.
  await page.setViewportSize({ width: 390, height: 844 });
  await enter(page, 'owner');
  await expect(tab(page, 'Инструменты')).toBeInViewport({ ratio: 1 });
  await openTools(page);
  await expect(page.getByRole('button', { name: 'Открыть Проблемомер', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.scrollingElement!.scrollWidth <= window.innerWidth)).toBe(true);
  // Узкий планшет: разделы под кнопкой «Меню».
  await page.setViewportSize({ width: 700, height: 900 });
  await page.getByRole('button', { name: 'Меню', exact: true }).click();
  await tab(page, 'Сегодня').click();
  await page.getByRole('button', { name: 'Меню', exact: true }).click();
  await tab(page, 'Инструменты').click();
  await expect(page.getByRole('region', { name: 'Инструменты' })).toBeVisible();
  expect(await page.evaluate(() => document.scrollingElement!.scrollWidth <= window.innerWidth)).toBe(true);
});

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
    await openTools(page);
    if (theme === 'dark') await page.evaluate(() => document.body.classList.add('theme-dark'));
    const button = page.locator('[data-tool="problemomer"]');
    const bg = await button.evaluate((el) => getComputedStyle(el).backgroundColor);
    const color = await button.evaluate((el) => getComputedStyle(el).color);
    expect(bg).toBe('rgb(1, 100, 79)');
    expect(color).toBe('rgb(255, 255, 255)');
    expect(contrast(color, bg)).toBeGreaterThanOrEqual(4.5);
  });
}
