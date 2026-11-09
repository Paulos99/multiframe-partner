import { expect, test, type Page } from '@playwright/test';
import { demoSignIn } from './demo-login';

/** Демо «Потолки Столицы»: у комнаты Чернова «Кабинет» (22 м²) — профиль и смета под старую площадь 18 м². */
async function openChernovWithStaleDocs(page: Page) {
  await demoSignIn(page, 'owner');
  await page.getByRole('tab', { name: 'Проекты', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Список проектов' })).toBeVisible();
  await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem('mf_partner_db_v5') || '{}');
    const room = (db.objects || []).find((o: { id: string }) => o.id === 'obj_a11');
    if (!room) throw new Error('нет комнаты Чернова');
    const at = new Date(Date.now() - 86400000).toISOString();
    const old = { versionId: 'ver_old_e2e', createdAt: at, createdBy: 'u_sales1', hasScheme: false, panels: null, areaM2: 18 };
    room.documents = [
      { ...old, id: 'doc_old_profile', kind: 'profile', filename: 'Чернов — профиль.pdf' },
      { ...old, id: 'doc_old_estimate', kind: 'estimate', filename: 'Чернов — смета.pdf', hasScheme: true, panels: 12 },
      ...(room.documents || []),
    ];
    localStorage.setItem('mf_partner_db_v5', JSON.stringify(db));
  });
  await page.reload();
  await page.getByRole('tab', { name: 'Проекты', exact: true }).click();
  await page.getByRole('region', { name: 'Список проектов' }).getByRole('button', { name: /Чернов/ }).first().click();
  await page.getByRole('tab', { name: 'Документы' }).click();
}

function staleRow(page: Page, kind: 'profile' | 'estimate') {
  return page.locator(`[data-doc-row][data-doc-kind="${kind}"][data-stale="true"]`).first();
}

test('Чернов: «Пересобрать» профиль — Проблемомер с первого вопроса, после сохранения новая версия', async ({ page }) => {
  test.setTimeout(180000);
  await openChernovWithStaleDocs(page);
  await expect(staleRow(page, 'profile')).toBeVisible();
  await staleRow(page, 'profile').getByRole('button', { name: 'Пересобрать', exact: true }).click();

  // Первый вопрос, а не заставка и не прежний результат.
  await expect(page.getByRole('heading', { name: 'Укажите тип дома' })).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole('button', { name: 'Начать', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Акустический профиль помещения' })).toHaveCount(0);

  const result = page.getByRole('heading', { name: 'Акустический профиль помещения' });
  for (let i = 0; i < 40 && !(await result.isVisible().catch(() => false)); i += 1) {
    const choice = page.locator('main button[aria-pressed]');
    if ((await choice.count()) && !(await page.locator('main button[aria-pressed="true"]').count())) await choice.first().click();
    const next = page.getByRole('button', { name: 'Далее', exact: true });
    if ((await next.isVisible().catch(() => false)) && (await next.isEnabled())) await next.click();
    await page.waitForTimeout(250);
  }
  await expect(result).toBeVisible({ timeout: 20000 });
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();

  // Новая версия профиля под нынешнюю площадь, устаревшей метки у профиля нет.
  const latest = page.locator('[data-doc-kind="profile"]').first();
  await expect(latest).toContainText('Последняя версия', { timeout: 30000 });
  await expect(latest).toContainText('22 м²');
  await expect(latest).not.toHaveAttribute('data-stale', 'true');
  await expect(page.locator('[data-doc-kind="profile"]')).toHaveCount(2);
});

test('Чернов: «Пересобрать» смету открывает калькулятор, после сохранения схемы — новая смета', async ({ page }) => {
  await openChernovWithStaleDocs(page);
  await staleRow(page, 'estimate').getByRole('button', { name: 'Пересобрать', exact: true }).click();
  await expect(page.locator('iframe').first()).toBeVisible({ timeout: 20000 });
  await expect(page.getByText('Калькулятор', { exact: true }).first()).toBeVisible();

  // Калькулятор сообщает кабинету о сохранённой схеме так же, как при обычном «Сохранить».
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n').toString('base64');
  await page.evaluate((pdfBase64) => {
    window.postMessage(
      { type: 'mf-cabinet-calc', objectId: 'obj_a11', areaM2: 22, panels: 16, hasScheme: true, pdfBase64 },
      window.location.origin,
    );
  }, pdf);
  await expect(page.getByText('Смета приложена к комнате', { exact: false })).toBeVisible({ timeout: 20000 });
  const estimates = await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem('mf_partner_db_v5') || '{}');
    const room = (db.objects || []).find((o: { id: string }) => o.id === 'obj_a11');
    return (room?.documents || []).filter((d: { kind: string }) => d.kind === 'estimate').map((d: { areaM2: number }) => d.areaM2);
  });
  expect(estimates[0]).toBe(22);
});
