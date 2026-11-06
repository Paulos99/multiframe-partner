import { expect, test } from '@playwright/test';
import fs from 'node:fs';

const OUT = process.env.DOCS_SHOT_DIR || '/workspace/handover/screenshots-1.1.0-fixes';
const TAG = process.env.DOCS_SHOT_TAG || 'after';

for (const vp of [{ name: 'desktop', width: 1440, height: 1000 }, { name: 'mobile', width: 390, height: 844 }]) {
  test(`документы проекта: заголовок и мета раздельно (${vp.name})`, async ({ page }) => {
    fs.mkdirSync(OUT, { recursive: true });
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/?demo=1');
    await page.getByRole('region', { name: 'Потолки Столицы', exact: true }).getByRole('button', { name: /Прайс и команда/ }).click();
    await page.getByRole('tab', { name: 'Проекты', exact: true }).click();
    const desk = page.getByRole('region', { name: 'Список проектов' });
    // find a project that has docs
    const ids = await desk.locator('[data-project-id]').evaluateAll((els) => els.map((e) => e.getAttribute('data-project-id')));
    let found = false;
    for (const id of ids) {
      await desk.locator(`[data-project-id="${id}"]`).first().click();
      await page.getByRole('tab', { name: 'Документы' }).click();
      const doc = page.locator('[data-doc-row]').first();
      if (await doc.isVisible({ timeout: 1500 }).catch(() => false)) {
        const title = doc.locator('strong');
        const meta = doc.locator('[data-doc-meta]');
        const t = await title.boundingBox();
        const m = await meta.boundingBox();
        expect(t && m && m.y >= t.y + t.height - 1).toBeTruthy();
        await doc.scrollIntoViewIfNeeded();
        await page.screenshot({ path: `${OUT}/docs-spacing-${TAG}-${vp.name}.png` });
        found = true;
        break;
      }
      await page.goBack();
      await page.getByRole('tab', { name: 'Проекты', exact: true }).click().catch(() => {});
    }
    expect(found).toBe(true);
  });
}
