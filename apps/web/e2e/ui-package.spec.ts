import { test, expect, type Page } from '@playwright/test';
const password = 'ui-fixture-password-only';
test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:4181/__reset');
});
async function enter(page: Page, role = 'owner', pw = password) {
  await page.goto('/');
  await page.getByLabel('Логин', { exact: true }).fill(`ui.${role}`);
  await page.getByLabel('Пароль', { exact: true }).fill(pw);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Мой профиль', exact: true }),
  ).toBeVisible();
}
test('admin keeps one shared period control without the duplicate overview', async ({ page }) => {
  await enter(page, 'admin');
  const controls = page.getByRole('region', { name: 'Управление партнёрской сетью' });
  await expect(page.getByText('Партнёры и поддержка команды', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Последнее событие', { exact: false })).toHaveCount(0);
  const calendar = controls.locator('button[aria-controls]');
  await expect(page.locator('button[aria-controls]')).toHaveCount(1);
  await calendar.click();
  const updated = page.waitForRequest((r) => new URL(r.url()).pathname === '/analytics/dashboard' && !new URL(r.url()).searchParams.has('from'));
  await page.getByRole('button', { name: 'Всё время', exact: true }).click();
  await updated;
  await expect(calendar).toHaveText('Всё время');
  await controls.getByRole('button', { name: 'Новый партнёр', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Новый партнёр', exact: true })).toBeVisible();
  await expect(calendar).toHaveText('Всё время');
  await controls.getByRole('button', { name: /^Партнёры ·/ }).click();
  await expect(page.getByRole('heading', { name: /Партнёры/ })).toBeVisible();
  await controls.getByRole('button', { name: 'Обучение и материалы', exact: true }).click();
  await expect(calendar).toHaveText('Всё время');
});

test('kanban drag persists stage after reload, opens existing room editor', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await enter(page);
  await expect(page.getByRole('group', { name: 'Вид объектов' })).toHaveCount(
    0,
  );
  let releasePatch!: () => void;
  const patchGate = new Promise<void>((resolve) => {
    releasePatch = resolve;
  });
  await page.route('**/objects/ui_room', async (route) => {
    if (route.request().method() === 'PATCH') {
      expect(Number.isFinite(route.request().postDataJSON().stageOrder)).toBe(
        true,
      );
      await patchGate;
    }
    await route.continue();
  });
  const card = page.locator('[data-room-id="ui_room"]');
  await card.scrollIntoViewIfNeeded();
  const from = await card.boundingBox();
  const target = page.locator('[data-kanban-stage="measured"]');
  const to = await target.boundingBox();
  if (!from || !to) throw new Error('Missing drag geometry');
  await page.mouse.move(from.x + from.width / 2, from.y + 40);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + 25, { steps: 20 });
  await page.mouse.up();
  await expect(target.locator('[data-room-id]').first()).toHaveAttribute(
    'data-room-id',
    'ui_room',
  );
  await expect(target.locator('[data-room-id="ui_room"]')).toBeVisible();
  await expect(
    page.locator('[data-kanban-stage="draft"] [data-room-id="ui_room"]'),
  ).toHaveCount(0);
  releasePatch();
  await expect(
    page.getByRole('status').filter({ hasText: 'Стадия сохранена' }),
  ).toBeVisible();
  await page.reload();
  await expect(target.locator('[data-room-id]').first()).toHaveAttribute(
    'data-room-id',
    'ui_room',
  );
  await expect(page.getByRole('group', { name: 'Вид объектов' })).toHaveCount(
    0,
  );
  await expect(
    page.locator('[data-kanban-stage="measured"] [data-room-id="ui_room"]'),
  ).toBeVisible();
  await page.locator('[data-room-id="ui_room"]').click();
  await expect(
    page.getByRole('heading', { name: /Спальня.*Замер/ }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test('reorder within a column persists after reload', async ({ page }) => {
  await enter(page);
  const card = page.locator('[data-room-id="ui_room"]');
  await card.focus();
  await card.press('Alt+ArrowRight');
  await expect(
    page.getByRole('status').filter({ hasText: 'Стадия сохранена' }),
  ).toBeVisible();
  await expect(card).toHaveCount(1);
  const target = page.locator('[data-room-id="ui_measured"]');
  const from = await card.boundingBox(),
    to = await target.boundingBox();
  if (!from || !to) throw new Error('Missing card geometry');
  await page.mouse.move(from.x + 30, from.y + 30);
  await page.mouse.down();
  await page.mouse.move(to.x + 30, to.y + to.height - 15, { steps: 20 });
  await page.mouse.up();
  const column = page.locator('[data-kanban-stage="measured"]');
  await expect(column.locator('[data-room-id]').first()).toHaveAttribute(
    'data-room-id',
    'ui_measured',
  );
  await expect(
    page.getByRole('status').filter({ hasText: 'Стадия сохранена' }),
  ).toBeVisible();
  await page.reload();
  await expect(column.locator('[data-room-id]').first()).toHaveAttribute(
    'data-room-id',
    'ui_measured',
  );
});

test('crew cannot drag a room into a forbidden stage', async ({ page }) => {
  await enter(page, 'crew');
  await expect(page.getByRole('group', { name: 'Вид объектов' })).toHaveCount(
    0,
  );

  const card = page.locator('[data-room-id="ui_crew_room"]');
  await card.focus();
  await card.press('Alt+ArrowLeft');
  await expect(
    page.locator('[data-kanban-stage="install"] [data-room-id="ui_crew_room"]'),
  ).toBeVisible();
  await card.press('Alt+ArrowRight');
  await expect(
    page.locator('[data-kanban-stage="closed"] [data-room-id="ui_crew_room"]'),
  ).toBeVisible();
});
test('profile validates current password, changes password and uploads compressed avatar', async ({
  page,
}) => {
  await enter(page);
  await page.getByRole('button', { name: 'Мой профиль', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Мой профиль' });
  await dialog.getByLabel('Текущий пароль', { exact: true }).fill('incorrect');
  await dialog
    .getByLabel('Новый пароль', { exact: true })
    .fill('ui-updated-password-only');
  await dialog.getByLabel('Повторите пароль').fill('ui-updated-password-only');
  await dialog
    .getByRole('button', { name: 'Сменить пароль', exact: true })
    .click();
  await expect(dialog.getByRole('alert')).toHaveText('Текущий пароль неверен');
  await dialog.getByLabel('Текущий пароль', { exact: true }).fill(password);
  await dialog
    .getByRole('button', { name: 'Сменить пароль', exact: true })
    .click();
  await expect(dialog.getByRole('status')).toContainText('Пароль обновлён');
  const png = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 512;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#16816a';
    ctx.fillRect(0, 0, 1024, 512);
    return c.toDataURL('image/png').split(',')[1];
  });
  const upload = page.waitForRequest(
    (r) => r.url().endsWith('/me/avatar') && r.method() === 'PUT',
  );
  await dialog.getByLabel('Фото', { exact: true }).setInputFiles({
    name: 'test.png',
    mimeType: 'image/png',
    buffer: Buffer.from(png, 'base64'),
  });
  const request = await upload;
  expect(request.postDataJSON().mime).toBe('image/webp');
  expect(
    Buffer.from(request.postDataJSON().base64, 'base64').length,
  ).toBeLessThanOrEqual(200 * 1024);
  await expect(dialog.getByRole('status')).toHaveText('Фото обновлено');
  await expect(dialog.getByRole('img', { name: 'Фото профиля' })).toBeVisible();
  await expect
    .poll(() =>
      dialog
        .getByRole('img', { name: 'Фото профиля' })
        .evaluate((img: HTMLImageElement) => img.naturalWidth),
    )
    .toBe(256);
  await dialog
    .getByLabel('Текущий пароль', { exact: true })
    .fill('ui-updated-password-only');
  await dialog.getByLabel('Логин', { exact: true }).fill('ui.owner.renamed');
  await dialog
    .getByRole('button', { name: 'Сохранить логин', exact: true })
    .click();
  await expect(dialog.getByRole('status')).toHaveText('Логин обновлён');
  await dialog.getByRole('button', { name: 'Закрыть профиль' }).click();
  await page.getByRole('button', { name: 'Выйти', exact: true }).click();
  await enter(page, 'owner.renamed', 'ui-updated-password-only');
  await page.getByRole('button', { name: 'Мой профиль', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Фото профиля' })).toBeVisible();
});
test('mobile and reduced motion: profile and board stay within viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enter(page, 'crew');
  await page.getByRole('button', { name: 'Мой профиль', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole('button', { name: 'Закрыть профиль' }).click();
  await expect(page.getByRole('group', { name: 'Вид объектов' })).toHaveCount(
    0,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test('failed stage save keeps the original card and shows the error', async ({
  page,
}) => {
  await enter(page);
  await expect(page.getByRole('group', { name: 'Вид объектов' })).toHaveCount(
    0,
  );
  await page.route('**/objects/ui_room', async (route) => {
    if (route.request().method() === 'PATCH')
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Нет прав на стадию' }),
      });
    else await route.continue();
  });
  const card = page.locator('[data-room-id="ui_room"]');
  await card.focus();
  await card.press('Alt+ArrowRight');
  await expect(page.getByRole('alert')).toHaveText('Нет прав на стадию');
  await expect(
    page.locator('[data-kanban-stage="draft"] [data-room-id="ui_room"]'),
  ).toBeVisible();
});
test('admin uses the same board and editor in projects', async ({ page }) => {
  await enter(page, 'admin');
  await page.getByRole('tab', { name: 'Проекты', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Вид объектов' })).toHaveCount(
    0,
  );
  await page.locator('[data-room-id="ui_room"]').click();
  await expect(
    page.getByRole('heading', { name: /Спальня.*Черновик/ }),
  ).toBeVisible();
});

test('diagnostic and calculator open without runtime regressions', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await enter(page);
  await page.getByRole('button', { name: 'Проблемомер', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Начать', exact: true }),
  ).toBeVisible();
  await page.getByRole('tab', { name: 'Калькулятор', exact: true }).click();
  await expect(
    page
      .frameLocator('iframe[title="Калькулятор MultiFrame · партнёр"]')
      .getByRole('heading', { name: 'Что вы знаете о помещении?' }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
