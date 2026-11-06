import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';

const OUT = process.env.DOCS_SHOT_DIR || 'test-results/docs-shots';
const TAG = process.env.DOCS_SHOT_TAG || 'after';
const CHECK = TAG === 'after';

async function enter(page: Page, hint: RegExp) {
  await page.goto('/?demo=1');
  await page.getByRole('region', { name: 'Потолки Столицы', exact: true }).getByRole('button', { name: hint }).click();
  await page.getByRole('tab', { name: 'Проекты', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Список проектов' })).toBeVisible();
}

const API = 'http://127.0.0.1:4181';

/** Вход в фикстуру API (там у «Гостиной» есть смета). stale — площадь комнаты в ответе API меняется, смета устаревает. */
async function openProjectWithDocs(page: Page, stale = false) {
  await page.request.post(`${API}/__reset`);
  // Свежие смета и профиль с байтами PDF: открываются, скачиваются, отправляются.
  const login = await page.request.post(`${API}/auth/login`, { data: { login: 'ui.owner', password: 'ui-fixture-password-only' } });
  const { token } = await login.json();
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n').toString('base64');
  const up = await page.request.post(`${API}/objects/ui_crew_room/documents`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      versionId: 'ver_docs_e2e',
      documents: [
        { kind: 'estimate', filename: 'UI Client — смета.pdf', pdfBase64: pdf, hasScheme: true, panels: 16, areaM2: 24 },
        { kind: 'profile', filename: 'UI Client — профиль.pdf', pdfBase64: pdf, hasScheme: false, areaM2: 24 },
      ],
    },
  });
  expect(up.ok()).toBe(true);
  if (stale) {
    await page.route(/127\.0\.0\.1:4181\/objects(\?.*)?$/, async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      const res = await route.fetch();
      const body = await res.json();
      const list = Array.isArray(body) ? body : body.objects;
      for (const o of list || []) if (o.id === 'ui_crew_room' && o.room) o.room.areaM2 = 27;
      await route.fulfill({ response: res, json: body });
    });
  }
  await page.goto('/');
  await page.getByLabel('Логин', { exact: true }).fill('ui.owner');
  await page.getByLabel('Пароль', { exact: true }).fill('ui-fixture-password-only');
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await page.getByRole('tab', { name: 'Проекты', exact: true }).click();
  await page.getByRole('region', { name: 'Список проектов' }).getByRole('button', { name: 'Тестовая квартира' }).first().click();
  await page.getByRole('tab', { name: 'Документы' }).click();
  await expect(page.locator('[data-doc-row], button:has-text("Смета калькулятора")').first()).toBeVisible();
}

for (const vp of [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'mobile', width: 390, height: 844 },
]) {
  test(`документы проекта: строка и действия (${vp.name})`, async ({ page }) => {
    fs.mkdirSync(OUT, { recursive: true });
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await openProjectWithDocs(page);
    await page.screenshot({ path: `${OUT}/docs-${TAG}-${vp.name}.png` });
    if (!CHECK) return;
    const row = page.locator('[data-doc-row]').first();
    const t = await row.locator('strong').boundingBox();
    const m = await row.locator('[data-doc-meta]').boundingBox();
    expect(t && m && m.y >= t.y + t.height - 1).toBeTruthy();
    for (const label of ['Открыть', 'Скачать', 'Поделиться']) {
      await expect(row.getByRole('button', { name: label, exact: true })).toBeVisible();
    }
    // Открыть — общее окно предпросмотра.
    await row.getByRole('button', { name: 'Открыть', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: `${OUT}/docs-open-${vp.name}.png` });
    await page.keyboard.press('Escape');
    // Скачать — PDF.
    const download = page.waitForEvent('download');
    await row.getByRole('button', { name: 'Скачать', exact: true }).click();
    expect((await download).suggestedFilename()).toMatch(/\.pdf$/i);
    // Поделиться без Web Share API: копируется ссылка клиента (та же, что в QR).
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.evaluate(() => {
      // @ts-expect-error — режим без Web Share API
      delete Navigator.prototype.share;
    });
    await row.getByRole('button', { name: 'Поделиться', exact: true }).click();
    await expect(page.getByText(/Ссылка для клиента/).first()).toBeVisible({ timeout: 15000 });
  });
}

test('настройки проекта: без флажка «В архиве», кнопка «Сохранить» с текстом', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true });
  await enter(page, /Прайс и команда/);
  const desk = page.getByRole('region', { name: 'Список проектов' });
  await desk.locator('tr[data-project-id] button').first().click();
  await page.getByRole('tab', { name: 'Настройки' }).click();
  await page.screenshot({ path: `${OUT}/settings-${TAG}.png`, fullPage: true });
  if (!CHECK) return;
  await expect(page.getByText('В архиве', { exact: true })).toHaveCount(0);
  const save = page.getByRole('button', { name: 'Сохранить', exact: true });
  await expect(save).toBeVisible();
  expect((await save.innerText()).trim()).toBe('Сохранить');
});

for (const who of [
  { role: 'owner', hint: /Прайс и команда/ },
  { role: 'manager', hint: /Проекты и КП/ },
]) {
  test(`⋯ «В архив» и «Вернуть из архива» (${who.role})`, async ({ page }) => {
    fs.mkdirSync(OUT, { recursive: true });
    await enter(page, who.hint);
    const desk = page.getByRole('region', { name: 'Список проектов' });
    const first = desk.locator('tr[data-project-id]').first();
    const name = (await first.locator('button').first().innerText()).trim();
    // Список
    await first.getByRole('button', { name: `Действия с проектом «${name}»` }).click();
    await page.screenshot({ path: `${OUT}/archive-menu-list-${who.role}.png` });
    await page.getByRole('menuitem', { name: 'В архив' }).click();
    await expect(desk.locator('tr[data-project-id]').filter({ hasText: name })).toHaveCount(0);
    await desk.getByRole('button', { name: /^Архив/ }).click();
    const archived = desk.locator('tr[data-project-id]').filter({ hasText: name });
    await expect(archived).toHaveCount(1);
    await archived.getByRole('button', { name: `Действия с проектом «${name}»` }).click();
    await expect(page.getByRole('menuitem', { name: 'Вернуть из архива' })).toBeVisible();
    await page.screenshot({ path: `${OUT}/archive-menu-restore-${who.role}.png` });
    await page.getByRole('menuitem', { name: 'Вернуть из архива' }).click();
    await expect(archived).toHaveCount(0);
    const hold = await page.evaluate((n) => {
      const db = JSON.parse(localStorage.getItem('mf_partner_db_v5') || '{}');
      return (db.projects || []).find((p: { name: string }) => p.name === n)?.unarchiveHold ?? null;
    }, name);
    expect(hold).toBe(true);
    // Канбан
    await desk.getByRole('button', { name: /^Архив/ }).click();
    await desk.getByRole('button', { name: 'Канбан', exact: true }).click();
    await desk.getByRole('button', { name: /Действия с проектом/ }).first().click();
    await expect(page.getByRole('menuitem', { name: 'В архив' })).toBeVisible();
    await page.screenshot({ path: `${OUT}/archive-menu-kanban-${who.role}.png` });
    await page.keyboard.press('Escape');
    await desk.getByRole('button', { name: 'Список', exact: true }).click();
  });
}

test('устаревший документ подсвечен красным и предлагает «Пересобрать» (светлая и тёмная)', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true });
  await openProjectWithDocs(page, true);
  const stale = page.locator('[data-doc-row][data-stale="true"]').first();
  await expect(stale).toBeVisible();
  await expect(stale.getByText('Устарел', { exact: true })).toBeVisible();
  await expect(stale.getByRole('button', { name: 'Пересобрать', exact: true })).toBeVisible();
  await stale.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/docs-stale-light.png` });
  await page.getByRole('button', { name: /Светлая тема/ }).first().click();
  await expect(page.getByText('Тёмная', { exact: true }).first()).toBeVisible();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/docs-stale-dark.png` });
  await stale.getByRole('button', { name: 'Пересобрать', exact: true }).click();
  // «Пересобрать» ведёт к результатам этой комнаты.
  await expect(page.locator('[data-doc-row]')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /Результаты (Проблемомера|калькулятора)/ })).toBeVisible();
});
