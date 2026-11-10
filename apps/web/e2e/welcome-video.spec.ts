import { test, expect, type Page } from '@playwright/test';

const password = 'ui-fixture-password-only';
const nav = (page: Page) => page.getByRole('complementary', { name: 'Разделы кабинета' });

test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:4181/__reset');
});

/**
 * Стенд e2e запускает API с WELCOME_VIDEO=off (иначе окно мешало бы остальным проверкам).
 * Здесь ответ сервера «первый вход» подставляем, пока кабинет не отправит POST /me/welcome-video,
 * — так же ведёт себя настоящий сервер (см. apps/api/welcomeVideo.test.js).
 */
async function serverSaysFirstVisit(page: Page) {
  const state = { seen: 0 };
  await page.route(/127\.0\.0\.1:4181\/me\/welcome-video$/, async (route) => {
    if (route.request().method() === 'POST') state.seen += 1;
    await route.continue();
  });
  await page.route(/127\.0\.0\.1:4181\/(auth\/login|auth\/me|me)$/, async (route) => {
    if (route.request().method() === 'OPTIONS' || state.seen) return route.continue();
    const response = await route.fetch();
    let body: { user?: Record<string, unknown> } | null = null;
    try {
      body = await response.json();
    } catch {
      return route.fulfill({ response });
    }
    if (body?.user) body.user = { ...body.user, welcomeVideoPending: true };
    await route.fulfill({ response, json: body });
  });
  return state;
}

async function login(page: Page, who: string) {
  await page.goto('/');
  await page.getByLabel('Логин', { exact: true }).fill(who);
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
}

test('первый вход владельца: окно с видео роли играет само, Esc закрывает, после перезагрузки не появляется', async ({ page }) => {
  const state = await serverSaysFirstVisit(page);
  await login(page, 'ui.owner');
  const dialog = page.getByRole('dialog', { name: 'Добро пожаловать в кабинет' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('как здесь работать владельцу компании');
  await expect(dialog).toContainText('«Обучение»');
  const video = dialog.getByTestId('welcome-video-player');
  await expect(video).toHaveAttribute('src', /\/videos\/role-owner\.mp4\?v=\d+$/);
  await expect(dialog.getByRole('button', { name: 'Закрыть видео' })).toBeFocused();
  // Играет само (со звуком или, если браузер не дал, без звука с кнопкой «Включить звук»).
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime), { timeout: 15000 }).toBeGreaterThan(0.3);
  const muted = await video.evaluate((el: HTMLVideoElement) => el.muted);
  await expect(dialog.getByTestId('welcome-video-unmute')).toHaveCount(muted ? 1 : 0);
  await expect.poll(() => state.seen).toBeGreaterThan(0);

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(nav(page)).toBeVisible();
  await page.reload();
  await expect(nav(page)).toBeVisible();
  await page.waitForTimeout(800);
  await expect(page.getByTestId('welcome-video')).toHaveCount(0);
});

test('браузер запретил звук: видео идёт без звука, «Включить звук» включает; клик по фону закрывает', async ({ page }) => {
  await page.addInitScript(() => {
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      if (!this.muted && !(window as unknown as { __soundAllowed?: boolean }).__soundAllowed) {
        return Promise.reject(new DOMException('play() without user gesture', 'NotAllowedError'));
      }
      return play.call(this);
    };
  });
  await serverSaysFirstVisit(page);
  await login(page, 'ui.crew');
  const dialog = page.getByRole('dialog', { name: 'Добро пожаловать в кабинет' });
  await expect(dialog).toContainText('монтажнику');
  const video = dialog.getByTestId('welcome-video-player');
  await expect(video).toHaveAttribute('src', /\/videos\/role-crew\.mp4\?v=\d+$/);
  const unmute = dialog.getByRole('button', { name: 'Включить звук' });
  await expect(unmute).toBeVisible();
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.muted && el.currentTime > 0.2), { timeout: 15000 }).toBe(true);
  await page.evaluate(() => {
    (window as unknown as { __soundAllowed?: boolean }).__soundAllowed = true;
  });
  await unmute.click();
  await expect(unmute).toBeHidden();
  expect(await video.evaluate((el: HTMLVideoElement) => el.muted)).toBe(false);

  await page.mouse.click(8, 8);
  await expect(dialog).toBeHidden();
});

test('телефон: окно во всю ширину, крестик и «Закрыть» под рукой, крестик закрывает', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await serverSaysFirstVisit(page);
  await login(page, 'ui.crew');
  const dialog = page.getByRole('dialog', { name: 'Добро пожаловать в кабинет' });
  await expect(dialog).toBeVisible();
  await page.waitForTimeout(600); // окно появляется с лёгким увеличением — меряем после
  const box = (await dialog.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(box.width).toBeGreaterThan(350);
  const cross = dialog.getByRole('button', { name: 'Закрыть видео' });
  const crossBox = (await cross.boundingBox())!;
  expect(crossBox.width).toBeGreaterThanOrEqual(44);
  const done = dialog.getByRole('button', { name: 'Закрыть', exact: true });
  await expect(done).toBeInViewport();
  await cross.click();
  await expect(dialog).toBeHidden();
});

test('админ StP: окна с видео нет, даже если сервер прислал флаг', async ({ page }) => {
  await serverSaysFirstVisit(page);
  await login(page, 'ui.admin');
  await expect(page.getByRole('button', { name: 'Выйти' }).first()).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(800);
  await expect(page.getByTestId('welcome-video')).toHaveCount(0);
});
