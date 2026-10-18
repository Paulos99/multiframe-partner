import { test, expect, type Page } from '@playwright/test';

const password = 'ui-fixture-password-only';
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

const nav = (page: Page) => page.getByRole('complementary', { name: 'Разделы кабинета' });

for (const width of [360, 390]) {
  for (const role of ['admin', 'owner', 'sales', 'measurer', 'crew']) {
    test(`${width}px · ${role}: «Профиль» — последняя вкладка, в шапке нет профиля и «Выйти»`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await enter(page, role);

      const header = page.locator('header').first();
      await expect(header.getByRole('button', { name: 'Мой профиль', exact: true })).toHaveCount(0);
      await expect(header.getByRole('button', { name: 'Выйти', exact: true })).toHaveCount(0);

      const items = nav(page).locator('button');
      const last = items.last();
      await expect(last).toHaveAttribute('data-nav-id', 'profile');
      await expect(last).toHaveAccessibleName('Профиль');
      // Видна целиком и прижата к правому краю панели.
      await expect(last).toBeInViewport({ ratio: 1 });
      const box = (await last.boundingBox())!;
      expect(box.x + box.width).toBeGreaterThan(width - 24);
      expect(box.height).toBeGreaterThanOrEqual(44);

      // Подписи не переносятся и не вылезают за свою кнопку.
      const labels = await nav(page)
        .locator('button')
        .evaluateAll((buttons) =>
          buttons.map((b) => {
            const s = b.querySelector<HTMLElement>('[class*="short"]');
            const r = b.getBoundingClientRect();
            return {
              text: s?.textContent || '',
              fits: !s || s.scrollWidth <= b.clientWidth,
              oneLine: !s || s.getBoundingClientRect().height < 20,
              height: r.height,
            };
          }),
        );
      for (const l of labels) {
        expect(l.fits, `подпись «${l.text}» помещается`).toBe(true);
        expect(l.oneLine, `подпись «${l.text}» в одну строку`).toBe(true);
      }
      expect(await page.evaluate(() => document.scrollingElement!.scrollWidth <= window.innerWidth)).toBe(true);
    });
  }
}

test('360px · admin: все шесть вкладок помещаются без прокрутки панели', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await enter(page, 'admin');
  const tabs = nav(page).getByRole('tab');
  await expect(tabs).toHaveCount(6);
  for (let i = 0; i < 6; i += 1) await expect(tabs.nth(i)).toBeInViewport({ ratio: 1 });
});

test('phone: вкладка «Профиль» открывает профиль, активна, «Выйти» выходит', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enter(page, 'admin');
  const profileTab = nav(page).getByRole('tab', { name: 'Профиль', exact: true });
  const analytics = nav(page).getByRole('tab', { name: 'Аналитика', exact: true });
  await expect(analytics).toHaveAttribute('aria-selected', 'true');
  await expect(profileTab).toHaveAttribute('aria-selected', 'false');

  await profileTab.click();
  await expect(profileTab).toHaveAttribute('aria-selected', 'true');
  await expect(analytics).toHaveAttribute('aria-selected', 'false');
  const screen = page.getByRole('region', { name: 'Профиль' });
  await expect(screen).toBeVisible();
  await expect(screen.getByText('UI admin', { exact: true })).toBeVisible();

  // Настройки профиля — то же окно, что на компьютере.
  await screen.getByRole('button', { name: 'Настройки профиля', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Мой профиль' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Закрыть профиль' }).click();
  await expect(dialog).toHaveCount(0);

  // Другая вкладка закрывает профиль.
  await nav(page).getByRole('tab', { name: 'Проекты', exact: true }).click();
  await expect(screen).toHaveCount(0);
  await expect(profileTab).toHaveAttribute('aria-selected', 'false');

  await profileTab.click();
  await page.getByRole('region', { name: 'Профиль' }).getByRole('button', { name: 'Выйти', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Войти', exact: true })).toBeVisible();
  await expect(nav(page)).toHaveCount(0);
});

test('phone · crew: «Профиль» и «Выйти» работают и в меню-кнопках', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enter(page, 'crew');
  const item = nav(page).getByRole(navRole('crew'), { name: 'Профиль', exact: true });
  await item.click();
  await expect(item).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('region', { name: 'Профиль' }).getByRole('button', { name: 'Выйти', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Войти', exact: true })).toBeVisible();
});

test('desktop и планшет: профиль и «Выйти» в шапке, вкладки «Профиль» нет', async ({ page }) => {
  for (const vp of [
    { width: 1440, height: 1000 },
    { width: 820, height: 1180 },
  ]) {
    await page.setViewportSize(vp);
    await enter(page, 'owner');
    const header = page.locator('header').first();
    await expect(header.getByRole('button', { name: 'Мой профиль', exact: true })).toBeVisible();
    await expect(header.getByRole('button', { name: 'Выйти', exact: true })).toBeVisible();
    await expect(nav(page).locator('[data-nav-id="profile"]')).toHaveCount(0);
    await header.getByRole('button', { name: 'Выйти', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Войти', exact: true })).toBeVisible();
  }
});

test('phone: фото пользователя — иконка вкладки «Профиль»', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enter(page, 'owner');
  const tab = nav(page).getByRole('tab', { name: 'Профиль', exact: true });
  await expect(tab.locator('[data-nav-icon="profile"]')).toBeVisible();
  await tab.click();
  await page.getByRole('button', { name: 'Настройки профиля', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Мой профиль' });
  const chooser = page.waitForEvent('filechooser');
  await dialog.getByRole('button', { name: 'Загрузить фото', exact: true }).click();
  const png = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#16816a';
    ctx.fillRect(0, 0, 64, 64);
    return c.toDataURL('image/png').split(',')[1]!;
  });
  await (await chooser).setFiles({ name: 'me.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await expect(dialog.getByRole('status')).toHaveText('Фото обновлено');
  await dialog.getByRole('button', { name: 'Закрыть профиль' }).click();
  await expect(tab.locator('img[data-nav-icon="avatar"]')).toBeVisible();
});
