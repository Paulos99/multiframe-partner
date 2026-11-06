import { test, expect, type Page } from '@playwright/test';

const password = 'ui-fixture-password-only';
const nav = (page: Page) => page.getByRole('complementary', { name: 'Разделы кабинета' });
const roles = [
  ['owner', 'Владелец компании', 'role-owner'],
  ['sales', 'Менеджер по продажам', 'role-sales'],
  ['measurer', 'Замерщик', 'role-measurer'],
  ['crew', 'Монтажник', 'role-crew'],
] as const;

test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:4181/__reset');
});

for (const [role, title, file] of roles) {
  test(`${role}: в «Обучении» первым идёт видео роли, вне папок, и открывается в окне просмотра`, async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Логин', { exact: true }).fill(`ui.${role}`);
    await page.getByLabel('Пароль', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Войти', exact: true }).click();
    await expect(nav(page)).toBeVisible();
    await page.getByRole('tab', { name: 'Обучение', exact: true }).or(page.getByRole('button', { name: 'Обучение', exact: true })).first().click();
    await expect(page.getByRole('heading', { level: 2, name: 'Обучение' })).toBeVisible();

    const card = page.getByRole('region', { name: 'Обучающее видео' });
    await expect(card).toBeVisible();
    await expect(card).toContainText(`«${title}»`);
    await expect(card.locator('video')).toHaveCount(0);
    const open = card.getByRole('button', { name: `Смотреть: ${title}` });
    await expect(open).toBeVisible();
    const poster = open.locator('img');
    await expect(poster).toHaveAttribute('src', new RegExp(`/videos/${file}\\.jpg\\?v=\\d+$`));

    // 16:9 афиша
    const box = (await open.boundingBox())!;
    expect(Math.abs(box.width / box.height - 16 / 9)).toBeLessThan(0.03);

    // Первый пункт: выше папок материалов и вне них.
    const folders = page.getByRole('navigation', { name: 'Папки' });
    await expect(folders).toBeVisible();
    const folderBox = (await folders.boundingBox())!;
    expect(box.y).toBeLessThan(folderBox.y);
    await expect(folders.locator('video')).toHaveCount(0);

    await open.click();
    const dialog = page.getByRole('dialog', { name: `Просмотр: ${title}.mp4` });
    await expect(dialog).toBeVisible();
    const video = dialog.locator('video');
    await expect(video).toBeVisible();
    await expect(video).toHaveAttribute('src', new RegExp(`/videos/${file}\\.mp4\\?v=\\d+`));

    const state = await video.evaluate(async (el: HTMLVideoElement) => {
      el.muted = true;
      await el.play();
      await new Promise((r) => setTimeout(r, 1200));
      const r = { paused: el.paused, time: el.currentTime, width: el.videoWidth, height: el.videoHeight, error: el.error?.code ?? 0 };
      el.pause();
      return r;
    });
    expect(state.error).toBe(0);
    expect(state.paused).toBe(false);
    expect(state.time).toBeGreaterThan(0);
    expect(state.width).toBeGreaterThanOrEqual(1280);
    expect(state.height).toBeGreaterThanOrEqual(720);
    expect(Math.abs(state.width / state.height - 16 / 9)).toBeLessThan(0.01);
  });
}

test('менеджер StP: видео роли нет', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Логин', { exact: true }).fill('ui.stp_manager');
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(nav(page)).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Обучение' })).toBeVisible();
  await expect(page.locator('[data-role-video]')).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('админ StP: видны все четыре видео ролей, удалить их нельзя', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Логин', { exact: true }).fill('ui.admin');
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(nav(page)).toBeVisible();
  await page.getByRole('tab', { name: 'Обучение', exact: true }).or(page.getByRole('button', { name: 'Обучение', exact: true })).first().click();
  await expect(page.getByRole('heading', { level: 2, name: 'Обучение' })).toBeVisible();
  for (const [, title] of roles) {
    const card = page.getByRole('region', { name: `Обучающее видео: ${title}` });
    await expect(card).toBeVisible();
    await expect(card.getByRole('button', { name: `Смотреть: ${title}` })).toBeVisible();
    await expect(card.locator('video')).toHaveCount(0);
    await expect(card.getByRole('button', { name: /Удалить|Заменить/ })).toHaveCount(0);
  }
  await expect(page.locator('[data-role-video]')).toHaveCount(4);
});

test('владелец на телефоне: афиша помещается в экран, без горизонтальной прокрутки', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto('/');
  await page.getByLabel('Логин', { exact: true }).fill('ui.owner');
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await page.getByRole('tab', { name: 'Обучение', exact: true }).or(page.getByRole('button', { name: 'Обучение', exact: true })).first().click();
  const open = page.getByRole('region', { name: 'Обучающее видео' }).getByRole('button', { name: /Смотреть/ });
  await expect(open).toBeVisible();
  const box = (await open.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('если ролик не загрузился, в окне просмотра показывается ошибка', async ({ page }) => {
  await page.route('**/videos/role-owner.mp4*', (route) => route.abort());
  await page.goto('/');
  await page.getByLabel('Логин', { exact: true }).fill('ui.owner');
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await page.getByRole('tab', { name: 'Обучение', exact: true }).or(page.getByRole('button', { name: 'Обучение', exact: true })).first().click();
  await page.getByRole('region', { name: 'Обучающее видео' }).getByRole('button', { name: /Смотреть/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Просмотр: Владелец компании.mp4' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/Видео не воспроизводится|Не удалось/)).toBeVisible({ timeout: 15000 });
});
