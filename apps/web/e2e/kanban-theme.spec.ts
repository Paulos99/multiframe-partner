import { test, expect, type Page } from '@playwright/test';
test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:4181/__reset');
});
async function enter(page: Page) {
  await page.goto('/');
  await page.getByLabel('Логин', { exact: true }).fill('ui.owner');
  await page.getByLabel('Пароль', { exact: true }).fill('ui-fixture-password-only');
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await page.getByRole('tab', { name: 'Проекты', exact: true }).click();
  await expect(page.locator('[data-room-id="ui_room"]')).toBeVisible();
}
const bg = (page: Page, selector: string) =>
  page.locator(selector).first().evaluate((el) => getComputedStyle(el).backgroundColor);

test('light theme: green columns differ from the panel and from white cards; hint hidden', async ({ page }) => {
  await enter(page);
  expect(await page.evaluate(() => document.body.classList.contains('theme-dark'))).toBe(false);
  const column = await bg(page, '[data-kanban-stage="draft"]');
  const card = await bg(page, '[data-room-id="ui_room"]');
  const panel = await page
    .locator('[data-kanban-stage="draft"]')
    .evaluate((el) => {
      for (let e = el.parentElement; e; e = e.parentElement) {
        const c = getComputedStyle(e).backgroundColor;
        if (c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') return c;
      }
      return '';
    });
  const [r, g, b] = column.match(/\d+(\.\d+)?/g)!.map(Number);
  expect(g).toBeGreaterThan(r); // green tint
  expect(g).toBeGreaterThan(b - 1);
  expect(column).not.toBe(panel);
  expect(card).toBe('rgb(255, 255, 255)');
  expect(column).not.toBe(card);
  // Visually hidden (1px, clipped) but still present for screen readers.
  const hint = page.locator('#kanban-help');
  await expect(hint).toHaveCount(1);
  const box = await hint.boundingBox();
  expect((box?.width ?? 0) <= 1 && (box?.height ?? 0) <= 1).toBe(true);
  expect(await hint.evaluate((el) => getComputedStyle(el).clipPath)).toContain('inset');
});

