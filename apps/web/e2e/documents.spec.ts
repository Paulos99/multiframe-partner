import { test, expect, type Page } from '@playwright/test';
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

async function uploadAsOwner(request: import('@playwright/test').APIRequestContext) {
  const login = await request.post(`${API}/auth/login`, {
    data: { login: 'ui.owner', password },
  });
  expect(login.ok()).toBe(true);
  const { token } = await login.json();
  const res = await request.post(`${API}/objects/ui_crew_room/documents`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      versionId: 'ver_profile_e2e',
      documents: [
        { kind: 'profile', filename: 'UI Client — профиль — 2026-10-18.pdf', pdfBase64: tinyPdfBase64('profile'), hasScheme: false },
      ],
    },
  });
  expect(res.ok()).toBe(true);
  const obj = (await res.json()).object;
  return obj as { documents: Array<{ kind: string; id: string }>; estimate: { totalCost: number | null } };
}

test('API: бригада не получает суммы, документы остаются, старая спецификация в паре скрыта', async ({ request }) => {
  const owner = await uploadAsOwner(request);
  expect(owner.documents.map((d) => d.kind)).toEqual(['profile', 'estimate', 'spec']);
  const login = await request.post(`${API}/auth/login`, { data: { login: 'ui.crew', password } });
  const { token, user } = await login.json();
  expect(user.org.panelPriceRub).toBe(2396);
  const list = await request.get(`${API}/objects`, { headers: { Authorization: `Bearer ${token}` } });
  const room = (await list.json()).objects.find((o: { id: string }) => o.id === 'ui_crew_room');
  expect(room.estimate.totalCost).toBeUndefined();
  expect(room.estimate.panelsCost).toBeUndefined();
  expect(room.estimate.panels).toBe(16);
  expect(room.documents.map((d: { id: string }) => d.id)).toEqual([
    owner.documents[0].id,
    'legacy_est',
    'legacy_spec_alone',
  ]);
  const file = await request.get(`${API}/objects/ui_crew_room/documents/${owner.documents[0].id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(file.ok()).toBe(true);
  expect((await file.json()).kind).toBe('profile');
});

test('монтажник: PDF в комнате без цен, предпросмотр открывается по нажатию', async ({ page, request }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await uploadAsOwner(request);
  await enter(page, 'crew');
  await page.getByRole('tab', { name: 'Проекты', exact: true }).click();

  await openProjectRoom(page, 'Гостиная');

  await page.locator('summary', { hasText: 'Документы' }).click();
  const rows = page.locator('[data-doc-kind]');
  await expect(rows).toHaveCount(3);
  await expect(page.locator('[data-doc-kind="profile"]')).toHaveCount(1);
  await expect(page.locator('[data-doc-kind="estimate"]')).toHaveCount(2);
  await expect(page.getByText('Спецификация', { exact: false })).toHaveCount(0);
  await expect(page.getByText('Итого комнаты')).toHaveCount(0);
  await expect(page.getByText('Панели', { exact: true })).toBeVisible();

  await expect(page.getByRole('button', { name: 'Клиенту', exact: true }).first()).toBeVisible();
  await page.locator('[data-doc-kind="profile"]').getByRole('button', { name: 'Открыть PDF', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: /Просмотр: .*профиль/ });
  await expect(dialog).toBeVisible({ timeout: 20000 });
  await expect(dialog).toHaveAttribute('data-file-kind', 'pdf');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('менеджер видит те же PDF в карточке комнаты', async ({ page, request }) => {
  await uploadAsOwner(request);
  await enter(page, 'sales');
  await page.getByRole('tab', { name: 'Проекты', exact: true }).click();
  await openProjectRoom(page, 'Гостиная');
  await page.locator('summary', { hasText: 'Документы' }).click();
  await expect(page.locator('[data-doc-kind="profile"]')).toHaveCount(1);
  await expect(page.locator('[data-doc-kind="estimate"]')).toHaveCount(2);
  await expect(page.getByText('Итого комнаты')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Клиенту', exact: true }).first()).toBeVisible();
});

test('проблемомер: «Сохранить» в проект создаёт комнату и прикладывает «Профиль»', async ({ page, request }) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await enter(page, 'owner');
  // Готовые ответы комнаты, как в ссылке «Поделиться».
  const token = await page.evaluate(async () => {
    const share = await import('/src/state/shareLink.ts');
    const session = await import('/src/state/session.ts');
    const base = session.createInitialSession();
    return share.encodeRoomAnswers({ ...base.answers.room, roomType: 'bedroom', ceilingAreaM2: 18, noisyNeighbors: 'yes', noiseKind: 'impact' });
  });
  await page.goto(`/?p=${token}`);
  await expect(page.getByRole('button', { name: 'Мой профиль', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Проблемомер', exact: true }).click();
  const saveButton = page.getByRole('button', { name: 'Сохранить', exact: true });
  await expect(saveButton).toBeVisible({ timeout: 30000 });
  await saveButton.click();
  const modal = page.getByRole('dialog', { name: 'Сохранить в проект' });
  await modal.getByRole('button', { name: /Тестовая квартира/ }).click();
  await modal.getByRole('button', { name: /Создать комнату/ }).click();
  await modal.getByLabel('Название комнаты').fill('Профиль Тест');
  await modal.getByRole('button', { name: 'Сохранить', exact: true }).click();
  // После сохранения открывается страница комнаты, профиль уже приложен.
  await expect(page).toHaveURL(/#project\/ui_project\/room\//, { timeout: 60000 });

  const login = await request.post(`${API}/auth/login`, { data: { login: 'ui.owner', password } });
  const { token: auth } = await login.json();
  const findSaved = async () => {
    const list = await request.get(`${API}/objects`, { headers: { Authorization: `Bearer ${auth}` } });
    return (await list.json()).objects.find((o: { roomName?: string }) => o.roomName === 'Профиль Тест');
  };
  // «Профиль» прикладывается уже после открытия страницы комнаты.
  await expect
    .poll(async () => (await findSaved())?.documents?.some((d: { kind: string }) => d.kind === 'profile'), { timeout: 60000 })
    .toBe(true);
  const saved = await findSaved();
  expect(saved).toBeTruthy();
  const profile = saved.documents.find((d: { kind: string }) => d.kind === 'profile');
  expect(profile?.filename).toContain('профиль');
  const file = await request.get(`${API}/objects/${saved.id}/documents/${profile.id}`, {
    headers: { Authorization: `Bearer ${auth}` },
  });
  const pdf = Buffer.from((await file.json()).pdfBase64, 'base64');
  expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
  // Лимит запроса облачной функции ~3.5 МБ: компактный профиль должен быть заметно меньше.
  expect(pdf.length).toBeLessThan(2_000_000);

  expect(saved.documents.filter((d: { kind: string }) => d.kind === 'profile')).toHaveLength(1);
  expect(errors).toEqual([]);
});
