import { expect, test } from '@playwright/test';
import { demoSignIn } from './demo-login';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT =
  process.env.FUNNEL_SHOT_DIR ||
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../handover/screenshots-1.1.0-fixes');

test.describe('compact funnel screenshots', () => {
  test('owner: company collapsed + expanded; personal collapsed + expanded', async ({ page }) => {
    fs.mkdirSync(OUT, { recursive: true });
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
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT, 'funnel-company-collapsed.png'), fullPage: true });

    await funnel.getByRole('button', { name: /2\.\s*Проблемомер/ }).click();
    await expect(funnel.locator('[data-funnel-expanded="problemomer"]')).toBeVisible();
    await expect(funnel.getByText('Прошёл опрос')).toBeVisible();
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, 'funnel-company-expanded.png'), fullPage: true });

    const staffTab = page.getByRole('tab', { name: 'Сотрудники', exact: true });
    await expect(staffTab).toBeVisible({ timeout: 10000 });
    await staffTab.click();
    const manager = page.getByRole('button', { name: /Елена Крылова|Крылова/ }).first();
    await expect(manager).toBeVisible({ timeout: 20000 });
    await manager.click();
    const personal = page.locator('[data-staff-personal] [data-journey-funnel]').first();
    await expect(personal).toBeVisible({ timeout: 20000 });
    await personal.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, 'funnel-personal-collapsed.png'), fullPage: true });

    if (await personal.getAttribute('data-funnel-compact')) {
      await personal.getByRole('button', { name: /1\.\s*Комната|2\.\s*Проблемомер/ }).first().click();
      await page.waitForTimeout(400);
    }
    await page.screenshot({ path: path.join(OUT, 'funnel-personal-expanded.png'), fullPage: true });
  });
});
