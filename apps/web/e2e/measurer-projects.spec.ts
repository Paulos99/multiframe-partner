import { expect, test, type Page } from '@playwright/test';

const password = 'ui-fixture-password-only';

test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:4181/__reset');
});

async function enter(page: Page, role: string) {
  await page.goto('/');
  await page.getByLabel('Логин', { exact: true }).fill(`ui.${role}`);
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await page.getByRole('tab', { name: 'Проекты', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Проекты', exact: true })).toBeVisible();
}

async function assignMeasurerToRooms(page: Page, rooms: string[]) {
  await enter(page, 'owner');
  await page.getByRole('button', { name: 'Тестовая квартира', exact: true }).click();
  const card = page.getByRole('region', { name: 'Проект' });
  await card.getByRole('tab', { name: 'Комнаты', exact: true }).click();
  for (const room of rooms) {
    await card.getByRole('button', { name: room }).click();
    await page.getByRole('region', { name: 'Комната' }).getByLabel('Исполнитель').selectOption('ui_measurer');
    await expect(page.getByRole('status').filter({ hasText: 'Сохранено' })).toBeVisible();
    await page.getByRole('region', { name: 'Комната' }).getByRole('button', { name: 'К проекту', exact: true }).click();
    await card.getByRole('tab', { name: 'Комнаты', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Выйти', exact: true }).click();
}

test('проекты замерщика: простой список комнат без вида «список/канбан», цены на месте', async ({ page }) => {
  await assignMeasurerToRooms(page, ['Спальня', 'Кухня']);
  await enter(page, 'measurer');

  const desk = page.getByRole('region', { name: 'Список проектов' });
  await expect(desk).toBeVisible();
  await expect(desk.getByText('Комнаты, которые нужно замерить')).toBeVisible();
  await expect(page.getByRole('group', { name: 'Вид проектов' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Список', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Канбан', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Архив', exact: false })).toHaveCount(0);
  await expect(page.locator('[data-project-stage]')).toHaveCount(0);
  await expect(page.locator('#kanban-help')).toHaveCount(0);
  await expect(desk.getByRole('table')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Действия с проектом/ })).toHaveCount(0);

  // Комната без замера сверху, с адресом, площадью и статусом.
  const project = desk.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Тестовая квартира', exact: true }) });
  await expect(project).toBeVisible();
  const bedroom = project.getByRole('button', { name: 'Спальня' });
  await expect(bedroom).toContainText('Тестовый адрес');
  await expect(bedroom).toContainText('Черновик');
  await expect(bedroom).not.toContainText('панел');
  // Комната на стадии «Замер» тоже в работе замерщика.
  await expect(project.getByRole('button', { name: 'Кухня' })).toContainText('Замер');
  await expect(desk.locator('details')).toHaveCount(0);
  // Назначенная только бригаде комната замерщику не видна.
  await expect(project.getByRole('button', { name: 'Гостиная' })).toHaveCount(0);

  // Открытие — страницей, не боковой панелью.
  await bedroom.click();
  await expect(page).toHaveURL(/#project\/ui_project\/room\//);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const room = page.getByRole('region', { name: 'Комната' });
  await expect(room.getByRole('heading', { level: 1, name: 'Спальня' })).toBeVisible();
  await expect(room.getByRole('button', { name: 'Калькулятор', exact: true })).toBeVisible();
});

test('проекты замерщика: сумма комнаты в списке видна замерщику', async ({ page }) => {
  await enter(page, 'owner');
  await page.getByRole('button', { name: 'Тестовая квартира', exact: true }).click();
  const card = page.getByRole('region', { name: 'Проект' });
  await card.getByRole('tab', { name: 'Комнаты', exact: true }).click();
  await card.getByRole('button', { name: 'Гостиная' }).click();
  await page.getByRole('region', { name: 'Комната' }).getByLabel('Исполнитель').selectOption('ui_measurer');
  await expect(page.getByRole('status').filter({ hasText: 'Сохранено' })).toBeVisible();
  await page.getByRole('button', { name: 'Выйти', exact: true }).click();

  await enter(page, 'measurer');
  const desk = page.getByRole('region', { name: 'Список проектов' });
  await desk.locator('summary').click();
  await expect(desk.getByRole('button', { name: 'Гостиная' })).toContainText(/75[\s\u00a0\u202f]*261/);
  await expect(desk.getByRole('button', { name: 'Гостиная' })).toContainText('Монтаж');
});
