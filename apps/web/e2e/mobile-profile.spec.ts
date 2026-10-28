import { test, expect, type Page } from '@playwright/test';

const password = 'ui-fixture-password-only';
const navRole = (_role: string) => 'tab' as const;

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
/**
 * Влезают ли шесть вкладок, зависит от шрифта. На телефонах это Roboto / SF, а на CI
 * system-ui — широкий DejaVu. Для проверок «влезает без прокрутки» берём Arial
 * (на CI — метрически совместимый Liberation Sans), близкий по ширине к Roboto.
 */
async function pinPhoneFont(page: Page) {
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style');
      style.textContent = ':root, body { --font: Arial, sans-serif !important; }';
      document.head.append(style);
    });
  });
}

const strip = (page: Page) => nav(page).locator('[class*="scroll"]').first();

/** Прокрутка ленты вкладок к началу или к концу (без анимации). */
async function scrollStrip(page: Page, to: 'start' | 'end') {
  await strip(page).evaluate((el, end) => {
    el.style.scrollBehavior = 'auto';
    el.scrollLeft = end ? el.scrollWidth : 0;
    el.dispatchEvent(new Event('scroll'));
    el.style.scrollBehavior = '';
  }, to === 'end');
}

/** По центру вкладки при клике попадаем именно в неё, а не в соседнюю. */
async function hitTarget(page: Page, id: string) {
  return nav(page)
    .locator(`[data-nav-id="${id}"]`)
    .evaluate((el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!hit && el.contains(hit);
    });
}

async function expectNoOverlap(page: Page) {
  const rects = await nav(page)
    .locator('button')
    .evaluateAll((buttons) => buttons.map((b) => b.getBoundingClientRect()).map((r) => [r.left, r.right]));
  for (let i = 1; i < rects.length; i += 1) {
    expect(rects[i]![0], `вкладка ${i} не наезжает на ${i - 1}`).toBeGreaterThanOrEqual(rects[i - 1]![1] - 0.5);
  }
}

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
      // «Профиль» — обычный последний пункт ленты, не закреплён поверх других.
      expect(await last.evaluate((el) => getComputedStyle(el).position)).not.toBe('sticky');
      // Докручиваем ленту до конца: «Профиль» виден целиком у правого края.
      await scrollStrip(page, 'end');
      await expect(last).toBeInViewport({ ratio: 1 });
      const box = (await last.boundingBox())!;
      expect(box.x + box.width).toBeGreaterThan(width - 24);
      expect(box.height).toBeGreaterThanOrEqual(44);
      // Ничего не перекрывает его, и вкладки не наезжают друг на друга.
      expect(await hitTarget(page, 'profile')).toBe(true);
      await expectNoOverlap(page);

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
  await pinPhoneFont(page);
  await enter(page, 'admin');
  const tabs = nav(page).getByRole('tab');
  await expect(tabs).toHaveCount(6);
  for (let i = 0; i < 6; i += 1) await expect(tabs.nth(i)).toBeInViewport({ ratio: 1 });
});

test('360px · admin: вкладки стоят ровно, без прокрутки и затухания', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await pinPhoneFont(page);
  await enter(page, 'admin');
  const el = strip(page);
  expect(await el.evaluate((e) => e.scrollWidth - e.clientWidth)).toBeLessThanOrEqual(1);
  await expect(el).not.toHaveAttribute('data-overflow', /.*/);
  await expect(el).not.toHaveAttribute('data-fade-end', /.*/);
  expect(await el.evaluate((e) => getComputedStyle(e).maskImage)).toBe('none');
  // Равномерно: промежутки между вкладками одинаковые, ряд занимает всю ширину.
  const rects = await nav(page)
    .getByRole('tab')
    .evaluateAll((tabs) => tabs.map((t) => t.getBoundingClientRect()).map((r) => [r.left, r.right]));
  const gaps = rects.slice(1).map((r, i) => r[0]! - rects[i]![1]!);
  for (const g of gaps) expect(Math.abs(g - gaps[0]!)).toBeLessThanOrEqual(1);
  expect(rects.at(-1)![1]).toBeGreaterThan(360 - 24);
  await expectNoOverlap(page);
});

for (const width of [360, 390]) {
  test(`${width}px · owner: панель — горизонтальная лента, «Профиль» последний и доступен прокруткой`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await enter(page, 'owner');
    const el = strip(page);
    const tabs = nav(page).getByRole('tab');
    await expect(tabs).toHaveCount(8);
    await expect(tabs.last()).toHaveAttribute('data-nav-id', 'profile');
    await expect(nav(page).getByRole('tab', { name: 'Обучение', exact: true })).toHaveCount(1);

    // Восемь вкладок не влезают: лента со snap, без полосы, «Профиль» докручивается.
    const style = await el.evaluate((e) => {
      const cs = getComputedStyle(e);
      return { overflowX: cs.overflowX, snap: cs.scrollSnapType, bar: cs.scrollbarWidth, overflow: e.scrollWidth - e.clientWidth };
    });
    expect(style.overflowX).toBe('auto');
    expect(style.snap).toContain('x');
    expect(style.bar).toBe('none');
    expect(style.overflow).toBeGreaterThan(1);

    await scrollStrip(page, 'start');
    await expect(tabs.first()).toBeInViewport({ ratio: 1 });
    await expect(el).not.toHaveAttribute('data-fade-start', /.*/);
    await expectNoOverlap(page);

    await scrollStrip(page, 'end');
    await expect(tabs.last()).toBeInViewport({ ratio: 1 });
    expect(await hitTarget(page, 'profile')).toBe(true);
    await expectNoOverlap(page);
    // Ни одна вкладка не спрятана под другой: в своей точке каждая — сама себе цель.
    for (const id of await tabs.evaluateAll((t) => t.map((b) => b.getAttribute('data-nav-id')!))) {
      const tab = nav(page).locator(`[data-nav-id="${id}"]`);
      await tab.evaluate((b) => b.scrollIntoView({ inline: 'center', block: 'nearest' }));
      expect(await hitTarget(page, id), `вкладка ${id} не перекрыта`).toBe(true);
    }
    await tabs.last().click();
    await expect(page.getByRole('region', { name: 'Профиль' })).toBeVisible();
  });
}

test('390px · owner: активная вкладка сама докручивается в видимую область', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enter(page, 'owner');
  const profile = nav(page).locator('[data-nav-id="profile"]');
  await profile.evaluate((b) => b.scrollIntoView({ inline: 'center', block: 'nearest' }));
  await expect(profile).toBeInViewport({ ratio: 1 });
  await profile.click();
  await expect(profile).toHaveAttribute('aria-selected', 'true');
  const first = nav(page).getByRole('tab').first();
  await first.click();
  await expect(first).toHaveAttribute('aria-selected', 'true');
  await expect(first).toBeInViewport({ ratio: 1 });
});

test('phone: вкладка «Профиль» открывает профиль, активна, «Выйти» выходит', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enter(page, 'admin');
  const profileTab = nav(page).getByRole('tab', { name: 'Профиль', exact: true });
  const analytics = nav(page).getByRole('tab', { name: 'Аналитика', exact: true });
  await expect(page.getByRole('tab', { name: 'Сегодня', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(analytics).toHaveAttribute('aria-selected', 'false');
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
  await nav(page).getByRole('tab', { name: 'Партнёры', exact: true }).click();
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
  await expect(item).toHaveAttribute('aria-selected', 'true');
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
