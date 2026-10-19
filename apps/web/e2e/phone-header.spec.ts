import { test, expect, type Page } from '@playwright/test';

// Шапка кабинета на телефоне: верхний ряд — логотипы StP + MultiFrame слева,
// «Установить», статус синхронизации и тема — справа. Заголовок роли ниже, плотнее.

const password = 'ui-fixture-password-only';

test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:4181/__reset');
});

/** Кнопка «Установить» показывается только на Android/iOS — эмулируем телефон. */
async function asPhone(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgentData', {
      configurable: true,
      get: () => ({ mobile: true, platform: 'Android' }),
    });
  });
}

async function enter(page: Page, role: string) {
  await page.goto('/');
  await page.getByLabel('Логин', { exact: true }).fill(`ui.${role}`);
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Разделы кабинета' })).toBeVisible();
}

const header = (page: Page) => page.locator('header').first();

for (const width of [360, 390]) {
  for (const role of ['admin', 'sales', 'owner']) {
    test(`${width}px · ${role}: кнопки шапки в верхнем ряду рядом с логотипами, шапка тонкая`, async ({ page }) => {
      await asPhone(page);
      await page.setViewportSize({ width, height: 844 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await enter(page, role);
      const h = header(page);
      const stp = h.getByRole('img', { name: 'StP', exact: true });
      const mf = h.getByRole('img', { name: 'MultiFRAME', exact: true });
      const install = h.getByRole('button', { name: 'Установить на устройство' });
      const sync = h.locator('[class*="syncDotBtn"]');
      const theme = h.getByRole('button', { name: /^(Светлая|Тёмная) тема$/ });
      const title = h.getByRole('heading', { level: 1 });

      // Ничего не задублировано.
      await expect(page.getByRole('button', { name: 'Установить на устройство' })).toHaveCount(1);
      await expect(page.getByRole('button', { name: /^(Светлая|Тёмная) тема$/ })).toHaveCount(1);
      await expect(page.locator('[class*="syncDotBtn"]')).toHaveCount(1);

      const boxes = {
        stp: (await stp.boundingBox())!,
        mf: (await mf.boundingBox())!,
        install: (await install.boundingBox())!,
        sync: (await sync.boundingBox())!,
        theme: (await theme.boundingBox())!,
        title: (await title.boundingBox())!,
      };
      const mid = (b: { y: number; height: number }) => b.y + b.height / 2;
      // Один ряд: центры по вертикали совпадают, ряд выше заголовка.
      for (const k of ['mf', 'install', 'sync', 'theme'] as const) {
        expect(Math.abs(mid(boxes[k]) - mid(boxes.stp)), `${k} в ряду логотипов`).toBeLessThanOrEqual(6);
        expect(boxes[k].y + boxes[k].height, `${k} выше заголовка`).toBeLessThanOrEqual(boxes.title.y + 1);
      }
      // Кнопки прижаты вправо, логотипы — влево, ничего не наезжает.
      const hbox = (await h.boundingBox())!;
      expect(boxes.theme.x + boxes.theme.width).toBeGreaterThan(hbox.x + hbox.width - 16);
      expect(boxes.stp.x).toBeLessThan(16);
      const order = [boxes.stp, boxes.mf, boxes.sync, boxes.install, boxes.theme].sort((a, b) => a.x - b.x);
      for (let i = 1; i < order.length; i += 1) {
        expect(order[i]!.x).toBeGreaterThanOrEqual(order[i - 1]!.x + order[i - 1]!.width - 0.5);
      }
      // Все кнопки удобно нажимать (не меньше 40×40) и они целиком на экране.
      for (const [name, el] of [
        ['install', install],
        ['sync', sync],
        ['theme', theme],
      ] as const) {
        const b = (await el.boundingBox())!;
        expect(b.width, `${name} ширина`).toBeGreaterThanOrEqual(40);
        expect(b.height, `${name} высота`).toBeGreaterThanOrEqual(40);
        await expect(el).toBeInViewport({ ratio: 1 });
      }
      // Заголовок меньше, шапка тонкая.
      const size = await title.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
      expect(size).toBeLessThanOrEqual(19);
      const hb = (await h.boundingBox())!;
      expect(hb.height, 'высота шапки').toBeLessThanOrEqual(140);
      expect(await page.evaluate(() => document.scrollingElement!.scrollWidth <= window.innerWidth)).toBe(true);

      // Кнопки работают.
      const before = await theme.getAttribute('aria-pressed');
      await theme.click();
      await expect(theme).not.toHaveAttribute('aria-pressed', before!);
      await sync.click();
      await expect(h.getByRole('status')).toBeVisible();
    });
  }
}

test('компьютер: шапка без логотипов, тема и статус справа в одном ряду с заголовком', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await enter(page, 'sales');
  const h = header(page);
  await expect(h.getByRole('img', { name: 'StP', exact: true })).toBeHidden();
  const title = (await h.getByRole('heading', { level: 1 }).boundingBox())!;
  const theme = (await h.getByRole('button', { name: /^(Светлая|Тёмная) тема$/ }).boundingBox())!;
  expect(theme.y).toBeLessThan(title.y + title.height);
  expect(theme.x).toBeGreaterThan(title.x + 200);
  await expect(page.getByRole('button', { name: /^(Светлая|Тёмная) тема$/ })).toHaveCount(1);
});
