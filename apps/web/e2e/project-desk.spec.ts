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
  await expect(page.locator('[data-room-id="ui_room"]')).toBeVisible();

  await view.getByRole('button', { name: 'Канбан', exact: true }).click();
  await expect(page.locator('[data-project-stage="install"] [data-project-id="ui_project"]')).toBeVisible();

  await page.reload();
  await page.getByRole('tab', { name: 'Проекты', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Вид проектов' }).getByRole('button', { name: 'Канбан', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await page.locator('[data-project-id="ui_project"]').click();
  const card = page.getByRole('dialog', { name: 'Карточка проекта' });
  await expect(card).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Проекты', exact: true })).toBeVisible();
  for (const name of ['Обзор', 'Рабочая информация', 'Команда', 'Задачи', 'Отчёты', 'Документы', 'Настройки']) {
    await card.getByRole('tab', { name, exact: true }).click();
    await expect(card.getByRole('tab', { name, exact: true })).toHaveAttribute('aria-selected', 'true');
  }

  await card.getByLabel('Описание').fill('Тихая квартира');
  await card.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(card.getByRole('button', { name: 'Сохранить', exact: true })).toBeEnabled();
  await card.getByRole('tab', { name: 'Обзор', exact: true }).click();
  await expect(card.getByText('Тихая квартира')).toBeVisible();
});

test('замерщик читает описание, бригада не видит сумму', async ({ page }) => {
  await enter(page);
  await page.getByRole('button', { name: 'Тестовая квартира', exact: true }).click();
  const card = page.getByRole('dialog', { name: 'Карточка проекта' });
  await expect(card.getByText('₽').first()).toBeVisible();
  await card.getByRole('button', { name: 'Настройки проекта', exact: true }).click();
  const measurer = card.getByRole('combobox', { name: 'Замерщик', exact: true });
  await expect(measurer.locator('option', { hasText: 'UI measurer' })).toHaveCount(1);
  await card.getByLabel('Описание', { exact: true }).fill('Текст для бригады замера');
  await measurer.selectOption('ui_measurer');
  await card.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(card.getByRole('button', { name: 'Сохранить', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Выйти', exact: true }).click();

  await enter(page, 'measurer');
  await page.getByRole('button', { name: 'Тестовая квартира', exact: true }).click();
  const read = page.getByRole('dialog', { name: 'Карточка проекта' });
  await expect(read.getByText('Текст для бригады замера')).toBeVisible();
  await read.getByRole('tab', { name: 'Настройки', exact: true }).click();
  await expect(read.getByRole('button', { name: 'Сохранить', exact: true })).toHaveCount(0);
  await expect(read.getByText('Менять их может владелец или менеджер.')).toBeVisible();
  await page.getByRole('button', { name: 'Выйти', exact: true }).click();

  await enter(page, 'crew');
  await page.getByRole('button', { name: 'Тестовая квартира', exact: true }).click();
  const crewCard = page.getByRole('dialog', { name: 'Карточка проекта' });
  await expect(crewCard).toBeVisible();
  await expect(crewCard).not.toContainText('₽');
  await expect(crewCard.getByText('Сумма', { exact: true })).toHaveCount(0);
  await expect(page.locator('[data-room-id="ui_crew_room"]')).toBeVisible();
});
