import { expect, test, type Page } from '@playwright/test';
import { demoSignIn } from './demo-login';

async function openAnalytics(page: Page) {
  await demoSignIn(page, 'owner');
  await page.getByRole('tab', { name: 'Аналитика', exact: true }).click();
  const dash = page.locator('[data-analytics-busy]');
  await expect(dash).toHaveAttribute('data-analytics-busy', '0', { timeout: 30000 });
  await expect(page.locator('[data-analytics-kpi-row]')).toBeVisible();
  await expect(page.locator('[data-journey-funnel]').first()).toBeVisible();
}

/**
 * Фоновый опрос кабинета (focus / таймер ~45 с) раньше ставил loading=true,
 * из-за чего KPI и воронка ремоунтились и снова проигрывали появление.
 * После правки узлы остаются теми же, скелета нет.
 */
test('фоновое обновление аналитики тихое: без скелета и без ремоунта KPI/воронки', async ({ page }) => {
  await openAnalytics(page);

  const dash = page.locator('[data-analytics-busy]');
  const kpiRow = page.locator('[data-analytics-kpi-row]');
  const funnel = page.locator('[data-journey-funnel]').first();

  await kpiRow.evaluate((el) => el.setAttribute('data-mf-keep', '1'));
  await funnel.evaluate((el) => el.setAttribute('data-mf-keep', '1'));

  // Эмуляция ответа API / тика опроса: silent refresh вешается на focus.
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  // Повтор через паузу — как второй цикл setTimeout(pollDelayMs).
  await page.waitForTimeout(400);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));

  // Пока идёт фоновая пересборка, busy не должен вспыхивать, скелета нет.
  for (let i = 0; i < 8; i += 1) {
    await expect(dash).toHaveAttribute('data-analytics-busy', '0');
    await expect(page.getByLabel('Загрузка показателя')).toHaveCount(0);
    await expect(page.getByLabel('Загрузка сводки')).toHaveCount(0);
    await page.waitForTimeout(250);
  }

  await expect(kpiRow).toHaveAttribute('data-mf-keep', '1');
  await expect(funnel).toHaveAttribute('data-mf-keep', '1');

  // После фонового обновления нет «зависших» inline-стилей анимации появления.
  const leftovers = await page.locator('[data-analytics-kpi-row] > *, [data-funnel-stage]').evaluateAll((els) =>
    els
      .map((el) => (el as HTMLElement).style.cssText)
      .filter((css) => /opacity:\s*0|translate|scale/i.test(css)),
  );
  expect(leftovers).toEqual([]);
});

test('смена периода по-прежнему жёсткая: KPI монтируются заново', async ({ page }) => {
  await openAnalytics(page);
  const kpiRow = page.locator('[data-analytics-kpi-row]');
  await kpiRow.evaluate((el) => el.setAttribute('data-mf-keep', '1'));

  await page.getByRole('group', { name: 'Период аналитики' }).locator('button[aria-controls]').click();
  await page.getByRole('button', { name: 'Квартал', exact: true }).click();

  // Старый ряд с меткой уходит (скелет или новый mount без data-mf-keep).
  await expect.poll(async () => {
    const kept = page.locator('[data-analytics-kpi-row][data-mf-keep="1"]');
    return kept.count();
  }).toBe(0);

  await expect(page.locator('[data-analytics-busy]')).toHaveAttribute('data-analytics-busy', '0', {
    timeout: 30000,
  });
  await expect(page.locator('[data-analytics-kpi-row]')).toBeVisible();
  await expect(page.locator('[data-analytics-kpi-row]')).not.toHaveAttribute('data-mf-keep', '1');
});
