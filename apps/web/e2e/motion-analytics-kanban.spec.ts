import { expect, test, type Locator, type Page } from '@playwright/test';

const password = 'ui-fixture-password-only';

test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:4181/__reset');
});

async function enter(page: Page, role = 'owner') {
  await page.goto('/');
  await page.getByLabel('Логин', { exact: true }).fill(`ui.${role}`);
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('complementary').getByRole('tab').first()).toBeVisible();
}

async function expectPillOnActive(box: Locator) {
  await expect
    .poll(async () =>
      box.evaluate((el) => {
        const pill = el.querySelector('span[aria-hidden="true"]') as HTMLElement;
        const active = el.querySelector('[aria-selected="true"]') as HTMLElement;
        const a = active.getBoundingClientRect();
        const p = pill.getBoundingClientRect();
        return [a.left - p.left, a.top - p.top, a.right - p.right, a.bottom - p.bottom].every((d) => Math.abs(d) < 1.5);
      }),
    )
    .toBe(true);
}

test('аналитика: вкладки с подложкой, показатели досчитываются и не оставляют inline-стилей', async ({ page }) => {
  await enter(page);
  await page.getByRole('tab', { name: 'Аналитика', exact: true }).click();
  const tabs = page.getByRole('tablist', { name: 'Разделы аналитики' });
  await expectPillOnActive(tabs);
  const second = tabs.getByRole('tab').nth(1);
  await second.click();
  await expect(second).toHaveAttribute('aria-selected', 'true');
  await expectPillOnActive(tabs);
  await tabs.getByRole('tab').first().click();
  await expectPillOnActive(tabs);

  // После анимации числа финальные, а у карточек не остаётся transform/opacity.
  const kpis = page.locator('button[aria-pressed] strong');
  await expect(kpis.first()).toBeVisible();
  await expect
    .poll(async () => kpis.evaluateAll((els) => els.map((e) => (e.textContent ?? '').trim()).every((t) => /^\d+(\.\d)?$/.test(t))))
    .toBe(true);
  await page.waitForTimeout(1600);
  const leftovers = await page.locator('button[aria-pressed]').evaluateAll((els) => els.map((e) => (e as HTMLElement).style.cssText).filter(Boolean));
  expect(leftovers).toEqual([]);
});

test('«уменьшить движение»: аналитика без анимаций, значения сразу на месте', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  await enter(page);
  await page.getByRole('tab', { name: 'Аналитика', exact: true }).click();
  const kpi = page.locator('button[aria-pressed]').first();
  await expect(kpi).toBeVisible();
  expect(await kpi.evaluate((e) => (e as HTMLElement).style.cssText)).toBe('');
  expect(await kpi.evaluate((e) => getComputedStyle(e).opacity)).toBe('1');
  await ctx.close();
});

test('вкладки «Компания» и «Обучение»: подложка ложится на выбранную вкладку', async ({ page }) => {
  await enter(page);
  await page.getByRole('tab', { name: 'Компания', exact: true }).click();
  const company = page.getByRole('tablist', { name: 'Разделы компании' });
  await expectPillOnActive(company);
  await company.getByRole('tab', { name: 'Сотрудники', exact: true }).click();
  await expect(company.getByRole('tab', { name: 'Сотрудники', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expectPillOnActive(company);

  await page.getByRole('tab', { name: 'Обучение', exact: true }).click();
  const training = page.getByRole('tablist', { name: 'Разделы обучения' });
  await expectPillOnActive(training);
  await training.getByRole('tab', { name: 'Тренажёр', exact: true }).click();
  await expect(training.getByRole('tab', { name: 'Тренажёр', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expectPillOnActive(training);
});

test('канбан: после переноса счётчики верные, у карточек нет залипших transform, перетаскивание цело', async ({ page }) => {
  await enter(page);
  await page.getByRole('tab', { name: 'Проекты', exact: true }).click();
  await page.getByRole('button', { name: 'Канбан', exact: true }).click();
  await expect(page.locator('[data-project-stage]')).toHaveCount(5);
  const card = page.locator('[data-project-id="ui_project"]');
  const install = page.locator('[data-project-stage="install"]');
  const proposal = page.locator('[data-project-stage="proposal"]');
  await expect(install.locator('[data-project-id="ui_project"]')).toBeVisible();
  const countOf = async (col: Locator) => col.locator('h3 + span').textContent();
  const fromBefore = Number((await countOf(install)) ?? '0');
  const toBefore = Number((await countOf(proposal)) ?? '0');
  await page.waitForTimeout(1200);

  const a = (await card.boundingBox())!;
  const b = (await proposal.boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 12, a.y + a.height / 2 + 4, { steps: 3 });
  await page.mouse.move(b.x + b.width / 2, b.y + 90, { steps: 12 });
  // В руке карточка поднята: масштаб и наклон от GSAP.
  await expect
    .poll(() => page.locator('[data-project-overlay]').evaluate((e) => getComputedStyle(e).transform))
    .not.toBe('none');
  await page.mouse.up();
  await expect(proposal.locator('[data-project-id="ui_project"]')).toBeVisible();
  await page.waitForTimeout(900);
  expect(Number(await countOf(install))).toBe(fromBefore - 1);
  expect(Number(await countOf(proposal))).toBe(toBefore + 1);
  const stuck = await page.locator('[data-flip-id]').evaluateAll((els) => els.map((e) => (e as HTMLElement).style.transform).filter((t) => t && t !== 'none'));
  expect(stuck).toEqual([]);
  await expect(page).not.toHaveURL(/#project\//);
});
