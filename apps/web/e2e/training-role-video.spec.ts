import { test, expect, type Page } from '@playwright/test';

const password = 'ui-fixture-password-only';
const nav = (page: Page) => page.getByRole('complementary', { name: 'Разделы кабинета' });
const roles = [
  ['owner', 'Владелец компании', 'role-owner'],
  ['sales', 'Менеджер по продажам', 'role-sales'],
  ['measurer', 'Замерщик', 'role-measurer'],
  ['crew', 'Монтажник', 'role-crew'],
  ['stp_manager', 'Менеджер StP', 'role-stp'],
] as const;

test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:4181/__reset');
});

for (const [role, title, file] of roles) {
  test(`${role}: в «Обучении» первым идёт видео роли, вне папок, и запускается`, async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Логин', { exact: true }).fill(`ui.${role}`);
    await page.getByLabel('Пароль', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Войти', exact: true }).click();
    await expect(nav(page)).toBeVisible();
    if (role !== 'stp_manager') {
      await page.getByRole('tab', { name: 'Обучение', exact: true }).or(page.getByRole('button', { name: 'Обучение', exact: true })).first().click();
    }
    await expect(page.getByRole('heading', { level: 2, name: 'Обучение' })).toBeVisible();

    const card = page.getByRole('region', { name: 'Обучающее видео' });
    await expect(card).toBeVisible();
    await expect(card).toContainText(`«${title}»`);
    const video = card.locator('video');
    await expect(video).toHaveAttribute('src', new RegExp(`/videos/${file}\\.mp4\\?v=\\d+$`));
    await expect(video).toHaveAttribute('poster', new RegExp(`/videos/${file}\\.jpg\\?v=\\d+$`));
    await expect(video).toHaveAttribute('controls', '');
    await expect(video).toHaveAttribute('playsinline', '');
    await expect(video).toHaveAttribute('preload', 'none');

    // 16:9
    const box = (await video.boundingBox())!;
    expect(Math.abs(box.width / box.height - 16 / 9)).toBeLessThan(0.03);

    // Первый пункт: выше папок материалов и вне них.
    const folders = page.getByRole('navigation', { name: 'Папки' });
    await expect(folders).toBeVisible();
    const folderBox = (await folders.boundingBox())!;
    expect(box.y).toBeLessThan(folderBox.y);
    await expect(folders.locator('video')).toHaveCount(0);

    // Играет сразу, без дополнительных шагов: ролик подгружается по нажатию воспроизведения.
    const state = await video.evaluate(async (el: HTMLVideoElement) => {
      el.muted = true;
      await el.play();
      await new Promise((r) => setTimeout(r, 1200));
      const r = { paused: el.paused, time: el.currentTime, ratio: el.videoWidth / el.videoHeight, error: el.error?.code ?? 0 };
      el.pause();
      return r;
    });
    expect(state.error).toBe(0);
    expect(state.paused).toBe(false);
    expect(state.time).toBeGreaterThan(0);
    expect(Math.abs(state.ratio - 16 / 9)).toBeLessThan(0.01);
  });
}

test('владелец на телефоне: видео помещается в экран, без горизонтальной прокрутки', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto('/');
  await page.getByLabel('Логин', { exact: true }).fill('ui.owner');
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await page.getByRole('tab', { name: 'Обучение', exact: true }).or(page.getByRole('button', { name: 'Обучение', exact: true })).first().click();
  const video = page.getByRole('region', { name: 'Обучающее видео' }).locator('video');
  await expect(video).toBeVisible();
  const box = (await video.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('если ролик не загрузился, показывается понятное сообщение', async ({ page }) => {
  await page.route('**/videos/role-owner.mp4*', (route) => route.abort());
  await page.goto('/');
  await page.getByLabel('Логин', { exact: true }).fill('ui.owner');
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await page.getByRole('tab', { name: 'Обучение', exact: true }).or(page.getByRole('button', { name: 'Обучение', exact: true })).first().click();
  const video = page.getByRole('region', { name: 'Обучающее видео' }).locator('video');
  await video.evaluate((el: HTMLVideoElement) => el.play().catch(() => undefined));
  await expect(page.getByRole('alert').filter({ hasText: 'Не удалось загрузить видео' })).toBeVisible();
});
