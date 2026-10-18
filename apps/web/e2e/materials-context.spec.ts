import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

const API = 'http://127.0.0.1:4181';
const password = 'ui-fixture-password-only';
const TXT = Buffer.from('e2e').toString('base64');

test.beforeEach(async ({ request }) => {
  await request.post(`${API}/__reset`);
});

async function token(request: APIRequestContext, login: string) {
  const res = await request.post(`${API}/auth/login`, { data: { login, password } });
  expect(res.ok()).toBe(true);
  return (await res.json()).token as string;
}

type Node = { id: string; name: string; parentId: string | null; kind: string };

/** Дерево через настоящий API (хранилище — в памяти тестового сервера). */
async function seed(request: APIRequestContext) {
  const headers = { Authorization: `Bearer ${await token(request, 'ui.admin')}` };
  const post = async (path: string, data: object) => {
    const res = await request.post(`${API}${path}`, { headers, data });
    expect(res.ok(), await res.text()).toBe(true);
    return (await res.json()).materials as Node[];
  };
  let nodes = await post('/materials/folders', { name: 'Старые инструкции' });
  const root = nodes.find((n) => n.name === 'Старые инструкции')!;
  nodes = await post('/materials/folders', { name: 'Вложенная', parentId: root.id });
  const sub = nodes.find((n) => n.name === 'Вложенная')!;
  await post('/materials/files', { name: 'a.txt', mime: 'text/plain', contentBase64: TXT, parentId: root.id });
  await post('/materials/files', { name: 'b.txt', mime: 'text/plain', contentBase64: TXT, parentId: sub.id });
  await post('/materials/folders', { name: 'Оставить' });
}

async function enter(page: Page, role: string) {
  await page.goto('/');
  await page.getByLabel('Логин', { exact: true }).fill(`ui.${role}`);
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Разделы кабинета' })).toBeVisible();
  await page.getByRole(role === 'measurer' || role === 'crew' ? 'button' : 'tab', { name: 'Обучение', exact: true }).first().click();
}


/**
 * Меню появляется с анимацией (opacity/scale) и после первого кадра сдвигается к курсору.
 * Клик в этот момент попадает мимо пункта: pointerdown на <html> закрывает меню, и
 * Playwright ждёт пункт, которого уже нет. Ждём, пока меню встанет на место.
 */
async function menuSettled(menu: ReturnType<Page['getByRole']>) {
  await expect(menu).toBeVisible();
  await menu.evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)));
  await expect(menu).toHaveCSS('opacity', '1');
  await expect(menu).toHaveCSS('transform', 'none');
}

const folderCard = (page: Page, name: string) =>
  page.locator('article[data-material-id]', { has: page.getByText(name, { exact: true }) });

test('админ: правый клик по папке → «Удалить» → подтверждение → папки нет и после перезагрузки', async ({ page, request }) => {
  await seed(request);
  await enter(page, 'admin');
  const card = folderCard(page, 'Старые инструкции');
  await expect(card).toBeVisible();
  await card.click({ button: 'right' });
  const menu = page.getByRole('menu', { name: 'Папка «Старые инструкции»' });
  await menuSettled(menu);
  await expect(menu.getByRole('menuitem', { name: 'Удалить' })).toBeFocused();
  // Esc закрывает меню без удаления.
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);

  await card.click({ button: 'right' });
  await menuSettled(menu);
  await menu.getByRole('menuitem', { name: 'Удалить' }).click();
  const dialog = page.getByRole('dialog', { name: 'Удалить папку «Старые инструкции»?' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Вместе с ней удалятся 2 файла и 1 вложенная папка.');
  await expect(dialog.getByRole('button', { name: 'Отмена' })).toBeFocused();
  await dialog.getByRole('button', { name: 'Удалить папку' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(folderCard(page, 'Старые инструкции')).toHaveCount(0);
  await expect(folderCard(page, 'Оставить')).toBeVisible();

  await page.reload();
  await page.getByRole('tab', { name: 'Обучение', exact: true }).first().click();
  await expect(folderCard(page, 'Оставить')).toBeVisible();
  await expect(folderCard(page, 'Старые инструкции')).toHaveCount(0);
  // На сервере не осталось ни папки, ни вложенных записей.
  const res = await request.get(`${API}/materials`, { headers: { Authorization: `Bearer ${await token(request, 'ui.admin')}` } });
  const names = ((await res.json()).materials as Node[]).map((n) => n.name);
  expect(names).toEqual(['Оставить']);
});

test('админ: правый клик по пустому месту → «Создать папку» открывает форму', async ({ page, request }) => {
  await seed(request);
  await enter(page, 'admin');
  const list = page.getByTestId('materials-list');
  const box = (await list.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height - 6, { button: 'right' });
  const menu = page.getByRole('menu', { name: 'Материалы' });
  await menuSettled(menu);
  await menu.getByRole('menuitem', { name: 'Создать папку' }).click();
  const input = page.getByLabel('Название папки');
  await expect(input).toBeFocused();
  await input.fill('Новая из меню');
  await input.press('Enter');
  await expect(folderCard(page, 'Новая из меню')).toBeVisible();
});

for (const role of ['owner', 'sales', 'measurer', 'crew']) {
  test(`${role}: ни меню, ни кнопок создания/загрузки; API отвечает 403`, async ({ page, request }) => {
    await seed(request);
    await enter(page, role);
    const card = folderCard(page, 'Старые инструкции');
    await expect(card).toBeVisible();
    await card.click({ button: 'right' });
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Новая папка' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Загрузить файл' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Удалить' })).toHaveCount(0);
    const headers = { Authorization: `Bearer ${await token(request, `ui.${role}`)}` };
    const list = (await (await request.get(`${API}/materials`, { headers })).json()).materials as Node[];
    const id = list.find((n) => n.name === 'Старые инструкции')!.id;
    expect((await request.delete(`${API}/materials/${id}`, { headers })).status()).toBe(403);
    expect((await request.post(`${API}/materials/folders`, { headers, data: { name: 'x' } })).status()).toBe(403);
    expect(
      (await request.post(`${API}/materials/files`, { headers, data: { name: 'x.txt', mime: 'text/plain', contentBase64: TXT } })).status(),
    ).toBe(403);
  });
}

test('касание: долгое нажатие не перехватываем (меню только для мыши)', async ({ browser, request }) => {
  await seed(request);
  const context = await browser.newContext({ hasTouch: true, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await enter(page, 'admin');
  const card = folderCard(page, 'Старые инструкции');
  await expect(card).toBeVisible();
  const box = (await card.boundingBox())!;
  const prevented = await page.evaluate(
    ({ x, y }) => {
      const target = document.elementFromPoint(x, y)!;
      target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', clientX: x, clientY: y }));
      const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y });
      target.dispatchEvent(ev);
      return ev.defaultPrevented;
    },
    { x: box.x + 20, y: box.y + 20 },
  );
  expect(prevented).toBe(false);
  await expect(page.getByRole('menu')).toHaveCount(0);
  await context.close();
});
