import { test, expect, type Page } from '@playwright/test';
const password = 'ui-fixture-password-only';
test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:4181/__reset');
});
async function enter(page: Page, role = 'owner') {
  await page.goto('/');
  await page.getByLabel('Логин', { exact: true }).fill(`ui.${role}`);
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Мой профиль', exact: true })).toBeVisible();
}

/** Grabs the card at (+20,+15), drags it and checks the overlay keeps that offset to the pointer. */
async function expectGrabPointStays(page: Page, id: string) {
  const card = page.locator(`[data-room-id="${id}"]`);
  const box = await card.boundingBox();
  if (!box) throw new Error('no card');
  const start = { x: box.x + 20, y: box.y + 15 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  const overlay = page.locator('[data-kanban-overlay]');
  for (const [dx, dy] of [
    [60, 10],
    [180, 70],
    [120, 160],
  ]) {
    await page.mouse.move(start.x + dx, start.y + dy, { steps: 8 });
    await expect(overlay).toBeVisible();
    // The dnd-kit wrapper carries only the translate; the card inside rotates around the grab point.
    const wrapper = await overlay.locator('xpath=..').boundingBox();
    if (!wrapper) throw new Error('no overlay');
    expect(Math.abs(start.x + dx - wrapper.x - 20)).toBeLessThanOrEqual(3);
    expect(Math.abs(start.y + dy - wrapper.y - 15)).toBeLessThanOrEqual(3);
    expect(Math.abs(wrapper.width - box.width)).toBeLessThanOrEqual(1);
    // The card inside rotates/scales around the grab point, so that point stays under the pointer.
    const origin = await overlay.evaluate((el) =>
      getComputedStyle(el).transformOrigin.split(' ').map(parseFloat),
    );
    expect(Math.abs(origin[0] - 20)).toBeLessThanOrEqual(1);
    expect(Math.abs(origin[1] - 15)).toBeLessThanOrEqual(1);
  }
  await page.keyboard.press('Escape');
  await page.mouse.up();
}

test('drag overlay stays under the pointer at the grab point', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await enter(page);
  await expect(page.locator('[data-room-id="ui_room"]')).toBeVisible();
  await expectGrabPointStays(page, 'ui_room');
});

test('grab point holds with page and board scrolled', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 640 });
  await enter(page);
  const card = page.locator('[data-room-id="ui_measured"]');
  await expect(card).toBeVisible();
  await page.evaluate(() => window.scrollBy(0, 220));
  await page.locator('[aria-label="Канбан объектов"]').evaluate((el) => {
    el.scrollLeft = 120;
  });
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  expect(
    await page.locator('[aria-label="Канбан объектов"]').evaluate((el) => el.scrollLeft),
  ).toBeGreaterThan(0);
  await card.scrollIntoViewIfNeeded();
  await expectGrabPointStays(page, 'ui_measured');
});

test('owner deletes an object via «…» and confirm; it is gone after reload', async ({ page }) => {
  await enter(page);
  const card = page.locator('[data-room-id="ui_room"]');
  await expect(card).toBeVisible();
  await page.getByRole('button', { name: /^Действия с объектом «Спальня»/ }).click();
  await page.getByRole('menuitem', { name: 'Удалить' }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('Удалить объект «');
  await expect(dialog).toContainText('Действие нельзя отменить');
  await dialog.getByRole('button', { name: 'Отмена' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(card).toBeVisible();

  // Right click opens the same menu.
  await card.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Удалить' }).click();
  const del = page.waitForRequest(
    (r) => r.method() === 'DELETE' && new URL(r.url()).pathname === '/objects/ui_room',
  );
  await page.getByRole('alertdialog').getByRole('button', { name: 'Удалить' }).click();
  await del;
  await expect(card).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: 'Объект удалён' })).toBeVisible();
  await page.reload();
  await expect(page.locator('[data-room-id="ui_measured"]')).toBeVisible();
  await expect(page.locator('[data-room-id="ui_room"]')).toHaveCount(0);
});

test('crew has no delete action on cards', async ({ page }) => {
  await enter(page, 'crew');
  const card = page.locator('[data-room-id="ui_crew_room"]');
  await expect(card).toBeVisible();
  await expect(page.getByRole('button', { name: /^Действия с объектом/ })).toHaveCount(0);
  await card.click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: 'Удалить' })).toHaveCount(0);
});
