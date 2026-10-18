import { test, expect, type Page } from '@playwright/test';

const password = 'ui-fixture-password-only';
const roles = ['admin', 'owner', 'sales', 'measurer', 'crew'] as const;
/** У замерщика и монтажника меню — кнопки, у остальных — вкладки. */
const navRole = (role: string) => (role === 'measurer' || role === 'crew' ? 'button' : 'tab');

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

function toolsItem(page: Page, role: string) {
  return page
    .getByRole('complementary', { name: 'Разделы кабинета' })
    .getByRole(navRole(role), { name: 'Инструменты', exact: true });
}

for (const role of roles) {
  test(`${role}: вкладка «Инструменты» с двумя карточками, старых кнопок нет`, async ({ page }) => {
    await enter(page, role);
    // Старые кнопки в шапке и меню убраны.
    await expect(page.getByRole('button', { name: 'Проблемомер', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Калькулятор', exact: true })).toHaveCount(0);

    await toolsItem(page, role).click();
    const panel = page.getByRole('region', { name: 'Инструменты' });
    await expect(panel).toBeVisible();
    for (const title of ['Проблемомер', 'Калькулятор']) {
      const card = panel.locator('article', { has: page.getByRole('heading', { name: title, exact: true }) });
      await expect(card).toBeVisible();
      await expect(card.getByText('Когда применять:', { exact: true })).toBeVisible();
      await expect(card.getByText('Зачем:', { exact: true })).toBeVisible();
      const bullets = await card.locator('li').count();
      expect(bullets).toBeGreaterThanOrEqual(4);
      expect(bullets).toBeLessThanOrEqual(6);
      await expect(card.getByRole('button', { name: `Открыть ${title}`, exact: true })).toBeVisible();
    }
  });
}

test('карточки открывают нужный инструмент, «Назад» возвращает во вкладку', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await enter(page, 'owner');
  await toolsItem(page, 'owner').click();

  // Клик по карточке (не по кнопке) открывает Проблемомер.
  await page.getByRole('heading', { name: 'Проблемомер', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Начать', exact: true })).toBeVisible();
  // Переключателя инструментов внутри больше нет.
  await expect(page.getByRole('tablist', { name: 'Инструмент' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Кабинет', exact: true }).click();
  await expect(toolsItem(page, 'owner')).toHaveAttribute('aria-selected', 'true');

  await page.getByRole('button', { name: 'Открыть Калькулятор', exact: true }).click();
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
  await toolsItem(page, 'crew').click();
  const calc = page.locator('article[data-tool="calculator"]');
  await expect(calc).toContainText('сумму по прайсу');
  await expect(calc).toContainText('Смету');
  await expect(page.getByText('спецификац', { exact: false })).toHaveCount(0);
  await calc.getByRole('button', { name: 'Открыть Калькулятор', exact: true }).click();
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
    const item = toolsItem(page, 'owner');
    await expect(item).toBeInViewport({ ratio: 1 });
    await item.click();
    const cards = page.getByRole('region', { name: 'Инструменты' }).locator('article');
    await expect(cards).toHaveCount(2);
    const [a, b] = [await cards.nth(0).boundingBox(), await cards.nth(1).boundingBox()];
    if (vp.width < 641) expect(b!.y).toBeGreaterThan(a!.y + a!.height - 1); // стопкой
    else expect(Math.abs(a!.y - b!.y)).toBeLessThan(2); // две колонки
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
    await toolsItem(page, 'owner').click();
    for (const id of ['problemomer', 'calculator']) {
      const card = page.locator(`article[data-tool="${id}"]`);
      await expect(card).toBeVisible();
      const c = await card.evaluate((el) => {
        const li = el.querySelector('li')!;
        const cs = getComputedStyle(el);
        return {
          bg: cs.backgroundColor,
          color: cs.color,
          title: getComputedStyle(el.querySelector('h3')!).color,
          tagline: getComputedStyle(el.querySelector('h3 + p')!).color,
          li: getComputedStyle(li).color,
          dot: getComputedStyle(li, '::before').backgroundColor,
        };
      });
      expect(c.bg).toBe('rgb(1, 100, 79)'); // --cab-accent, никакого синего
      for (const white of [c.color, c.title, c.li, c.dot]) expect(white).toBe('rgb(255, 255, 255)');
      expect(contrast(c.tagline, c.bg)).toBeGreaterThanOrEqual(4.5);
      // Наведение заметно: фон меняется и остаётся контрастным.
      await card.locator('h3').hover();
      await expect
        .poll(() => card.evaluate((el) => getComputedStyle(el).backgroundColor))
        .not.toBe('rgb(1, 100, 79)');
      const hovered = await card.evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(contrast('rgb(255, 255, 255)', hovered)).toBeGreaterThanOrEqual(4.5);
      await page.mouse.move(0, 0);
    }
  });
}
