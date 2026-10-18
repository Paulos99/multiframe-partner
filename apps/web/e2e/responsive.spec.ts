import { test, expect, type Page } from '@playwright/test';

const password = 'ui-fixture-password-only';
const roles = ['admin', 'owner', 'sales', 'measurer', 'crew'] as const;
const widths = [
  { width: 390, height: 844, kind: 'phone' },
  { width: 820, height: 1180, kind: 'tablet' },
] as const;

test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:4181/__reset');
});

async function noHorizontalOverflow(page: Page, where: string) {
  const r = await page.evaluate(() => ({
    sw: document.scrollingElement!.scrollWidth,
    w: window.innerWidth,
  }));
  expect(r.sw, `горизонтальная прокрутка: ${where}`).toBeLessThanOrEqual(r.w);
}

async function enter(page: Page, role: string) {
  await page.goto('/');
  await noHorizontalOverflow(page, 'вход');
  await page.getByLabel('Логин', { exact: true }).fill(`ui.${role}`);
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Разделы кабинета' })).toBeVisible();
}

for (const vp of widths) {
  for (const role of roles) {
    test(`${vp.width}px · ${role}: навигация видна, без горизонтальной прокрутки`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await enter(page, role);
      await noHorizontalOverflow(page, `${role} главная`);

      const nav = page.getByRole('complementary', { name: 'Разделы кабинета' });
      await expect(nav).toBeVisible();
      const box = await nav.boundingBox();
      expect(box).not.toBeNull();
      if (vp.kind === 'phone') {
        // Нижняя панель прижата к низу экрана и занимает всю ширину.
        expect(Math.round(box!.y + box!.height)).toBeGreaterThanOrEqual(vp.height - 1);
        expect(box!.width).toBeGreaterThanOrEqual(vp.width - 16);
      } else {
        // Планшет: свёрнутый рельс слева.
        expect(box!.x).toBeLessThanOrEqual(1);
        expect(box!.width).toBeLessThanOrEqual(100);
      }

      const items = nav.locator('button');
      const count = await items.count();
      expect(count).toBeGreaterThan(0);
      for (let i = 0; i < count; i += 1) {
        const item = items.nth(i);
        const name = (await item.getAttribute('aria-label')) || (await item.innerText());
        if (/Проблемомер|Калькулятор/.test(name)) continue;
        await item.scrollIntoViewIfNeeded();
        const b = await item.boundingBox();
        expect(b!.height, `высота пункта «${name.trim()}»`).toBeGreaterThanOrEqual(44);
        await item.click();
        await noHorizontalOverflow(page, `${role} · ${name.trim()}`);
      }

      await openProfileSettings(page);
      const dialog = page.getByRole('dialog', { name: 'Мой профиль' });
      await expect(dialog).toBeVisible();
      if (vp.kind === 'phone') {
        const d = await dialog.boundingBox();
        expect(d!.width).toBeGreaterThanOrEqual(vp.width - 16);
      }
      const fontSize = await dialog
        .getByLabel('Логин', { exact: true })
        .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
      expect(fontSize).toBeGreaterThanOrEqual(16);
      await noHorizontalOverflow(page, `${role} профиль`);
      await page.getByRole('button', { name: 'Закрыть профиль' }).click();
    });
  }
}

/** На телефоне профиль — последняя вкладка нижней панели, настройки открываются оттуда; на шире — кнопка в шапке. */
async function openProfileSettings(page: Page) {
  const tab = page.locator('[data-nav-id="profile"]');
  if (await tab.isVisible()) {
    await tab.click();
    await page.getByRole('button', { name: 'Настройки профиля', exact: true }).click();
  } else {
    await page.getByRole('button', { name: 'Мой профиль', exact: true }).click();
  }
}
