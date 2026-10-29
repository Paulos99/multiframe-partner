import { expect, test, type Page } from '@playwright/test';

const password = 'ui-fixture-password-only';

test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:4181/__reset');
});

async function enter(page: Page, role = 'owner') {
  await page.goto('/');
  await page.getByLabel('Логин', { exact: true }).fill(`ui.${role}`);
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await page.getByRole('tab', { name: 'Проекты', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Проекты', exact: true })).toBeVisible();
}

test('список и канбан запоминаются, карточка открывает разделы', async ({ page }) => {
  await enter(page);
  const view = page.getByRole('group', { name: 'Вид проектов' });
  await expect(view.getByRole('button', { name: 'Список', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('columnheader', { name: 'Сумма' })).toBeVisible();
  await expect(page.getByText('Комнаты по стадиям')).toHaveCount(0);
  await expect(page.locator('[aria-label="Доска проектов"]')).toHaveCount(0);
  await expect(page.locator('[data-kanban-stage]')).toHaveCount(0);
  await expect(page.locator('#kanban-help')).toHaveCount(0);

  await view.getByRole('button', { name: 'Канбан', exact: true }).click();
  await expect(page.locator('[data-project-stage="install"] [data-project-id="ui_project"]')).toBeVisible();

  await page.reload();
  await page.getByRole('tab', { name: 'Проекты', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Вид проектов' }).getByRole('button', { name: 'Канбан', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await page.locator('[data-project-id="ui_project"]').click();
  await expect(page).toHaveURL(/#project\/ui_project\/overview$/);
  const card = page.getByRole('region', { name: 'Проект' });
  await expect(card.getByRole('heading', { level: 1, name: 'Тестовая квартира' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Карточка проекта' })).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Комната' })).toHaveCount(0);
  await page.goBack();
  await expect(page.getByRole('region', { name: 'Список проектов' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Канбан', exact: true })).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: 'Список', exact: true }).click();
  await page.getByRole('button', { name: 'Тестовая квартира', exact: true }).click();
  await card.getByRole('tab', { name: 'Комнаты', exact: true }).click();
  await expect(page).toHaveURL(/#project\/ui_project\/work$/);
  await expect(card.getByRole('button', { name: 'Спальня' })).toBeVisible();
  await card.getByRole('button', { name: 'Спальня' }).click();
  const room = page.getByRole('region', { name: 'Комната' });
  await expect(page).toHaveURL(/#project\/ui_project\/room\/ui_room$/);
  await expect(room.getByRole('heading', { level: 1, name: 'Спальня' })).toBeVisible();
  await room.getByRole('button', { name: 'К проекту', exact: true }).click();
  await expect(page).toHaveURL(/#project\/ui_project\/work$/);
  await expect(card).toBeVisible();
  for (const name of ['Обзор', 'Комнаты', 'Команда', 'Задачи', 'Отчёты', 'Документы', 'Настройки']) {
    await card.getByRole('tab', { name, exact: true }).click();
    await expect(card.getByRole('tab', { name, exact: true })).toHaveAttribute('aria-selected', 'true');
  }

  await card.getByLabel('Описание', { exact: true }).fill('Тихая квартира');
  const save = card.getByRole('button', { name: 'Сохранить', exact: true });
  await save.evaluate((el) => el.scrollIntoView({ block: 'end', inline: 'nearest' }));
  await save.click();
  await expect(page.getByRole('status').filter({ hasText: 'Сохранено' })).toBeVisible();
  const overview = card.getByRole('tab', { name: 'Обзор', exact: true });
  await overview.click();
  await expect(page).toHaveURL(/#project\/ui_project\/overview$/);
  await expect(overview).toHaveAttribute('aria-selected', 'true');
  await expect(card.getByText('Тихая квартира')).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(/#project\/ui_project\/overview$/);
  await expect(card.getByText('Тихая квартира')).toBeVisible();
  await page.getByRole('tab', { name: 'Проекты', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Список проектов' })).toBeVisible();
  await expect(page).not.toHaveURL(/#project\//);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Тестовая квартира', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Путь' })).toBeHidden();
});

test('замерщик читает описание, бригада не видит сумму', async ({ page }) => {
  await enter(page);
  await page.getByRole('button', { name: 'Тестовая квартира', exact: true }).click();
  const card = page.getByRole('region', { name: 'Проект' });
  await expect(card.getByText('₽').first()).toBeVisible();
  await card.getByRole('button', { name: 'Настройки проекта', exact: true }).click();
  const measurer = card.getByRole('combobox', { name: 'Замерщик', exact: true });
  await expect(measurer.locator('option', { hasText: 'UI measurer' })).toHaveCount(1);
  await card.getByLabel('Описание', { exact: true }).fill('Текст для бригады замера');
  await measurer.selectOption('ui_measurer');
  await card.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(card.getByRole('button', { name: 'Сохранить', exact: true })).toBeEnabled();
  // Замерщик видит проект списком своих комнат: назначаем ему кухню.
  await card.getByRole('tab', { name: 'Комнаты', exact: true }).click();
  await card.getByRole('button', { name: 'Кухня' }).click();
  await page.getByRole('region', { name: 'Комната' }).getByLabel('Исполнитель').selectOption('ui_measurer');
  await expect(page.getByRole('status').filter({ hasText: 'Сохранено' })).toBeVisible();
  await page.getByRole('button', { name: 'Выйти', exact: true }).click();

  await enter(page, 'measurer');
  const list = page.getByRole('region', { name: 'Список проектов' });
  await expect(page.getByRole('group', { name: 'Вид проектов' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Канбан', exact: true })).toHaveCount(0);
  await expect(list.getByRole('heading', { name: 'Тестовая квартира', exact: true })).toBeVisible();
  await expect(list.getByRole('button', { name: 'Кухня' })).toContainText('Замер');
  await expect(list.getByRole('table')).toHaveCount(0);
  await list.getByRole('button', { name: 'Кухня' }).click();
  await expect(page).toHaveURL(/#project\/ui_project\/room\//);
  await page.getByRole('navigation', { name: 'Путь' }).getByRole('button', { name: 'Тестовая квартира', exact: true }).click();
  const read = page.getByRole('region', { name: 'Проект' });
  await read.getByRole('tab', { name: 'Обзор', exact: true }).click();
  await expect(read.getByRole('button', { name: 'Настройки проекта', exact: true })).toHaveCount(0);
  await expect(read.getByText('Текст для бригады замера')).toBeVisible();
  await read.getByRole('tab', { name: 'Настройки', exact: true }).click();
  await expect(read.getByRole('button', { name: 'Сохранить', exact: true })).toHaveCount(0);
  await expect(read.getByText('Менять их может владелец или менеджер.')).toBeVisible();
  await page.getByRole('button', { name: 'Выйти', exact: true }).click();

  await enter(page, 'crew');
  const desk = page.getByRole('region', { name: 'Список проектов' });
  await expect(page.getByRole('group', { name: 'Вид проектов' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Канбан', exact: true })).toHaveCount(0);
  await expect(page.locator('[data-project-stage]')).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Карточка проекта' })).toHaveCount(0);
  await expect(desk.getByRole('heading', { name: 'Тестовая квартира', exact: true })).toBeVisible();
  await expect(desk.getByText('Тестовый адрес').first()).toBeVisible();
  const living = desk.getByRole('button', { name: 'Гостиная' });
  await expect(living).toContainText('24 м²');
  await expect(living).toContainText('16 панелей');
  await expect(living).toContainText('Монтаж');
  await expect(desk.getByRole('button', { name: 'Спальня' })).toContainText('Черновик');
  await expect(desk).not.toContainText('₽');
  await expect(desk.getByText('Сумма', { exact: true })).toHaveCount(0);
  await expect(desk.getByText('75261')).toHaveCount(0);
  await expect(desk.getByText(/^Готовые/)).toHaveCount(0);
  await living.click();
  const room = page.getByRole('region', { name: 'Комната' });
  await expect(page).toHaveURL(/#project\/ui_project\/room\/ui_crew_room$/);
  await expect(page.getByRole('dialog', { name: 'Комната' })).toHaveCount(0);
  await expect(room.getByRole('heading', { level: 1, name: 'Гостиная' })).toBeVisible();
  await expect(room.getByText('Панели', { exact: true })).toBeVisible();
  await expect(room.getByText('Итого комнаты')).toHaveCount(0);
  await expect(room).not.toContainText('₽');
});

test('менеджер открывает проект страницей и видит настройки', async ({ page }) => {
  await enter(page, 'sales');
  await page.getByRole('button', { name: 'Тестовая квартира', exact: true }).click();
  await expect(page).toHaveURL(/#project\/ui_project\/overview$/);
  const card = page.getByRole('region', { name: 'Проект' });
  await expect(card.getByRole('heading', { level: 1, name: 'Тестовая квартира' })).toBeVisible();
  await expect(card.getByRole('button', { name: 'Настройки проекта', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Карточка проекта' })).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Комната' })).toHaveCount(0);
  await card.getByRole('tab', { name: 'Команда', exact: true }).click();
  await expect(page).toHaveURL(/#project\/ui_project\/team$/);
});

test('узкий экран 700px: разделы под кнопкой «Меню»', async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 900 });
  await page.goto('/');
  await page.getByLabel('Логин', { exact: true }).fill('ui.owner');
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  const menu = page.getByRole('button', { name: 'Меню', exact: true });
  await expect(menu).toBeVisible();
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  const aside = page.locator('aside[aria-label="Разделы кабинета"]');
  const closed = await aside.boundingBox();
  expect(closed).not.toBeNull();
  expect(closed!.x + closed!.width).toBeLessThanOrEqual(0);
  await menu.click();
  await expect(menu).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('tab', { name: 'Проекты', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Проекты', exact: true })).toBeVisible();
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
});
