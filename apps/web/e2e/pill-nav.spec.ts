import { expect, test, type Locator, type Page } from '@playwright/test';

const password = 'ui-fixture-password-only';

test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:4181/__reset');
});

async function enter(page: Page) {
  await page.goto('/');
  await page.getByLabel('Логин', { exact: true }).fill('ui.owner');
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('complementary').getByRole('tab').first()).toBeVisible();
}

/** Подложка выбранного пункта в контейнере: рамка пункта и рамка подложки. */
async function pillAndActive(box: Locator) {
  return box.evaluate((el) => {
    const pill = el.querySelector('span[aria-hidden="true"]') as HTMLElement;
    const active = el.querySelector('[aria-selected="true"],[aria-pressed="true"]') as HTMLElement;
    const a = active.getBoundingClientRect();
    const p = pill.getBoundingClientRect();
    return { a: [a.left, a.top, a.right, a.bottom], p: [p.left, p.top, p.right, p.bottom], opacity: getComputedStyle(pill).opacity };
  });
}

async function expectSettled(box: Locator) {
  await expect
    .poll(async () => {
      const { a, p } = await pillAndActive(box);
      return a.every((v, i) => Math.abs(v - p[i]) < 1.5);
    })
    .toBe(true);
}

test('подложка меню переезжает к выбранному пункту и не двигает раскладку', async ({ page }) => {
  await enter(page);
  const nav = page.getByRole('tablist', { name: 'Разделы', exact: true });
  await expectSettled(nav);
  const tabs = nav.getByRole('tab');
  const rects = () => tabs.evaluateAll((els) => els.map((e) => JSON.stringify(e.getBoundingClientRect())));
  const before = await rects();
  const target = tabs.nth(2);
  await target.click();
  await page.waitForTimeout(120);
  const mid = await pillAndActive(nav);
  // В пути: подложка ещё не легла на пункт и растянута.
  expect(mid.a.every((v, i) => Math.abs(v - mid.p[i]) < 1.5)).toBe(false);
  await expectSettled(nav);
  expect(await rects()).toEqual(before);
});

test('переключатель «Список / Канбан» и вкладки проекта: подложка ложится на выбранный пункт', async ({ page }) => {
  await enter(page);
  await page.getByRole('tab', { name: 'Проекты', exact: true }).click();
  const view = page.getByRole('group', { name: 'Вид проектов' });
  await expectSettled(view);
  await view.getByRole('button', { name: 'Канбан', exact: true }).click();
  await expect(view.getByRole('button', { name: 'Канбан', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expectSettled(view);
  await view.getByRole('button', { name: 'Список', exact: true }).click();
  await expectSettled(view);

  await page.locator('table tbody tr').first().click();
  const tabs = page.getByRole('tablist', { name: 'Разделы проекта' });
  await expectSettled(tabs);
  await tabs.getByRole('tab', { name: 'Документы', exact: true }).click();
  await expect(tabs.getByRole('tab', { name: 'Документы', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expectSettled(tabs);
});

test('«уменьшить движение»: подложка встаёт на место сразу', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  await enter(page);
  const nav = page.getByRole('tablist', { name: 'Разделы', exact: true });
  await nav.getByRole('tab').nth(2).click();
  const { a, p } = await pillAndActive(nav);
  expect(a.every((v, i) => Math.abs(v - p[i]) < 1.5)).toBe(true);
  await ctx.close();
});

test('телефон: нижняя панель, подложка под выбранной вкладкой', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await enter(page);
  const nav = page.getByRole('tablist', { name: 'Разделы', exact: true });
  await expectSettled(nav);
  await nav.getByRole('tab').nth(3).click();
  await expectSettled(nav);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await ctx.close();
});
