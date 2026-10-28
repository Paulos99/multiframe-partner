import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { openProjectRoom } from './open-room';

const password = 'ui-fixture-password-only';
const API = 'http://127.0.0.1:4181';

test.beforeEach(async ({ request }) => {
  await request.post(`${API}/__reset`);
});

async function enter(page: Page, role: string) {
  await page.goto('/');
  await page.getByLabel('Логин', { exact: true }).fill(`ui.${role}`);
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Мой профиль', exact: true })).toBeVisible();
}

function tinyPdfBase64(label: string): string {
  const body = `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\n% ${label}\ntrailer<</Root 1 0 R>>\n%%EOF\n`;
  return Buffer.from(body, 'utf8').toString('base64');
}

async function uploadProfile(request: APIRequestContext) {
  const login = await request.post(`${API}/auth/login`, { data: { login: 'ui.owner', password } });
  const { token } = await login.json();
  const res = await request.post(`${API}/objects/ui_crew_room/documents`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      versionId: 'ver_profile_results',
      documents: [
        { kind: 'profile', filename: 'UI Client — профиль — 2026-10-18.pdf', pdfBase64: tinyPdfBase64('profile'), hasScheme: false },
      ],
    },
  });
  expect(res.ok()).toBe(true);
}

async function openDocuments(page: Page) {
  await page.getByRole('tab', { name: 'Проекты', exact: true }).click();
  await openProjectRoom(page, 'Гостиная');
  await page.locator('summary', { hasText: 'Документы' }).click();
}

test('менеджер: у каждого расчёта «Открыть результаты» и «Открыть PDF», результаты — страница кабинета без панели', async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await uploadProfile(request);
  await enter(page, 'sales');
  await openDocuments(page);

  for (const kind of ['profile', 'estimate']) {
    const row = page.locator(`[data-doc-kind="${kind}"]`).first();
    await expect(row.getByRole('button', { name: 'Открыть результаты', exact: true })).toBeVisible();
    await expect(row.getByRole('button', { name: 'Открыть PDF', exact: true })).toBeVisible();
  }

  // Калькулятор: сохранённая смета страницей, с ценами для менеджера.
  await page.locator('[data-doc-kind="estimate"]').first().getByTestId('doc-open-results').click();
  const view = page.getByTestId('saved-result-page');
  await expect(view).toBeVisible();
  await expect(page).toHaveURL(/#project\/[^/]+\/room\/ui_crew_room\/result\/estimate$/);
  await expect(view.getByRole('heading', { name: 'Результаты калькулятора' })).toBeVisible();
  await expect(view.getByText('Панели', { exact: true })).toBeVisible();
  await expect(view.getByText('16 шт.')).toBeVisible();
  await expect(view.getByText('Итого комнаты')).toBeVisible();
  await expect(view).toContainText('₽');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('[class*="drawer" i]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Сохранить', exact: true })).toHaveCount(0);

  // Ссылка работает после обновления страницы.
  await page.reload();
  await expect(page.getByTestId('saved-result-page').getByText('16 шт.')).toBeVisible();

  // Назад к комнате.
  await page.getByTestId('saved-result-page').getByRole('button', { name: 'К комнате', exact: true }).click();
  await expect(page.getByTestId('saved-result-page')).toHaveCount(0);
  await expect(page).toHaveURL(/#project\/[^/]+\/room\/ui_crew_room$/);

  // Проблемомер: тот же результат, что в кабинете, только чтение.
  await page.locator('summary', { hasText: 'Документы' }).click();
  await page.locator('[data-doc-kind="profile"]').first().getByTestId('doc-open-results').click();
  const profile = page.getByTestId('saved-result-page');
  await expect(profile.getByRole('heading', { name: 'Результаты Проблемомера' })).toBeVisible();
  await expect(profile.getByRole('heading', { name: /Акустический профиль/ }).first()).toBeVisible({ timeout: 20000 });
  await expect(profile.getByRole('button', { name: 'Переслать', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Сохранить', exact: true })).toHaveCount(0);
  // PDF открывается из этой же страницы в общем окне просмотра.
  await profile.getByRole('button', { name: 'Открыть PDF', exact: true }).click();
  await expect(page.getByRole('dialog', { name: /Просмотр/ })).toBeVisible({ timeout: 20000 });
  await page.keyboard.press('Escape');
  expect(errors).toEqual([]);
});

test('монтажник: результаты расчётов без цен', async ({ page, request }) => {
  await uploadProfile(request);
  await enter(page, 'crew');
  await openDocuments(page);

  await page.locator('[data-doc-kind="estimate"]').first().getByTestId('doc-open-results').click();
  const view = page.getByTestId('saved-result-page');
  await expect(view.getByText('16 шт.')).toBeVisible();
  await expect(view.getByText('Итого комнаты')).toHaveCount(0);
  await expect(view).not.toContainText('₽');
  await expect(view).not.toContainText(/93\s*444|24\s*000|119\s*694|2\s*396/);

  await page.getByTestId('saved-result-page').getByRole('button', { name: 'К комнате', exact: true }).click();
  await page.locator('summary', { hasText: 'Документы' }).click();
  await page.locator('[data-doc-kind="profile"]').first().getByTestId('doc-open-results').click();
  const profile = page.getByTestId('saved-result-page');
  await expect(profile.getByRole('heading', { name: 'Результаты Проблемомера' })).toBeVisible();
  await expect(profile).not.toContainText('₽');
});
