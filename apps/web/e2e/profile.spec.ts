import { test, expect, type Page } from '@playwright/test';

const password = 'ui-fixture-password-only';
const nextPassword = 'ui-updated-password-only';

test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:4181/__reset');
});

async function enter(page: Page, login = 'ui.owner', pw = password) {
  await page.goto('/');
  await page.getByLabel('Логин', { exact: true }).fill(login);
  await page.getByLabel('Пароль', { exact: true }).fill(pw);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Мой профиль', exact: true })).toBeVisible();
}

async function openProfile(page: Page) {
  await page.getByRole('button', { name: 'Мой профиль', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Мой профиль' });
  await expect(dialog).toBeVisible();
  return dialog;
}

function pngBase64(page: Page) {
  return page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 512;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#16816a';
    ctx.fillRect(0, 0, 1024, 512);
    return c.toDataURL('image/png').split(',')[1]!;
  });
}

test('photo uploads without the current password, styled button shows file name', async ({ page }) => {
  await enter(page);
  const dialog = await openProfile(page);
  // Отдельного поля «Текущий пароль» в форме больше нет.
  await expect(dialog.getByLabel('Текущий пароль', { exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Загрузить фото', exact: true })).toBeVisible();
  await expect(dialog.getByText('Файл не выбран')).toBeVisible();
  await expect(dialog.getByText(/JPEG, PNG или WebP/)).toBeVisible();

  const chooser = page.waitForEvent('filechooser');
  await dialog.getByRole('button', { name: 'Загрузить фото', exact: true }).click();
  const upload = page.waitForRequest((r) => r.url().endsWith('/me/avatar') && r.method() === 'PUT');
  await (await chooser).setFiles({ name: 'test.png', mimeType: 'image/png', buffer: Buffer.from(await pngBase64(page), 'base64') });
  const request = await upload;
  expect(request.postDataJSON().mime).toBe('image/webp');
  expect(request.postDataJSON().currentPassword).toBeUndefined();
  expect(Buffer.from(request.postDataJSON().base64, 'base64').length).toBeLessThanOrEqual(200 * 1024);
  await expect(dialog.getByRole('status')).toHaveText('Фото обновлено');
  await expect(dialog.getByText('test.png')).toBeVisible();
  await expect
    .poll(() => dialog.getByRole('img', { name: 'Фото профиля' }).evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBe(256);
});

test('password change asks the current password in a confirm dialog', async ({ page }) => {
  await enter(page);
  const dialog = await openProfile(page);
  await dialog.getByLabel('Новый пароль', { exact: true }).fill(nextPassword);
  await dialog.getByLabel('Повторите пароль').fill('mismatch-password-x');
  await dialog.getByRole('button', { name: 'Сменить пароль', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Пароли не совпадают');
  await expect(page.getByRole('dialog', { name: 'Сменить пароль' })).toHaveCount(0);

  await dialog.getByLabel('Повторите пароль').fill(nextPassword);
  const trigger = dialog.getByRole('button', { name: 'Сменить пароль', exact: true });
  await trigger.click();
  const confirm = page.getByRole('dialog', { name: 'Сменить пароль' });
  await expect(confirm).toBeVisible();
  const current = confirm.getByLabel('Текущий пароль', { exact: true });
  await expect(current).toBeFocused();
  expect(await current.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);

  // Показать / скрыть.
  await current.fill('incorrect');
  await expect(current).toHaveAttribute('type', 'password');
  await confirm.getByRole('button', { name: 'Показать пароль' }).click();
  await expect(current).toHaveAttribute('type', 'text');
  await confirm.getByRole('button', { name: 'Скрыть пароль' }).click();
  await expect(current).toHaveAttribute('type', 'password');

  // Неверный пароль: ошибка под полем, окно остаётся, фокус в поле.
  await current.press('Enter');
  await expect(confirm.getByRole('alert')).toHaveText('Текущий пароль неверен');
  await expect(current).toHaveAttribute('aria-invalid', 'true');
  await expect(current).toBeFocused();

  // Esc закрывает только подтверждение, фокус возвращается на кнопку.
  await page.keyboard.press('Escape');
  await expect(confirm).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await expect(trigger).toBeFocused();

  await trigger.click();
  await confirm.getByLabel('Текущий пароль', { exact: true }).fill(password);
  await confirm.getByLabel('Текущий пароль', { exact: true }).press('Enter');
  await expect(confirm).toHaveCount(0);
  await expect(dialog.getByRole('status')).toContainText('Пароль обновлён');

  // Логин — тоже через подтверждение.
  await dialog.getByLabel('Логин', { exact: true }).fill('ui.owner.renamed');
  await dialog.getByRole('button', { name: 'Сохранить логин', exact: true }).click();
  const confirmLogin = page.getByRole('dialog', { name: 'Сохранить новый логин' });
  await expect(confirmLogin).toContainText('ui.owner.renamed');
  await confirmLogin.getByLabel('Текущий пароль', { exact: true }).fill(nextPassword);
  await confirmLogin.getByRole('button', { name: 'Сохранить логин', exact: true }).click();
  await expect(confirmLogin).toHaveCount(0);
  await expect(dialog.getByRole('status')).toHaveText('Логин обновлён');

  await dialog.getByRole('button', { name: 'Закрыть профиль' }).click();
  await page.getByRole('button', { name: 'Выйти', exact: true }).click();
  await enter(page, 'ui.owner.renamed', nextPassword);
});

test('phone: profile sheet and confirm dialog fit, targets ≥44px, dark theme', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enter(page, 'ui.crew');
  await page.evaluate(() => document.body.classList.add('theme-dark'));
  const dialog = await openProfile(page);
  const box = await dialog.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(390 - 16);
  for (const name of ['Загрузить фото', 'Сохранить логин', 'Сменить пароль', 'Закрыть профиль']) {
    const b = await dialog.getByRole('button', { name, exact: true }).boundingBox();
    expect(b!.height, name).toBeGreaterThanOrEqual(44);
  }
  await dialog.getByLabel('Новый пароль', { exact: true }).fill(nextPassword);
  await dialog.getByLabel('Повторите пароль').fill(nextPassword);
  await dialog.getByRole('button', { name: 'Сменить пароль', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: 'Сменить пароль' });
  const c = await confirm.boundingBox();
  expect(c!.x).toBeGreaterThanOrEqual(0);
  expect(c!.x + c!.width).toBeLessThanOrEqual(390);
  const eye = await confirm.getByRole('button', { name: 'Показать пароль' }).boundingBox();
  expect(eye!.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.scrollingElement!.scrollWidth <= window.innerWidth)).toBe(true);
  await confirm.getByRole('button', { name: 'Отмена', exact: true }).click();
  await expect(confirm).toHaveCount(0);
});
