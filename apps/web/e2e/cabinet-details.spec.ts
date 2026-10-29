import { test, expect, type Page } from '@playwright/test';
import { openProjectRoom } from './open-room';

const password = 'ui-fixture-password-only';

test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:4181/__reset');
});

async function enter(page: Page) {
  await page.goto('/');
  await page.getByLabel('Логин', { exact: true }).fill('ui.owner');
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Проекты', exact: true })).toBeVisible();
}

test('карточка сотрудника открывается страницей и возвращается назад', async ({ page }) => {
  await enter(page);
  await page.getByRole('tab', { name: 'Компания', exact: true }).click();
  await page.getByRole('tab', { name: 'Сотрудники', exact: true }).click();
  await expect(page).toHaveURL(/#company\/staff$/);
  await page.getByRole('button', { name: /UI sales/ }).click();
  await expect(page).toHaveURL(/#staff\//);
  const card = page.getByRole('region', { name: 'Сотрудник' });
  await expect(card.getByRole('heading', { level: 1, name: 'UI sales' })).toBeVisible();
  // Путь: Компания / Сотрудники / имя.
  const crumbs = card.getByRole('navigation', { name: 'Путь' });
  await expect(crumbs.getByRole('button', { name: 'Компания', exact: true })).toBeVisible();
  await expect(crumbs.getByRole('button', { name: 'Сотрудники', exact: true })).toBeVisible();
  await expect(crumbs).toContainText('UI sales');
  await expect(page.getByRole('dialog', { name: 'UI sales' })).toHaveCount(0);
  await expect(page.locator('[class*="drawer" i]')).toHaveCount(0);
  await page.reload();
  await expect(page).toHaveURL(/#staff\//);
  await expect(card.getByRole('heading', { level: 1, name: 'UI sales' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Компания', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.goBack();
  await expect(page).toHaveURL(/#company\/staff$/);
  await expect(page.getByRole('heading', { name: 'Сотрудники', exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Сотрудники', exact: true })).toHaveAttribute('aria-selected', 'true');
});

test('владелец: «Компания» — одна вкладка меню с вкладками «О компании» и «Сотрудники»', async ({ page }) => {
  await enter(page);
  const nav = page.getByRole('complementary', { name: 'Разделы кабинета' });
  await expect(nav.getByRole('tab', { name: 'Сотрудники', exact: true })).toHaveCount(0);
  await nav.getByRole('tab', { name: 'Компания', exact: true }).click();
  await expect(page).toHaveURL(/#company\/about$/);
  const section = page.getByRole('region', { name: 'Компания' });
  const tabs = section.getByRole('tablist', { name: 'Разделы компании' });
  await expect(tabs.getByRole('tab', { name: 'О компании', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(section.getByRole('button', { name: /Изменить/ }).first()).toBeVisible();

  await tabs.getByRole('tab', { name: 'Сотрудники', exact: true }).click();
  await expect(page).toHaveURL(/#company\/staff$/);
  await expect(tabs.getByRole('tab', { name: 'Сотрудники', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(section.getByRole('button', { name: /UI sales/ })).toBeVisible();

  // Хлебная крошка «Компания» из карточки ведёт на «О компании».
  await section.getByRole('button', { name: /UI sales/ }).click();
  const card = page.getByRole('region', { name: 'Сотрудник' });
  await card.getByRole('button', { name: 'Компания', exact: true }).click();
  await expect(page).toHaveURL(/#company\/about$/);
  await expect(page.getByRole('region', { name: 'Компания' })).toBeVisible();
  // «К списку» из карточки возвращает на вкладку «Сотрудники».
  await tabs.getByRole('tab', { name: 'Сотрудники', exact: true }).click();
  await section.getByRole('button', { name: /UI sales/ }).click();
  await card.getByRole('button', { name: 'К списку', exact: true }).click();
  await expect(page).toHaveURL(/#company\/staff$/);
  await expect(tabs.getByRole('tab', { name: 'Сотрудники', exact: true })).toHaveAttribute('aria-selected', 'true');
});

test('старый адрес #staff открывает вкладку «Сотрудники» раздела «Компания»', async ({ page }) => {
  await enter(page);
  await page.goto('/#staff');
  await expect(page).toHaveURL(/#company\/staff$/);
  await expect(page.getByRole('tab', { name: 'Компания', exact: true })).toHaveAttribute('aria-selected', 'true');
  const section = page.getByRole('region', { name: 'Компания' });
  await expect(section.getByRole('tab', { name: 'Сотрудники', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(section.getByRole('button', { name: /UI sales/ })).toBeVisible();
  // Прямой адрес вкладки переживает перезагрузку.
  await page.reload();
  await expect(page).toHaveURL(/#company\/staff$/);
  await expect(section.getByRole('tab', { name: 'Сотрудники', exact: true })).toHaveAttribute('aria-selected', 'true');
});

test('комната добавляется со страницы проекта, у новой написано, что площадь не указана', async ({ page }) => {
  await enter(page);
  await page.getByRole('tab', { name: 'Проекты', exact: true }).click();
  await page.getByRole('button', { name: 'Тестовая квартира', exact: true }).click();
  const card = page.getByRole('region', { name: 'Проект' });
  await card.getByRole('tab', { name: 'Комнаты', exact: true }).click();
  await card.getByLabel('Новая комната').fill('Кладовая');
  await card.getByRole('button', { name: 'Добавить комнату', exact: true }).click();
  const drawer = page.getByRole('region', { name: 'Комната' });
  await expect(page).toHaveURL(/#project\/ui_project\/room\//);
  await expect(drawer.getByRole('heading', { level: 1, name: 'Кладовая' })).toBeVisible();
  await expect(drawer.getByText(/площадь не указана/i).first()).toBeVisible();
  await expect(drawer.getByText('— м²')).toHaveCount(0);
  await expect(drawer.getByText(/Задайте её в Проблемомере/)).toBeVisible();
  await drawer.getByRole('button', { name: 'Указать площадь в Проблемомере', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Начать', exact: true })).toBeVisible();
});
