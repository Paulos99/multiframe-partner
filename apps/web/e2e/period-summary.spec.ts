import { expect, test, type Page } from '@playwright/test';
import { demoSignIn, type DemoRole } from './demo-login';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT =
  process.env.SUMMARY_SHOT_DIR ||
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../handover/screenshots-analytics');

async function enterDemo(page: Page, role: DemoRole) {
  await demoSignIn(page, role);
  await page.getByRole('tab', { name: 'Аналитика', exact: true }).click();
  const panes = page.locator('[data-overview-panes]');
  await expect(panes).toBeVisible({ timeout: 30000 });
  await panes.getByRole('tab', { name: 'Сводка', exact: true }).click();
  await expect(page.locator('[data-overview-pane="summary"]')).toBeVisible();
}

test.describe('Сводка за период', () => {
  test('владелец: выводы с советами, сравнение с прошлым периодом, квартал, печать', async ({ page }) => {
    fs.mkdirSync(OUT, { recursive: true });
    await enterDemo(page, 'owner');
    const summary = page.locator('[data-period-summary]');
    await expect(summary).toBeVisible({ timeout: 30000 });
    await expect(summary.getByRole('heading', { name: 'Сводка за период' })).toBeVisible();
    await expect(summary).toContainText('сравнение с периодом');
    const items = summary.locator('[data-summary-list="main"] [data-conclusion]');
    const count = await items.count();
    expect(count).toBeGreaterThanOrEqual(3);
    expect(count).toBeLessThanOrEqual(7);
    await expect(items.first()).toContainText('Что сделать:');
    // Демо даёт содержательные выводы, а не «мало данных».
    await expect(summary.locator('[data-conclusion="not_enough"]')).toHaveCount(0);
    await expect(summary.locator('[data-conclusion="conversion"]')).toContainText('До КП дошли');
    await expect(summary.locator('[data-conclusion="sales"]')).toContainText('₽');
    // Воронка и отказы — на вкладке «Показатели».
    await page.getByRole('tab', { name: 'Показатели', exact: true }).click();
    const funnel = page.locator('[data-journey-funnel][data-funnel-compact]').first();
    await expect(funnel.locator('[data-funnel-group]')).toHaveCount(6);
    await expect(page.locator('[data-outcome-kpis]')).toBeVisible();
    await page.getByRole('tab', { name: 'Сводка', exact: true }).click();
    await expect(page.locator('[data-period-summary]')).toBeVisible();
    await page.waitForTimeout(600);
    await summary.screenshot({ path: path.join(OUT, 'owner-summary-7days.png') });
    await page.screenshot({ path: path.join(OUT, 'owner-analytics-page.png'), fullPage: true });

    await page.getByRole('group', { name: 'Период аналитики' }).locator('button[aria-controls]').click();
    await page.getByRole('button', { name: 'Квартал', exact: true }).click();
    await expect(summary.locator('[data-summary-list="main"] [data-conclusion]').first()).toBeVisible();
    await expect(summary).toContainText('сравнение с периодом');
    await page.waitForTimeout(600);
    await summary.screenshot({ path: path.join(OUT, 'owner-summary-quarter.png') });

    await page.getByRole('group', { name: 'Период аналитики' }).locator('button[aria-controls]').click();
    await page.getByRole('button', { name: 'Всё время', exact: true }).click();
    await expect(summary).toContainText('без сравнения');

    await page.getByRole('group', { name: 'Период аналитики' }).locator('button[aria-controls]').click();
    await page.getByRole('button', { name: '7 дней', exact: true }).click();
    await expect(summary).toContainText('сравнение с периодом');

    const [popup] = await Promise.all([
      page.waitForEvent('popup'),
      summary.getByRole('button', { name: 'Распечатать сводку или сохранить в PDF' }).click(),
    ]);
    await popup.evaluate(() => {
      window.print = () => undefined;
    });
    await expect(popup.locator('h1')).toHaveText('Сводка за период');
    await expect(popup.locator('li').first()).toContainText('Что сделать:');
    await popup.screenshot({ path: path.join(OUT, 'owner-summary-print.png'), fullPage: true });
    await popup.close();
  });

  test('админ StP: выводы по сети, выводы по партнёрам и таблица сравнения со стрелками', async ({ page }) => {
    fs.mkdirSync(OUT, { recursive: true });
    await enterDemo(page, 'admin');
    const summary = page.locator('[data-period-summary]');
    await expect(summary).toBeVisible({ timeout: 30000 });
    await expect(summary.getByRole('heading', { name: 'Сводка по сети за период' })).toBeVisible();
    await expect(summary.locator('[data-summary-list="partners"] [data-conclusion]').first()).toBeVisible();
    await page.waitForTimeout(600);
    await summary.screenshot({ path: path.join(OUT, 'admin-summary.png') });

    await summary.getByRole('button', { name: 'Сравнение партнёров' }).click();
    const table = page.locator('[data-partner-comparison]');
    await expect(table).toBeVisible();
    await expect(table.locator('[data-partner-row]').first()).toContainText('Потолки Столицы');
    await expect(table.locator('[aria-label^="к прошлому периоду"]').first()).toBeVisible();
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, 'admin-partner-comparison.png'), fullPage: true });
  });

  test('замерщик не видит аналитику и сводку', async ({ page }) => {
    await demoSignIn(page, 'measurer');
    await expect(page.getByRole('tab', { name: 'Аналитика', exact: true })).toHaveCount(0);
    await expect(page.locator('[data-period-summary]')).toHaveCount(0);
  });
});
