import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

const password = 'ui-fixture-password-only';
const API = 'http://127.0.0.1:4181';
const calcTitle = 'iframe[title="Калькулятор MultiFrame · партнёр"]';

test.beforeEach(async ({ request }) => {
  await request.post(`${API}/__reset`);
});

type Room = {
  id: string;
  projectId?: string;
  roomName?: string;
  assignedTo?: string | null;
  room: { areaM2?: number; roomType?: string; answers?: { ceilingAreaM2?: number } };
  estimate?: { panels?: number } | null;
  documents?: Array<{ kind: string }>;
};

async function token(request: APIRequestContext, role: string) {
  const login = await request.post(`${API}/auth/login`, { data: { login: `ui.${role}`, password } });
  return (await login.json()).token as string;
}

async function rooms(request: APIRequestContext): Promise<Room[]> {
  const auth = await token(request, 'owner');
  const list = await request.get(`${API}/objects`, { headers: { Authorization: `Bearer ${auth}` } });
  return (await list.json()).objects as Room[];
}

async function projectsOf(request: APIRequestContext): Promise<Array<{ id: string; name: string }>> {
  const auth = await token(request, 'owner');
  const list = await request.get(`${API}/projects`, { headers: { Authorization: `Bearer ${auth}` } });
  return (await list.json()).projects;
}

async function enter(page: Page, role: string) {
  await page.goto('/');
  await page.getByLabel('Логин', { exact: true }).fill(`ui.${role}`);
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Разделы кабинета' })).toBeVisible();
}

const tab = (page: Page, name: string) => page.getByRole('tab', { name, exact: true });

async function openTools(page: Page) {
  await tab(page, 'Инструменты').click();
  await expect(page.getByRole('region', { name: 'Инструменты' })).toBeVisible();
}

/** Проходит Проблемомер из «Инструментов» (без проекта): спальня, 18 м². */
async function walkProblemomer(page: Page) {
  await openTools(page);
  await page.getByRole('button', { name: 'Открыть Проблемомер', exact: true }).click();
  await page.getByRole('button', { name: 'Начать', exact: true }).click();
  const title = page.getByRole('heading', { name: 'Акустический профиль помещения' });
  for (let i = 0; i < 20; i += 1) {
    if (await title.isVisible().catch(() => false)) break;
    const area = page.getByPlaceholder('Например, 18');
    if (await area.isVisible().catch(() => false)) {
      await page.getByRole('button', { name: 'Спальня', exact: true }).first().click();
      await area.fill('18');
    }
    const next = page.getByRole('button', { name: 'Далее', exact: true });
    if ((await next.isVisible().catch(() => false)) && (await next.isEnabled())) await next.click();
    await page.waitForTimeout(400);
  }
  await expect(title).toBeVisible({ timeout: 30000 });
}

function dialog(page: Page) {
  return page.getByRole('dialog', { name: 'Сохранить в проект' });
}

async function openSaveModal(page: Page) {
  const save = page.getByRole('button', { name: 'Сохранить', exact: true });
  await save.scrollIntoViewIfNeeded();
  await save.click();
  await expect(dialog(page)).toBeVisible();
  return dialog(page);
}

test('Проблемомер из «Инструментов»: комната создаётся с подставленными данными и открывается страницей', async ({ page, request }) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await enter(page, 'owner');
  await walkProblemomer(page);
  const modal = await openSaveModal(page);

  // Небольшое окно по центру, не боковая панель.
  // Центр окна совпадает с центром затемнения (полоса прокрутки страницы не в счёт).
  const view = page.viewportSize()!;
  await expect
    .poll(async () => {
      const box = await modal.boundingBox();
      const shade = await modal.locator('xpath=..').boundingBox();
      if (!box || !shade) return 999;
      return Math.round(
        Math.abs(box.x + box.width / 2 - (shade.x + shade.width / 2)) +
          Math.abs(box.y + box.height / 2 - (shade.y + shade.height / 2)),
      );
    })
    .toBeLessThan(3);
  expect((await modal.boundingBox())!.width).toBeLessThan(view.width * 0.8);
  await expect(page.locator('[class*="drawer" i]')).toHaveCount(0);

  // Поиск проекта.
  await modal.getByLabel('Найти проект').fill('нет такого проекта');
  await expect(modal.getByRole('button', { name: /Тестовая квартира/ })).toHaveCount(0);
  await modal.getByLabel('Найти проект').fill('квартира');
  await modal.getByRole('button', { name: /Тестовая квартира/ }).click();
  await expect(modal.getByRole('button', { name: 'Сохранить', exact: true })).toBeDisabled();
  await modal.getByRole('button', { name: /Создать комнату/ }).click();
  await expect(modal.getByLabel('Название комнаты')).toHaveValue('Спальня');
  await expect(modal.getByTestId('save-prefill')).toContainText('18');
  await modal.getByLabel('Название комнаты').fill('Спальня родителей');
  await modal.getByRole('button', { name: 'Сохранить', exact: true }).click();

  await expect(page).toHaveURL(/#project\/ui_project\/room\//, { timeout: 60000 });
  await expect(dialog(page)).toHaveCount(0);
  const saved = (await rooms(request)).find((r) => r.roomName === 'Спальня родителей');
  expect(saved?.projectId).toBe('ui_project');
  expect(saved?.room.areaM2).toBe(18);
  expect(saved?.room.roomType).toBe('bedroom');
  expect(saved?.documents?.some((d) => d.kind === 'profile')).toBe(true);
  // Вкладка «Инструменты» не перехватывает возврат: остаёмся на странице комнаты.
  await page.waitForTimeout(600);
  await expect(page).toHaveURL(/#project\/ui_project\/room\//);
  expect(errors).toEqual([]);
});

test('комната с данными: перед заменой нужно подтверждение, «Назад» ничего не меняет', async ({ page, request }) => {
  test.setTimeout(120000);
  await enter(page, 'sales');
  await walkProblemomer(page);
  const modal = await openSaveModal(page);
  await modal.getByRole('button', { name: /Тестовая квартира/ }).click();
  await modal.getByRole('button', { name: /Спальня/ }).first().click();
  await modal.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(modal).toContainText('уже есть данные');
  await expect(modal).toContainText('Заменить их новым результатом?');
  await modal.getByRole('button', { name: 'Назад', exact: true }).click();
  await expect(modal.getByRole('button', { name: 'Сохранить', exact: true })).toBeVisible();
  expect((await rooms(request)).find((r) => r.id === 'ui_room')?.room.areaM2).toBe(24);
  await modal.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await modal.getByRole('button', { name: 'Заменить и сохранить', exact: true }).click();
  await expect(page).toHaveURL(/#project\/ui_project\/room\/ui_room/, { timeout: 60000 });
  const after = (await rooms(request)).find((r) => r.id === 'ui_room');
  expect(after?.room.areaM2).toBe(18);
  expect(after?.documents?.some((d) => d.kind === 'profile')).toBe(true);
});

test('владелец создаёт проект и комнату прямо из окна сохранения', async ({ page, request }) => {
  test.setTimeout(120000);
  await enter(page, 'owner');
  await walkProblemomer(page);
  const modal = await openSaveModal(page);
  await modal.getByRole('button', { name: /Создать проект/ }).click();
  await modal.getByLabel('Название нового проекта').fill('Дом у реки');
  await expect(modal.getByLabel('Название комнаты')).toHaveValue('Спальня');
  await modal.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page).toHaveURL(/#project\/[^/]+\/room\//, { timeout: 60000 });
  const created = (await projectsOf(request)).find((p) => p.name === 'Дом у реки');
  expect(created).toBeTruthy();
  const room = (await rooms(request)).find((r) => r.projectId === created!.id);
  expect(room?.roomName).toBe('Спальня');
  expect(room?.room.areaM2).toBe(18);
});

test('Esc и «Отмена» закрывают окно, ничего не сохраняя', async ({ page, request }) => {
  test.setTimeout(120000);
  await enter(page, 'owner');
  await walkProblemomer(page);
  const before = (await rooms(request)).length;
  let modal = await openSaveModal(page);
  await page.keyboard.press('Escape');
  await expect(modal).toHaveCount(0);
  modal = await openSaveModal(page);
  await modal.getByRole('button', { name: 'Отмена', exact: true }).click();
  await expect(modal).toHaveCount(0);
  expect((await rooms(request)).length).toBe(before);
});

test('замерщик: только свои комнаты, без создания проекта и комнаты', async ({ page, request }) => {
  test.setTimeout(120000);
  const auth = await token(request, 'owner');
  const patch = await request.patch(`${API}/objects/ui_room`, {
    headers: { Authorization: `Bearer ${auth}` },
    data: { assignedTo: 'ui_measurer' },
  });
  expect(patch.ok()).toBe(true);
  await enter(page, 'measurer');
  await walkProblemomer(page);
  const modal = await openSaveModal(page);
  await expect(modal.getByRole('button', { name: /Создать проект/ })).toHaveCount(0);
  await modal.getByRole('button', { name: /Тестовая квартира/ }).click();
  await expect(modal.getByRole('button', { name: /Создать комнату/ })).toHaveCount(0);
  await expect(modal.getByRole('button', { name: /Кухня/ })).toHaveCount(0);
  await expect(modal.getByRole('button', { name: /Гостиная/ })).toHaveCount(0);
  await modal.getByRole('button', { name: /Спальня/ }).first().click();
  await modal.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await modal.getByRole('button', { name: 'Заменить и сохранить', exact: true }).click();
  await expect(page).toHaveURL(/#project\/ui_project\/room\/ui_room/, { timeout: 60000 });
  expect((await rooms(request)).find((r) => r.id === 'ui_room')?.room.areaM2).toBe(18);
});

test('замерщик без своих комнат видит подсказку, а не пустой список', async ({ page }) => {
  test.setTimeout(120000);
  await enter(page, 'measurer');
  await walkProblemomer(page);
  const modal = await openSaveModal(page);
  await expect(modal.getByRole('button', { name: /Тестовая квартира/ })).toHaveCount(0);
  await expect(modal.getByRole('button', { name: 'Сохранить', exact: true })).toBeDisabled();
  await modal.getByRole('button', { name: 'Отмена', exact: true }).click();
});

test('бригада: сохранить в проект нельзя, окна и цен нет', async ({ page }) => {
  test.setTimeout(120000);
  await enter(page, 'crew');
  await walkProblemomer(page);
  await expect(page.getByRole('button', { name: 'Сохранить', exact: true })).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Кабинет', exact: true }).click();
  await page.getByRole('button', { name: 'Открыть Калькулятор', exact: true }).click();
  const calc = page.frameLocator(calcTitle);
  await expect(calc.getByRole('heading', { name: 'Что вы знаете о помещении?' })).toBeVisible();
  await expect(calc.locator('#saveToProjectBtn')).toBeHidden();
});

test('калькулятор из «Инструментов»: «Сохранить в проект» пишет площадь и расчёт в комнату', async ({ page, request }) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await enter(page, 'owner');
  await openTools(page);
  await page.getByRole('button', { name: 'Открыть Калькулятор', exact: true }).click();
  const frame = page.locator(calcTitle);
  await expect(frame).not.toHaveAttribute('src', /objectId=/);
  const calc = page.frameLocator(calcTitle);
  const saveBtn = calc.locator('#saveToProjectBtn');
  await expect(saveBtn).toBeHidden();
  await calc.locator('#entryAreaBtn').click();
  await calc.locator('#areaOnlyInput').fill('31');
  await calc.locator('#calculateBtn').click();
  await expect(saveBtn).toBeVisible({ timeout: 20000 });
  await expect(saveBtn).toBeEnabled();
  await saveBtn.click();

  const modal = dialog(page);
  await expect(modal).toBeVisible();
  await modal.getByRole('button', { name: /Тестовая квартира/ }).click();
  await modal.getByRole('button', { name: /Создать комнату/ }).click();
  await expect(modal.getByTestId('save-prefill')).toContainText('31');
  await modal.getByLabel('Название комнаты').fill('Кабинет');
  await modal.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page).toHaveURL(/#project\/ui_project\/room\//, { timeout: 60000 });
  const saved = (await rooms(request)).find((r) => r.roomName === 'Кабинет');
  expect(saved?.projectId).toBe('ui_project');
  expect(saved?.room.areaM2).toBeCloseTo(31, 1);
  expect(saved?.room.answers?.ceilingAreaM2).toBeCloseTo(31, 1);
  expect(saved?.estimate?.panels).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('данные связаны в обе стороны: сохранённая площадь открывается в Проблемомере комнаты', async ({ page }) => {
  test.setTimeout(120000);
  await enter(page, 'owner');
  await walkProblemomer(page);
  const modal = await openSaveModal(page);
  await modal.getByRole('button', { name: /Тестовая квартира/ }).click();
  await modal.getByRole('button', { name: /Создать комнату/ }).click();
  await modal.getByLabel('Название комнаты').fill('Детская');
  await modal.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page).toHaveURL(/#project\/ui_project\/room\//, { timeout: 60000 });
  await page.getByRole('region', { name: 'Комната' }).getByRole('button', { name: 'Проблемомер', exact: true }).click();
  await page.getByRole('button', { name: 'Начать', exact: true }).click();
  const question = page.getByRole('heading', { name: 'Укажите тип комнаты и площадь' });
  for (let i = 0; i < 6 && !(await question.isVisible().catch(() => false)); i += 1) {
    const next = page.getByRole('button', { name: 'Далее', exact: true });
    await expect(next).toBeEnabled();
    await next.click();
  }
  await expect(page.getByPlaceholder('Например, 18')).toHaveValue('18');
  await expect(page.getByRole('button', { name: 'Спальня', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('окно сохранения: без цен и боковых панелей на телефоне и в тёмной теме', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 390, height: 780 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await enter(page, 'owner');
  await walkProblemomer(page);
  const modal = await openSaveModal(page);
  await expect(modal).not.toContainText('₽');
  const box = await modal.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  expect(box!.y + box!.height).toBeLessThanOrEqual(780);
  await expect(page.locator('[class*="drawer" i]')).toHaveCount(0);
});
