import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';

const OUT = process.env.KP_SHOT_DIR || 'test-results/kp-shots';

async function openChernovDocs(page: Page) {
  await page.goto('/?demo=1');
  await page.getByRole('region', { name: 'Потолки Столицы', exact: true }).getByRole('button', { name: /Прайс и команда/ }).click();
  await page.getByRole('tab', { name: 'Проекты', exact: true }).click();
  await page.getByRole('region', { name: 'Список проектов' }).getByRole('button', { name: /Чернов/ }).first().click();
  await page.getByRole('tab', { name: 'Документы' }).click();
}

test('КП проекта: в «Документах», открывается, устаревает и пересобирается', async ({ page }) => {
  test.setTimeout(120_000);
  fs.mkdirSync(OUT, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openChernovDocs(page);
  const row = page.locator('[data-doc-row][data-doc-kind="offer"]');
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('Коммерческое предложение');
  await expect(row).toContainText('Весь проект · 3 комнаты');
  await expect(row).not.toHaveAttribute('data-stale', 'true');
  for (const label of ['Открыть', 'Скачать', 'Поделиться']) await expect(row.getByRole('button', { name: label, exact: true })).toBeVisible();
  await page.screenshot({ path: `${OUT}/kp-docs-desktop.png`, fullPage: true });

  const download = page.waitForEvent('download', { timeout: 60_000 });
  await row.getByRole('button', { name: 'Скачать', exact: true }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^Коммерческое предложение — Чернов А\. — \d{4}-[A-Z0-9]+\.pdf$/);
  await file.saveAs(`${OUT}/kp-demo-stand.pdf`);
  expect(fs.readFileSync(`${OUT}/kp-demo-stand.pdf`).subarray(0, 4).toString()).toBe('%PDF');

  await row.getByRole('button', { name: 'Открыть', exact: true }).click();
  await expect(page.getByRole('dialog').filter({ hasText: 'Коммерческое предложение' }).first()).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/kp-open-preview.png` });
  await page.keyboard.press('Escape');

  // Площадь спальни поменялась — КП устарело.
  await page.evaluate(() => {
    const key = 'mf_partner_db_v5';
    const db = JSON.parse(localStorage.getItem(key) || '{}') as { objects?: Array<{ id: string; room: { areaM2: number } }> };
    const room = db.objects?.find((o) => o.id === 'obj_a11b');
    if (room) room.room.areaM2 = 15;
    localStorage.setItem(key, JSON.stringify(db));
    localStorage.removeItem('mf_partner_objects_v1');
  });
  await page.reload();
  await page.getByRole('tab', { name: 'Документы' }).click();
  await expect(row).toHaveAttribute('data-stale', 'true');
  await expect(row).toContainText('Устарело');
  await page.screenshot({ path: `${OUT}/kp-stale-light.png`, fullPage: true });
  await row.getByRole('button', { name: 'Пересобрать', exact: true }).click();
  await expect(row).not.toHaveAttribute('data-stale', 'true', { timeout: 60_000 });
  await expect(page.locator('[data-doc-row][data-doc-kind="offer"]')).toHaveCount(1);
});

test('КП на телефоне: строка и кнопки помещаются', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await openChernovDocs(page);
  const row = page.locator('[data-doc-row][data-doc-kind="offer"]');
  await expect(row).toBeVisible();
  const box = await row.boundingBox();
  expect(box!.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: `${OUT}/kp-docs-mobile.png`, fullPage: true });
});
