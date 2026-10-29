import { test, expect } from '@playwright/test';

const shots = process.env.REVIEW_SHOTS_DIR;

/** «Как работает?» в калькуляторе: только потолок, шаги про стены и проёмы убраны. */
test('калькулятор: «Как работает?» без шагов про стены и проёмы (телефон)', async ({ page }) => {
  test.setTimeout(240000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/calculator/index.html');
  await page.locator('#appHelpBtn').click();
  const seen: string[] = [];
  for (let i = 0; i < 6; i += 1) {
    // Кнопка «Далее» включается, когда шаг показан до конца.
    const next = page.locator('.tour-next');
    await expect(next).toBeEnabled({ timeout: 40000 });
    await expect(page.getByText(`${i + 1} / 6`, { exact: true })).toBeVisible();
    seen.push(await page.locator('body').innerText());
    if (shots) await page.screenshot({ path: `${shots}/item7-calc-tutorial-step${i + 1}-phone.png` });
    await next.click();
  }
  const all = seen.join('\n');
  expect(all).not.toMatch(/стен|проём|проем|двер/i);
});
