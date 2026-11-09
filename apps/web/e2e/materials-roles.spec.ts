import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

/**
 * Роли видимости в «Обучении»: админ StP решает, каким ролям видны папка, файл и обучающее видео.
 * Скрытое от роли сервер не отдаёт вовсе. Снимки экрана — только если задан ROLES_SHOTS_DIR.
 */
const API = 'http://127.0.0.1:4181';
const password = 'ui-fixture-password-only';
const TXT = Buffer.from('roles e2e').toString('base64');
const SHOTS = process.env.ROLES_SHOTS_DIR || '';

test.beforeEach(async ({ request }) => {
  await request.post(`${API}/__reset`);
});

async function token(request: APIRequestContext, login: string) {
  const res = await request.post(`${API}/auth/login`, { data: { login, password } });
  expect(res.ok()).toBe(true);
  return (await res.json()).token as string;
}

type Node = { id: string; name: string; parentId: string | null; kind: string; section?: string | null };

async function adminPost(request: APIRequestContext, path: string, data: object) {
  const headers = { Authorization: `Bearer ${await token(request, 'ui.admin')}` };
  const res = await request.post(`${API}${path}`, { headers, data });
  expect(res.ok(), await res.text()).toBe(true);
  return (await res.json()).materials as Node[];
}

async function enter(page: Page, role: string) {
  await page.goto('/');
  await page.getByLabel('Логин', { exact: true }).fill(`ui.${role}`);
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Разделы кабинета' })).toBeVisible();
  const trainingTab = page.getByRole('tab', { name: 'Обучение', exact: true });
  if (await trainingTab.count()) await trainingTab.click();
  else await page.getByRole('button', { name: 'Обучение', exact: true }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Обучение' })).toBeVisible();
  await expect(page.getByTestId('materials-list')).toBeVisible();
}

async function shot(page: Page, name: string, target?: ReturnType<Page['locator']>) {
  if (!SHOTS) return;
  // Высокое окно: шапка кабинета закреплена и при съёмке длинной страницы налезает на содержимое.
  const before = page.viewportSize();
  await page.setViewportSize({ width: 1440, height: 2400 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
  if (target) await target.screenshot({ path: `${SHOTS}/${name}.png` });
  else await page.screenshot({ path: `${SHOTS}/${name}.png` });
  if (before) await page.setViewportSize(before);
}

/** Галочка роли; у роли вне папки к подписи добавляется «не видит папку». */
function roleBox(dialog: ReturnType<Page['getByTestId']>, label: string) {
  return dialog.getByRole('checkbox', { name: new RegExp(`^${label}(?: не видит папку)?$`) });
}

/** Окно «Кто видит»: «Только выбранные роли» и ровно эти галочки. */
async function pickRoles(dialog: ReturnType<Page['getByTestId']>, keep: string[]) {
  await dialog.getByRole('radio', { name: 'Только выбранные роли' }).check();
  for (const label of ['Владелец', 'Менеджер', 'Замерщик', 'Монтажник', 'Менеджер StP']) {
    const box = roleBox(dialog, label);
    if (await box.isDisabled()) continue;
    if (keep.includes(label)) await box.check();
    else await box.uncheck();
  }
}

test('админ задаёт роли новой папке; файл в ней — как у папки; монтажник не видит скрытое, общее видно всем', async ({ page, request }) => {
  await adminPost(request, '/materials/files', { name: 'Общая инструкция.txt', mime: 'text/plain', contentBase64: TXT });
  await enter(page, 'admin');

  // По умолчанию — все роли.
  const newRoles = page.getByTestId('new-material-roles');
  await expect(newRoles).toContainText('Видят новое: Все роли');
  await newRoles.click();
  const dialog = page.getByTestId('material-roles-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('radio', { name: 'Все роли' })).toBeChecked();
  await pickRoles(dialog, ['Владелец', 'Менеджер']);
  await shot(page, '01-admin-new-roles-dialog', dialog);
  await dialog.getByRole('button', { name: 'Сохранить' }).click();
  await expect(newRoles).toContainText('Видят новое: Владелец, Менеджер');

  await page.getByRole('button', { name: 'Новая папка' }).click();
  await page.getByLabel('Название папки').fill('Только для продаж');
  await page.getByRole('button', { name: 'Создать', exact: true }).click();
  const folder = page.locator('[data-material-id]').filter({ hasText: 'Только для продаж' });
  await expect(folder.getByTestId('material-roles')).toHaveText('Видят: Владелец, Менеджер');
  const common = page.locator('[data-material-id]').filter({ hasText: 'Общая инструкция.txt' });
  await expect(common.getByTestId('material-roles')).toHaveText('Видят: Все роли');
  await shot(page, '02-admin-list-with-role-badges');

  // Файл в закрытой папке по умолчанию «как у папки».
  await folder.getByRole('button', { name: /^Папка/ }).click();
  await expect(newRoles).toContainText('как у папки');
  await page.locator('input[type="file"]').first().setInputFiles({ name: 'Скрипт звонка.txt', mimeType: 'text/plain', buffer: Buffer.from('script') });
  const inner = page.locator('[data-material-id]').filter({ hasText: 'Скрипт звонка.txt' });
  await expect(inner.getByTestId('material-roles')).toHaveText('Видят: Владелец, Менеджер');

  // Монтажник: общий файл есть, закрытой папки и файла в ней нет — ни в списке, ни по прямой ссылке.
  await page.context().clearCookies();
  await page.evaluate(() => localStorage.clear());
  await enter(page, 'crew');
  await expect(page.locator('[data-material-id]').filter({ hasText: 'Общая инструкция.txt' })).toBeVisible();
  await expect(page.getByText('Только для продаж')).toHaveCount(0);
  await expect(page.getByTestId('material-roles')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Кто видит/ })).toHaveCount(0);
  await shot(page, '03-crew-sees-only-allowed');

  const crewHeaders = { Authorization: `Bearer ${await token(request, 'ui.crew')}` };
  const crewList = (await (await request.get(`${API}/materials`, { headers: crewHeaders })).json()).materials as Node[];
  expect(crewList.map((n) => n.name)).not.toContain('Скрипт звонка.txt');
  const adminHeaders = { Authorization: `Bearer ${await token(request, 'ui.admin')}` };
  const all = (await (await request.get(`${API}/materials`, { headers: adminHeaders })).json()).materials as Node[];
  const hidden = all.find((n) => n.name === 'Скрипт звонка.txt')!;
  const direct = await request.get(`${API}/materials/${hidden.id}/content`, { headers: crewHeaders });
  expect(direct.status()).toBe(404);

  // Менеджер видит.
  const salesHeaders = { Authorization: `Bearer ${await token(request, 'ui.sales')}` };
  const salesList = (await (await request.get(`${API}/materials`, { headers: salesHeaders })).json()).materials as Node[];
  expect(salesList.map((n) => n.name)).toEqual(expect.arrayContaining(['Только для продаж', 'Скрипт звонка.txt', 'Общая инструкция.txt']));
});

test('админ меняет роли позже; в закрытой папке шире папки выбрать нельзя', async ({ page, request }) => {
  let nodes = await adminPost(request, '/materials/folders', { name: 'Владельцам', roles: ['owner'] });
  const folder = nodes.find((n) => n.name === 'Владельцам')!;
  nodes = await adminPost(request, '/materials/files', { name: 'Договор.txt', mime: 'text/plain', contentBase64: TXT, parentId: folder.id });
  await adminPost(request, '/materials/files', { name: 'Прайс.txt', mime: 'text/plain', contentBase64: TXT });
  await enter(page, 'admin');

  await page.getByRole('button', { name: 'Кто видит: Прайс.txt' }).click();
  const dialog = page.getByTestId('material-roles-dialog');
  await pickRoles(dialog, ['Владелец', 'Менеджер', 'Замерщик']);
  await dialog.getByRole('button', { name: 'Сохранить' }).click();
  await expect(dialog).toHaveCount(0);
  const price = page.locator('[data-material-id]').filter({ hasText: 'Прайс.txt' });
  await expect(price.getByTestId('material-roles')).toHaveText('Видят: Владелец, Менеджер, Замерщик');

  // Пустой выбор не сохраняется.
  await page.getByRole('button', { name: 'Кто видит: Прайс.txt' }).click();
  await pickRoles(dialog, []);
  await dialog.getByRole('button', { name: 'Сохранить' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Выберите хотя бы одну роль');
  await dialog.getByRole('button', { name: 'Отмена' }).click();

  await page.locator('[data-material-id]').filter({ hasText: 'Владельцам' }).getByRole('button', { name: /^Папка/ }).click();
  await page.getByRole('button', { name: 'Кто видит: Договор.txt' }).click();
  await expect(dialog).toContainText('Папка «Владельцам» видна только: Владелец. Материал внутри не может быть виден шире папки.');
  await dialog.getByRole('radio', { name: 'Только выбранные роли' }).check();
  await expect(roleBox(dialog, 'Монтажник')).toBeDisabled();
  await expect(dialog.getByRole('checkbox', { name: 'Монтажник не видит папку' })).toBeVisible();
  await expect(roleBox(dialog, 'Владелец')).toBeEnabled();
  await shot(page, '04-admin-folder-limit-dialog', dialog);
  await dialog.getByRole('button', { name: 'Отмена' }).click();

  const crewHeaders = { Authorization: `Bearer ${await token(request, 'ui.crew')}` };
  const crewNames = ((await (await request.get(`${API}/materials`, { headers: crewHeaders })).json()).materials as Node[]).map((n) => n.name);
  expect(crewNames).not.toContain('Прайс.txt');
  expect(crewNames).not.toContain('Договор.txt');
  const measurerHeaders = { Authorization: `Bearer ${await token(request, 'ui.measurer')}` };
  const measurerNames = ((await (await request.get(`${API}/materials`, { headers: measurerHeaders })).json()).materials as Node[]).map((n) => n.name);
  expect(measurerNames).toContain('Прайс.txt');
});

test('видео: админ удаляет ролик монтажника с подтверждением, открывает ролик замерщика монтажнику и добавляет новое', async ({ page, request }) => {
  await enter(page, 'admin');
  await shot(page, '05-admin-training-videos', page.getByTestId('training-videos'));

  // Удаление с подтверждением: отмена ничего не меняет.
  page.once('dialog', (d) => void d.dismiss());
  await page.getByRole('button', { name: 'Удалить видео: Монтажник' }).click();
  await expect(page.getByRole('region', { name: 'Обучающее видео: Монтажник' })).toBeVisible();
  page.once('dialog', (d) => {
    expect(d.message()).toContain('Удалить видео «Монтажник»?');
    void d.accept();
  });
  await page.getByRole('button', { name: 'Удалить видео: Монтажник' }).click();
  await expect(page.getByRole('region', { name: 'Обучающее видео: Монтажник' })).toHaveCount(0);
  await expect(page.locator('[data-role-video]')).toHaveCount(3);

  // Ролик замерщика — ещё и монтажнику.
  await page.getByRole('button', { name: 'Кто видит: Замерщик' }).click();
  const dialog = page.getByTestId('material-roles-dialog');
  await pickRoles(dialog, ['Замерщик', 'Монтажник']);
  await dialog.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByRole('region', { name: 'Обучающее видео: Замерщик' }).getByTestId('material-roles')).toHaveText('Видят: Замерщик, Монтажник');

  // Новое видео только для монтажника.
  await page.getByRole('button', { name: 'Добавить видео' }).click();
  await pickRoles(dialog, ['Монтажник']);
  const chooser = page.waitForEvent('filechooser');
  await dialog.getByRole('button', { name: 'Выбрать видеофайл' }).click();
  await (await chooser).setFiles({ name: 'Монтаж углов.mp4', mimeType: 'video/mp4', buffer: Buffer.alloc(4096, 1) });
  const added = page.getByRole('region', { name: 'Обучающее видео: Монтаж углов' });
  await expect(added).toBeVisible();
  await expect(added.getByTestId('material-roles')).toHaveText('Видят: Монтажник');
  await shot(page, '06-admin-videos-after-changes', page.getByTestId('training-videos'));

  // Монтажник: своего встроенного ролика больше нет, есть ролик замерщика и новое видео.
  await page.evaluate(() => localStorage.clear());
  await enter(page, 'crew');
  await expect(page.getByRole('region', { name: 'Обучающее видео: Замерщик' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Обучающее видео: Монтаж углов' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Обучающее видео: Монтажник' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Удалить видео|Кто видит|Добавить видео/ })).toHaveCount(0);
  await shot(page, '07-crew-videos');

  // Ролик замерщика открывается в том же окне просмотра, в исходном качестве.
  await page.getByRole('button', { name: 'Смотреть: Замерщик' }).click();
  const viewer = page.getByRole('dialog', { name: 'Просмотр: Замерщик.mp4' });
  await expect(viewer.locator('video')).toHaveAttribute('src', /\/videos\/role-measurer\.mp4\?v=\d+/);
  const size = await viewer.locator('video').evaluate(
    (el: HTMLVideoElement) =>
      new Promise<{ w: number; h: number }>((resolve) => {
        if (el.videoWidth) resolve({ w: el.videoWidth, h: el.videoHeight });
        else el.addEventListener('loadedmetadata', () => resolve({ w: el.videoWidth, h: el.videoHeight }), { once: true });
      }),
  );
  expect(size).toEqual({ w: 1920, h: 1080 });

  // Владелец ролика монтажника не видит и не видел; удалённый ролик не вернулся после перезапуска чтения.
  const ownerHeaders = { Authorization: `Bearer ${await token(request, 'ui.owner')}` };
  const ownerVideos = ((await (await request.get(`${API}/materials`, { headers: ownerHeaders })).json()).materials as Node[]).filter((n) => n.section === 'video');
  expect(ownerVideos.map((n) => n.name)).toEqual(['Владелец компании']);
});
