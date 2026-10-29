import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const password = 'ui-fixture-password-only';
const API = 'http://127.0.0.1:4181';
const shots = '/workspace/review-fixes-shots';
mkdirSync(shots, { recursive: true });

test.beforeEach(async ({ request }) => {
  await request.post(`${API}/__reset`);
});

async function enter(page: Page, role: string) {
  await page.goto('/');
  await page.getByLabel('Логин', { exact: true }).fill(`ui.${role}`);
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Разделы кабинета' }).or(page.getByRole('tab', { name: 'Проекты', exact: true })).first()).toBeVisible();
}

function kind(page: Page) {
  const size = page.viewportSize();
  return size && size.width < 600 ? 'phone' : 'desktop';
}

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
]) {
  const tag = viewport.width < 600 ? 'телефон' : 'компьютер';

  test(`тренажёр: быстрый поиск без викторины (${tag})`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await enter(page, 'sales');
    const entry = page.getByRole('tab', { name: 'Обучение', exact: true }).or(page.getByRole('button', { name: 'Обучение', exact: true }));
    await entry.first().click();
    await page.getByRole('tab', { name: 'Тренажёр', exact: true }).click();
    const search = page.getByRole('region', { name: 'Быстрый поиск' });
    await expect(search).toBeVisible();
    const input = search.getByRole('searchbox');
    await input.fill('горение');
    await expect(search.getByRole('status')).toContainText('Найдено');
    const firstHit = search.locator('ul > li').first();
    await expect(firstHit).toBeVisible();
    await firstHit.getByRole('button').first().click();
    await expect(firstHit).toContainText(/Ответ|Эталон|Пояснение/i);
    // викторины нет: ни вариантов ответа, ни кнопки проверки
    await expect(page.locator('[data-option]')).toHaveCount(0);
    await search.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${shots}/item4-trainer-search-горение-${kind(page)}.png` });
    await input.fill('цена');
    await expect(search.getByRole('status')).toContainText('Найдено');
    await input.fill('ДОТ');
    await page.screenshot({ path: `${shots}/item4-trainer-search-ДОТ-${kind(page)}.png` });
    await input.fill('ъъъъ');
    await expect(search.getByRole('status')).toContainText('Ничего не нашлось');
    // поле не уезжает за экран телефона
    const box = await input.boundingBox();
    expect(box && box.x >= 0 && box.x + box.width <= viewport.width).toBeTruthy();
  });

  test(`Проблемомер: три уровня без «ниже допустимого» (${tag})`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await enter(page, 'owner');
    await page.getByRole('button', { name: 'Проблемомер', exact: true }).click();
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
      if ((await next.isVisible().catch(() => false)) && (await next.isEnabled())) await next.click();
      await page.waitForTimeout(400);
    }
    await expect(title).toBeVisible({ timeout: 30000 });
    const body = page.locator('body');
    for (const banned of ['ниже допустимого', 'Допустимый', 'Сильный дискомфорт', 'важно для вас', 'до 17 дБ']) {
      await expect(body).not.toContainText(banned, { ignoreCase: true });
    }
    await page.screenshot({ path: `${shots}/item3-result-top-${kind(page)}.png` });
    const norms = page.getByLabel('Нормы комфорта для жилья', { exact: true });
    await norms.scrollIntoViewIfNeeded();
    await expect(norms).toContainText('Дискомфорт');
    await expect(norms).toContainText('Комфорт');
    await expect(norms).toContainText('Высокий комфорт');
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${shots}/item3-comfort-scale-${kind(page)}.png` });
  });
}

test('PDF: три уровня комфорта, без запрещённых формулировок', async ({ page }) => {
  await page.setViewportSize({ width: 794, height: 1123 });
  await page.goto('/');
  const html = await page.evaluate(async () => {
    const session = await import('/src/state/session.ts');
    const pdf = await import('/src/state/reportPdf.ts');
    const base = session.createInitialSession();
    const full = session.withDerived({
      ...base,
      step: 'result',
      answers: {
        ...base.answers,
        room: {
          ...base.answers.room,
          slabType: 'wood',
          slabThickness: 'about_160_200',
          floorAbove: 'ordinary',
          houseType: 'wood',
          objectStage: 'renovation',
          plannedCeiling: 'stretch_planned',
          noisyNeighbors: 'sometimes_noisy',
          roomType: 'kids',
          ceilingAreaM2: 22,
          roomWish: 'general',
        },
      },
    });
    return pdf.buildAcousticProfileHtml(full);
  });
  for (const banned of ['ниже допустимого', 'допустимый', 'сильный дискомфорт', 'важно для вас', 'до 17 дБ']) {
    expect(html.toLowerCase()).not.toContain(banned);
  }
  expect(html).toContain('Высокий комфорт');
  expect(html).toContain('Дискомфорт');
  await page.setContent(html, { waitUntil: 'load' });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${shots}/item3-pdf-preview.png`, fullPage: true });
});
