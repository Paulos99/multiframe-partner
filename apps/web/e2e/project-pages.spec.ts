import { expect, test, type Page } from '@playwright/test';
import { openProjectRoom } from './open-room';

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

test('вкладки проекта не копят историю: один «назад» ведёт к списку, из комнаты — к проекту', async ({ page }) => {
  await enter(page, 'owner');
  await page.getByRole('button', { name: 'Тестовая квартира', exact: true }).click();
  const card = page.getByRole('region', { name: 'Проект' });
  await expect(page).toHaveURL(/#project\/ui_project\/overview$/);
  for (const name of ['Комнаты', 'Команда', 'Отчёты', 'Настройки']) {
    await card.getByRole('tab', { name, exact: true }).click();
    await expect(card.getByRole('tab', { name, exact: true })).toHaveAttribute('aria-selected', 'true');
  }
  await page.goBack();
  await expect(page.getByRole('region', { name: 'Список проектов' })).toBeVisible();
  await expect(page).not.toHaveURL(/#project\//);

  await page.getByRole('button', { name: 'Тестовая квартира', exact: true }).click();
  await card.getByRole('tab', { name: 'Комнаты', exact: true }).click();
  await card.getByRole('button', { name: 'Спальня' }).click();
  await expect(page).toHaveURL(/#project\/ui_project\/room\/ui_room$/);
  await page.goBack();
  await expect(page).toHaveURL(/#project\/ui_project\/work$/);
  await expect(card).toBeVisible();
  await expect(card.getByRole('tab', { name: 'Комнаты', exact: true })).toHaveAttribute('aria-selected', 'true');
});

test('класс комфорта показан по-русски, без латинских кодов', async ({ page }) => {
  await enter(page, 'owner');
  await page.getByRole('button', { name: 'Тестовая квартира', exact: true }).click();
  const card = page.getByRole('region', { name: 'Проект' });
  for (const tab of ['Комнаты', 'Отчёты']) {
    await card.getByRole('tab', { name: tab, exact: true }).click();
    await expect(card.getByText('Дискомфорт → Комфорт').first()).toBeVisible();
    await expect(card).not.toContainText(/below/i);
    await expect(card).not.toContainText(/Класс\s+(below|V|B|A)\b/);
  }
});

test('страница комнаты: нет формы новой комнаты и удаления проекта, удаление комнаты — внизу с подтверждением', async ({ page }) => {
  await enter(page, 'owner');
  await page.getByRole('button', { name: 'Тестовая квартира', exact: true }).click();
  const card = page.getByRole('region', { name: 'Проект' });
  await card.getByRole('tab', { name: 'Комнаты', exact: true }).click();
  await expect(card.getByLabel('Новая комната')).toBeVisible();
  await card.getByRole('button', { name: 'Спальня' }).click();
  const room = page.getByRole('region', { name: 'Комната' });
  await expect(room.getByRole('heading', { level: 1, name: 'Спальня' })).toBeVisible();
  await expect(room.getByLabel('Новая комната')).toHaveCount(0);
  await expect(room.getByRole('button', { name: 'Добавить комнату', exact: true })).toHaveCount(0);
  await expect(room.getByRole('button', { name: 'Удалить проект', exact: true })).toHaveCount(0);
  const del = room.getByRole('button', { name: 'Удалить комнату', exact: true });
  await del.scrollIntoViewIfNeeded();
  const lastBox = await room.locator('button, select, summary').last().boundingBox();
  const delBox = await del.boundingBox();
  expect(delBox && lastBox && delBox.y >= lastBox.y - 1).toBeTruthy();
  await del.click();
  await expect(page.getByRole('alertdialog')).toContainText('Удалить комнату «');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Отмена' }).click();

  await page.goBack();
  await card.getByRole('tab', { name: 'Настройки', exact: true }).click();
  await card.getByRole('button', { name: 'Удалить проект', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toContainText('Удалить проект «Тестовая квартира»?');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Отмена' }).click();
});

test('исполнитель комнаты виден в команде проекта и подставляется в пустое поле проекта', async ({ page }) => {
  await enter(page, 'owner');
  await page.getByRole('button', { name: 'Тестовая квартира', exact: true }).click();
  const card = page.getByRole('region', { name: 'Проект' });
  await card.getByRole('tab', { name: 'Команда', exact: true }).click();
  await expect(card.locator('dl > div', { hasText: 'Замерщик' })).toContainText('Не назначен');
  await card.getByRole('tab', { name: 'Комнаты', exact: true }).click();
  await card.getByRole('button', { name: 'Спальня' }).click();
  const room = page.getByRole('region', { name: 'Комната' });
  const saved = page.waitForRequest((r) => /\/projects\/ui_project$/.test(new URL(r.url()).pathname) && r.method() !== 'GET');
  await room.getByLabel('Исполнитель').selectOption('ui_measurer');
  await saved;
  await page.goBack();
  await card.getByRole('tab', { name: 'Команда', exact: true }).click();
  const measurer = card.locator('dl > div', { hasText: 'Замерщик' });
  await expect(measurer).toContainText('UI measurer');
  await expect(card.getByRole('heading', { name: 'Назначения по комнатам' })).toBeVisible();
  await page.reload();
  await card.getByRole('tab', { name: 'Настройки', exact: true }).click();
  await expect(card.getByRole('combobox', { name: 'Замерщик', exact: true })).toHaveValue('ui_measurer');
});

test('замерщик видит цены в калькуляторе из комнаты', async ({ page }) => {
  await enter(page, 'owner');
  await page.getByRole('button', { name: 'Тестовая квартира', exact: true }).click();
  const card = page.getByRole('region', { name: 'Проект' });
  await card.getByRole('tab', { name: 'Комнаты', exact: true }).click();
  await card.getByRole('button', { name: 'Спальня' }).click();
  await page.getByRole('region', { name: 'Комната' }).getByLabel('Исполнитель').selectOption('ui_measurer');
  await expect(page.getByRole('status').filter({ hasText: 'Сохранено' })).toBeVisible();
  await page.getByRole('button', { name: 'Выйти', exact: true }).click();

  await enter(page, 'measurer');
  await openProjectRoom(page, 'Спальня');
  await page.getByRole('region', { name: 'Комната' }).getByRole('button', { name: 'Калькулятор', exact: true }).click();
  const frame = page.locator('iframe[title="Калькулятор MultiFrame · партнёр"]');
  await expect(frame).toBeVisible();
  await expect(frame).not.toHaveAttribute('src', /hidePrices=1/);
  const calc = page.frameLocator('iframe[title="Калькулятор MultiFrame · партнёр"]');
  await expect(calc.locator('body')).not.toHaveClass(/hide-prices/);
});
