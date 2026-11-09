import { expect, test } from '@playwright/test';
import { demoSignIn } from './demo-login';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT =
  process.env.FUNNEL_SHOT_DIR ||
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../handover/screenshots-funnel');

async function shot(page: import('@playwright/test').Page, name: string) {
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(OUT, name), fullPage: false });
}

test.describe('compact funnel screenshots', () => {
  test('owner: company collapsed + expanded; personal; mobile; toggle', async ({ page }) => {
    fs.mkdirSync(OUT, { recursive: true });
    await page.setViewportSize({ width: 1280, height: 900 });
    await demoSignIn(page, 'owner');

    await page.getByRole('tab', { name: 'Аналитика', exact: true }).click();
    const funnel = page.locator('[data-journey-funnel][data-funnel-compact]').first();
    await expect(funnel).toBeVisible({ timeout: 30000 });
    await expect(funnel.locator('[data-funnel-group]')).toHaveCount(6);
    await expect(funnel.locator('[data-funnel-refusal]')).toBeVisible();
    await expect(funnel.getByRole('button', { name: /1\.\s*Комната/ })).toBeVisible();
    await expect(funnel.getByRole('button', { name: /2\.\s*Проблемомер/ })).toBeVisible();
    await expect(funnel.getByRole('button', { name: /3\.\s*Калькулятор/ })).toBeVisible();
    await expect(funnel.getByRole('button', { name: /4\.\s*Предложение/ })).toBeVisible();
    await expect(funnel.getByRole('button', { name: /5\.\s*Замер и КП/ })).toBeVisible();
    await expect(funnel.getByRole('button', { name: /6\.\s*Монтаж/ })).toBeVisible();
    await expect(funnel.locator('[data-funnel-refusal]')).toContainText('Отказ');

    await funnel.scrollIntoViewIfNeeded();
    await shot(page, 'funnel-desktop-collapsed.png');

    const problemomer = funnel.getByRole('button', { name: /2\.\s*Проблемомер/ });
    await problemomer.click();
    await expect(funnel.locator('[data-funnel-group="problemomer"]')).toHaveAttribute('data-expanded', '1');
    await expect(funnel.locator('[data-funnel-expanded="problemomer"]')).toBeVisible();
    await expect(funnel.getByText('Прошёл опрос')).toBeVisible();
    await shot(page, 'funnel-desktop-expanded.png');

    // Повторный клик сворачивает; остальные ступени не пропадают.
    await problemomer.click();
    await expect(funnel.locator('[data-funnel-group="problemomer"]')).toHaveAttribute('data-expanded', '0');
    await expect(funnel.locator('[data-funnel-expanded="problemomer"]')).toBeHidden();
    await expect(funnel.locator('[data-funnel-group]')).toHaveCount(6);

    await problemomer.click();
    await expect(funnel.locator('[data-funnel-group="problemomer"]')).toHaveAttribute('data-expanded', '1');

    const staffTab = page.getByRole('tab', { name: 'Сотрудники', exact: true });
    await expect(staffTab).toBeVisible({ timeout: 10000 });
    await staffTab.click();
    const manager = page.getByRole('button', { name: /Елена Крылова|Крылова|Менеджер/ }).first();
    await expect(manager).toBeVisible({ timeout: 20000 });
    await manager.click();
    const personal = page.locator('[data-staff-personal] [data-journey-funnel]').first();
    await expect(personal).toBeVisible({ timeout: 20000 });
    await personal.scrollIntoViewIfNeeded();
    await shot(page, 'funnel-personal-collapsed.png');

    if (await personal.getAttribute('data-funnel-compact')) {
      await personal.getByRole('button', { name: /1\.\s*Комната|2\.\s*Проблемомер/ }).first().click();
      await page.waitForTimeout(400);
    }
    await shot(page, 'funnel-personal-expanded.png');

    await page.getByRole('button', { name: '← Общая аналитика' }).click();
    await expect(page.locator('[data-overview-panes]')).toBeVisible({ timeout: 20000 });
    await page.getByRole('tab', { name: 'Показатели', exact: true }).click();
    const funnelAgain = page.locator('[data-journey-funnel][data-funnel-compact]').first();
    await expect(funnelAgain).toBeVisible({ timeout: 20000 });
    await funnelAgain.scrollIntoViewIfNeeded();

    await page.setViewportSize({ width: 390, height: 844 });
    await funnelAgain.scrollIntoViewIfNeeded();
    await shot(page, 'funnel-mobile-collapsed.png');
    await funnelAgain.getByRole('button', { name: /2\.\s*Проблемомер/ }).click();
    await expect(funnelAgain.locator('[data-funnel-group="problemomer"]')).toHaveAttribute('data-expanded', '1');
    await shot(page, 'funnel-mobile-expanded.png');
  });
});
