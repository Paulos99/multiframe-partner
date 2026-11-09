import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT =
  process.env.ANALYTICS_TABS_SHOT_DIR ||
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../handover/screenshots-analytics-tabs');

async function openAnalytics(page: Page, role: RegExp) {
  await page.goto('/?demo=1');
  await page.getByRole('button', { name: role }).first().click();
  await expect(page.getByRole('complementary', { name: 'Разделы кабинета' })).toBeVisible({ timeout: 30000 });
  await page.getByRole('tab', { name: 'Аналитика', exact: true }).click();
}

test.describe('analytics overview panes + team navigation + staff blocks', () => {
  test('owner: Показатели/Сводка; сотрудник: график, топ-7, возврат', async ({ page }) => {
    fs.mkdirSync(OUT, { recursive: true });
    await page.setViewportSize({ width: 1280, height: 900 });
    await openAnalytics(page, /Владелец/);

    const panes = page.locator('[data-overview-panes]');
    await expect(panes).toBeVisible({ timeout: 30000 });
    await expect(page.getByRole('tab', { name: 'Показатели', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('[data-overview-pane="metrics"]')).toBeVisible();
    await expect(page.locator('[data-journey-funnel][data-funnel-compact]').first()).toBeVisible();
    await page.screenshot({ path: path.join(OUT, 'owner-metrics-desktop.png'), fullPage: false });

    await page.getByRole('tab', { name: 'Сводка', exact: true }).click();
    await expect(page.locator('[data-period-summary]')).toBeVisible();
    await expect(page.locator('[data-overview-pane="summary"]')).toBeVisible();
    await page.screenshot({ path: path.join(OUT, 'owner-summary-desktop.png'), fullPage: false });

    // Период сохраняется при уходе в сотрудников и возврате.
    await page.getByRole('group', { name: 'Период аналитики' }).locator('button[aria-controls]').click();
    await page.getByRole('button', { name: 'Квартал', exact: true }).click();

    await page.getByRole('tab', { name: 'Сотрудники', exact: true }).click();
    await expect(page.getByRole('button', { name: '← Общая аналитика' })).toBeVisible();
    const manager = page.getByRole('button', { name: /Елена Крылова|Крылова|Менеджер/ }).first();
    await expect(manager).toBeVisible({ timeout: 20000 });
    await manager.click();
    await expect(page.locator('[data-staff-personal]')).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole('button', { name: '← Общая аналитика' })).toBeVisible();
    await expect(page.locator('[data-staff-monthly-chart]')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Топ-7 проектов за период' })).toBeVisible();
    await page.screenshot({ path: path.join(OUT, 'staff-personal-desktop.png'), fullPage: false });

    await page.getByRole('button', { name: '← Общая аналитика' }).click();
    await expect(page.locator('[data-overview-panes]')).toBeVisible({ timeout: 20000 });
    // Период тот же (квартал ≈ 3 месяца): в кнопке показываются даты, не слово «Квартал».
    await expect(page.getByRole('group', { name: 'Период аналитики' })).toContainText(/авг|ноя|квартал/i);

    // Снова в сотрудника и назад браузера.
    await page.getByRole('tab', { name: 'Сотрудники', exact: true }).click();
    await manager.click();
    await expect(page.locator('[data-staff-personal]')).toBeVisible();
    await page.goBack();
    await expect(page.getByRole('button', { name: '← Общая аналитика' })).toBeVisible();
    await expect(page.locator('[data-staff-personal]')).toHaveCount(0);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('tab', { name: 'Обзор', exact: true }).click();
    await page.getByRole('tab', { name: 'Показатели', exact: true }).click();
    await page.screenshot({ path: path.join(OUT, 'owner-metrics-mobile.png'), fullPage: false });
    await page.getByRole('tab', { name: 'Сводка', exact: true }).click();
    await page.screenshot({ path: path.join(OUT, 'owner-summary-mobile.png'), fullPage: false });
  });

  test('admin StP: возврат из сотрудников сети в общую аналитику', async ({ page }) => {
    fs.mkdirSync(OUT, { recursive: true });
    await openAnalytics(page, /^Админ StP/);
    await expect(page.locator('[data-overview-panes]')).toBeVisible({ timeout: 30000 });
    await page.getByRole('tab', { name: 'Сотрудники сети', exact: true }).click();
    await expect(page.getByRole('button', { name: '← Общая аналитика' })).toBeVisible({ timeout: 20000 });
    const first = page.locator('button').filter({ hasText: /Менеджер|Крылова|Соколов|Замерщик|Монтажник/ }).first();
    await expect(first).toBeVisible({ timeout: 20000 });
    await first.click();
    await expect(page.locator('[data-staff-personal]')).toBeVisible({ timeout: 20000 });
    await page.getByRole('button', { name: '← Общая аналитика' }).click();
    await expect(page.locator('[data-overview-panes]')).toBeVisible();
  });
});
