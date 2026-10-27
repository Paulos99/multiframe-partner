import { test, expect, type Page } from '@playwright/test';

const password = 'ui-fixture-password-only';
const API = 'http://127.0.0.1:4181';
const SHOTS = process.env.ITOGI_SHOTS || '';

test.beforeEach(async ({ request }) => {
  await request.post(`${API}/__reset`);
});

async function enter(page: Page, role: string) {
  await page.goto('/');
  await page.getByLabel('Логин', { exact: true }).fill(`ui.${role}`);
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Проблемомер', exact: true })).toBeVisible();
}

function toolsTab(page: Page) {
  return page.getByRole('button', { name: 'Проблемомер', exact: true });
}

/** Проходит Проблемомер руками, как партнёр: Старт → Объект → Расчёт → Итог. */
async function walkToResult(page: Page) {
  await toolsTab(page).click();
  await page.getByRole('button', { name: 'Начать', exact: true }).click();
  const title = page.getByRole('heading', { name: 'Акустический профиль помещения' });
  for (let i = 0; i < 20; i += 1) {
    if (await title.isVisible().catch(() => false)) break;
    const area = page.getByPlaceholder('Например, 18');
    if (await area.isVisible().catch(() => false)) {
      await page.getByRole('button', { name: 'Спальня' }).first().click();
      await area.fill('18');
    }
    const next = page.getByRole('button', { name: 'Далее', exact: true });
    if (await next.isVisible().catch(() => false) && (await next.isEnabled())) {
      await next.click();
    }
    await page.waitForTimeout(400);
  }
  await expect(title).toBeVisible({ timeout: 30000 });
}

const SECTIONS = [
  'Параметры комнаты',
  'Ключевые показатели',
  'Рекомендации и продукт',
  'Нормы комфорта для жилья',
  'Эффективность и сравнение на слух',
  'Уникальность системы MultiFrame',
  'Следующий шаг',
];
const BUTTONS = [
  'Рассчитать количество MultiFrame',
  'Запросить консультацию или подбор',
  'Скачать PDF',
  'Назад',
  'Пройти ещё раз',
];

async function expectFullResult(page: Page, withSave: boolean) {
  // Секции до/после должны стать видимыми (opacity 1), а не остаться прозрачными.
  for (const name of SECTIONS) {
    const section = page.getByRole('region', { name, exact: true }).or(page.getByLabel(name, { exact: true })).first();
    await section.scrollIntoViewIfNeeded();
    await expect(section, name).toHaveCSS('opacity', '1', { timeout: 5000 });
  }
  const kpi = page.getByRole('region', { name: 'Ключевые показатели', exact: true });
  for (const [title, index] of [
    ['Воздушный шум', 'Rw'],
    ['Ударный шум', 'Lnw'],
  ] as const) {
    const card = kpi.locator('article').filter({ hasText: title });
    const value = card.locator('strong');
    const hint = card.getByText(new RegExp(`разница \\d+ дБ · ${index}`));
    await expect(value).toHaveText(/на \d+% тише/);
    await expect(hint).toBeVisible();
    const [valueSize, hintSize] = await Promise.all([
      value.evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize)),
      hint.evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize)),
    ]);
    expect(valueSize, title).toBeGreaterThan(hintSize);
  }
  await expect(page.getByRole('heading', { name: 'Эффективность MultiFrame' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Сравнить на слух' })).toBeVisible();
  for (const name of BUTTONS) {
    const btn = page.getByRole('button', { name, exact: true }).last();
    await btn.scrollIntoViewIfNeeded();
    await expect(btn, name).toBeVisible();
    const op = await btn.evaluate((el) => {
      let o = 1;
      for (let n: Element | null = el; n; n = n.parentElement) o *= Number(getComputedStyle(n).opacity);
      return o;
    });
    expect(op, name).toBe(1);
  }
  if (!withSave) return;
  // Смета для КП и «Сохранить объект» остаются у ролей, которые создают объекты.
  await expect(page.getByRole('heading', { name: 'Смета для КП' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Сохранить комнату', exact: true })).toBeVisible();
}

for (const role of ['admin', 'owner', 'sales', 'measurer', 'crew'] as const) {
  test(`Итог Проблемомера: все блоки до/после и кнопки видны — ${role}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await enter(page, role);
    await walkToResult(page);
    await page.waitForTimeout(800);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/${role}-top.png` });
    await expectFullResult(page, role === 'owner' || role === 'sales');
    if (SHOTS) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${SHOTS}/${role}-full.png`, fullPage: true });
    }
    expect(errors).toEqual([]);
  });
}

test('Итог Проблемомера на телефоне: блоки видны', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enter(page, 'owner');
  await walkToResult(page);
  await expectFullResult(page, true);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/mobile-owner-full.png`, fullPage: true });
});
