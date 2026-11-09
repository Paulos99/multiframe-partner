import { expect, test, type Page } from '@playwright/test';
import { demoSignIn } from './demo-login';
import fs from 'node:fs';
import path from 'node:path';

const SHOT =
  process.env.ANALYTICS_QUIET_SHOT_DIR ||
  path.join(process.cwd(), 'test-results', 'analytics-quiet-refresh-shots');

async function openAnalytics(page: Page, role: 'owner' | 'admin' = 'owner') {
  await demoSignIn(page, role);
  await page.getByRole('tab', { name: 'Аналитика', exact: true }).click();
  const dash = page.locator('[data-analytics-busy], [data-analytics-root]').first();
  await expect(dash).toBeVisible({ timeout: 30000 });
  await expect(page.locator('[data-analytics-title], [data-analytics-kpi-row]').first()).toBeVisible({
    timeout: 30000,
  });
}

/**
 * Фоновый опрос кабинета (focus / таймер ~45 с) раньше ставил loading=true,
 * из-за чего KPI и воронка ремоунтились и снова проигрывали появление.
 * После правки узлы остаются теми же, скелета нет.
 */
test('фоновое обновление аналитики тихое: без скелета и без ремоунта KPI/воронки', async ({ page }) => {
  await openAnalytics(page, 'owner');

  const dash = page.locator('[data-analytics-busy]').first();
  await expect(dash).toHaveAttribute('data-analytics-busy', '0', { timeout: 30000 });
  const kpiRow = page.locator('[data-analytics-kpi-row]');
  const funnel = page.locator('[data-journey-funnel]').first();
  await expect(kpiRow).toBeVisible();
  await expect(funnel).toBeVisible();

  await kpiRow.evaluate((el) => el.setAttribute('data-mf-keep', '1'));
  await funnel.evaluate((el) => el.setAttribute('data-mf-keep', '1'));

  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForTimeout(400);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));

  for (let i = 0; i < 8; i += 1) {
    await expect(dash).toHaveAttribute('data-analytics-busy', '0');
    await expect(page.getByLabel('Загрузка показателя')).toHaveCount(0);
    await expect(page.getByLabel('Загрузка сводки')).toHaveCount(0);
    await page.waitForTimeout(250);
  }

  await expect(kpiRow).toHaveAttribute('data-mf-keep', '1');
  await expect(funnel).toHaveAttribute('data-mf-keep', '1');

  const leftovers = await page.locator('[data-analytics-kpi-row] > *, [data-funnel-stage]').evaluateAll((els) =>
    els
      .map((el) => (el as HTMLElement).style.cssText)
      .filter((css) => /opacity:\s*0|translate|scale/i.test(css)),
  );
  expect(leftovers).toEqual([]);
});

test('смена периода по-прежнему жёсткая: KPI монтируются заново', async ({ page }) => {
  await openAnalytics(page, 'owner');
  const kpiRow = page.locator('[data-analytics-kpi-row]');
  await expect(kpiRow).toBeVisible({ timeout: 30000 });
  await kpiRow.evaluate((el) => el.setAttribute('data-mf-keep', '1'));

  await page.getByRole('group', { name: 'Период аналитики' }).locator('button[aria-controls]').click();
  await page.getByRole('button', { name: 'Квартал', exact: true }).click();

  await expect.poll(async () => page.locator('[data-analytics-kpi-row][data-mf-keep="1"]').count()).toBe(0);

  await expect(page.locator('[data-analytics-busy]').first()).toHaveAttribute('data-analytics-busy', '0', {
    timeout: 30000,
  });
  await expect(page.locator('[data-analytics-kpi-row]')).toBeVisible();
  await expect(page.locator('[data-analytics-kpi-row]')).not.toHaveAttribute('data-mf-keep', '1');
});

test('админ: Фото отчёты и Журнал без скачка высоты и с плавным заголовком', async ({ page }) => {
  fs.mkdirSync(SHOT, { recursive: true });
  await openAnalytics(page, 'admin');
  const root = page.locator('[data-analytics-root], [data-analytics-busy]').first();
  await expect(root).toBeVisible({ timeout: 30000 });
  await expect(page.getByRole('tab', { name: 'Обзор', exact: true })).toBeVisible();

  const titleBox = page.locator('[data-analytics-title]');
  await expect(titleBox).toBeVisible();
  const beforeTitle = await titleBox.boundingBox();
  const beforeRoot = await root.boundingBox();
  expect(beforeTitle).toBeTruthy();
  expect(beforeRoot).toBeTruthy();
  await page.screenshot({ path: path.join(SHOT, 'after-overview.png'), fullPage: false });

  const scrollBefore = await page.evaluate(() => window.scrollY);

  await page.getByRole('tab', { name: 'Фото отчёты', exact: true }).click();
  await expect(page.locator('[data-analytics-pane="photos"], [data-testid="photo-cases"]').first()).toBeVisible({
    timeout: 20000,
  });
  await expect(titleBox).toContainText('Фото отчёты');
  await expect(page.getByLabel('Загрузка показателя')).toHaveCount(0);

  const afterPhotosRoot = await root.boundingBox();
  const afterPhotosTitle = await titleBox.boundingBox();
  expect(afterPhotosRoot).toBeTruthy();
  expect(afterPhotosTitle).toBeTruthy();
  // Высота карточки не схлопывается ниже прежней (есть minHeight-резерв).
  expect(afterPhotosRoot!.height).toBeGreaterThanOrEqual((beforeRoot!.height || 0) - 2);
  // Заголовок остаётся на той же вертикали (нет прыжка шапки).
  expect(Math.abs(afterPhotosTitle!.y - beforeTitle!.y)).toBeLessThan(3);
  const scrollPhotos = await page.evaluate(() => window.scrollY);
  expect(Math.abs(scrollPhotos - scrollBefore)).toBeLessThan(8);
  await page.screenshot({ path: path.join(SHOT, 'after-photos.png'), fullPage: false });

  await page.getByRole('tab', { name: 'Журнал', exact: true }).click();
  await expect(page.locator('[data-analytics-pane="objects"]').first()).toBeVisible({ timeout: 20000 });
  await expect(titleBox).toContainText('Журнал');
  await expect(page.getByLabel('Загрузка журнала')).toHaveCount(0);

  const afterJournalRoot = await root.boundingBox();
  const afterJournalTitle = await titleBox.boundingBox();
  expect(afterJournalRoot!.height).toBeGreaterThanOrEqual((beforeRoot!.height || 0) - 2);
  expect(Math.abs(afterJournalTitle!.y - beforeTitle!.y)).toBeLessThan(3);
  const scrollJournal = await page.evaluate(() => window.scrollY);
  expect(Math.abs(scrollJournal - scrollBefore)).toBeLessThan(8);
  await page.screenshot({ path: path.join(SHOT, 'after-journal.png'), fullPage: false });
});
