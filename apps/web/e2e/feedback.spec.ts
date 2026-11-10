import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, type Page } from '@playwright/test';

const API = 'http://127.0.0.1:4181';
const password = 'ui-fixture-password-only';
const fixture = (name: string) => path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', name);
const BEFORE = fixture('ceiling-before.jpg');
const PORTRAIT = fixture('ceiling-portrait.jpg');

const shots = process.env.REVIEW_SHOTS_DIR;
if (shots) mkdirSync(shots, { recursive: true });

/** Скриншоты пишутся только когда задана папка REVIEW_SHOTS_DIR (локальный разбор). */
async function shot(page: Page, name: string) {
  if (shots) await page.screenshot({ path: `${shots}/${name}` });
}

test.beforeEach(async ({ request }) => {
  await request.post(`${API}/__reset`);
});

async function enter(page: Page, login: string) {
  await page.goto('/');
  await page.getByLabel('Логин', { exact: true }).fill(login);
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Разделы кабинета' })).toBeVisible();
}

async function logout(page: Page) {
  await page.getByRole('button', { name: 'Выйти', exact: true }).first().click();
  await expect(page.getByLabel('Логин', { exact: true })).toBeVisible();
}

test('монтажник пишет об ошибке с фото, админ StP отвечает, монтажник видит ответ', async ({ page }) => {
  await enter(page, 'ui.crew');
  await page.getByRole('button', { name: 'Обратная связь', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Обратная связь' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('radio', { name: /Ошибка/ })).toBeChecked();

  // Без текста не отправить.
  await dialog.getByRole('button', { name: 'Отправить', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Опишите, что случилось или что предлагаете');

  await dialog.getByLabel('Что случилось или что предлагаете').fill('В карточке комнаты не сохраняется площадь после правки');
  await dialog.getByLabel('Фото к обращению').setInputFiles([BEFORE, PORTRAIT]);
  await expect(dialog.getByRole('img', { name: /Выбранное фото/ })).toHaveCount(2);
  await dialog.getByRole('button', { name: 'Убрать фото 2' }).click();
  await expect(dialog.getByRole('img', { name: /Выбранное фото/ })).toHaveCount(1);
  await dialog.getByText('Что приложится само').click();
  await expect(dialog.getByText(/Версия приложения/)).toBeVisible();
  await expect(dialog.getByText(/Раздел: /)).not.toContainText('—');
  await shot(page, '01-crew-new-feedback.png');

  await dialog.getByRole('button', { name: 'Отправить', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('Обращение отправлено');

  await dialog.getByRole('tab', { name: 'Мои обращения' }).click();
  const mine = dialog.getByTestId('feedback-card');
  await expect(mine).toHaveCount(1);
  await expect(mine).toContainText('Новое');
  await expect(mine.getByRole('img', { name: 'Фото 1' })).toBeVisible();
  await expect
    .poll(() => mine.getByRole('img', { name: 'Фото 1' }).evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);
  await shot(page, '02-crew-my-feedback-new.png');
  await dialog.getByRole('button', { name: 'Закрыть обратную связь' }).click();
  await logout(page);

  // Админ StP: значок новых, фильтры, статус и ответ.
  await enter(page, 'ui.admin');
  const tab = page.getByRole('tab', { name: /Обратная связь/ });
  await expect(tab).toContainText('1');
  await tab.click();
  const panel = page.getByRole('region', { name: 'Обратная связь' });
  const card = panel.getByTestId('feedback-card');
  await expect(card).toHaveCount(1);
  await expect(card).toContainText('UI test company');
  await expect(card).toContainText('Монтажник');
  await expect(card).toContainText('Устройство');

  await panel.getByLabel('Тип', { exact: true }).selectOption('idea');
  await expect(panel.getByText('Обращений с такими условиями нет.')).toBeVisible();
  await panel.getByLabel('Тип', { exact: true }).selectOption('');
  await panel.getByLabel('Партнёр', { exact: true }).selectOption({ label: 'UI test company' });
  await expect(card).toHaveCount(1);
  await shot(page, '03-admin-feedback-list.png');

  await card.getByLabel('Статус обращения').selectOption('in_progress');
  await card.getByLabel('Ответ отправителю').fill('Спасибо, исправляем: площадь будет сохраняться.');
  await card.getByRole('button', { name: 'Сохранить' }).click();
  await expect(card.getByTestId('feedback-reply')).toContainText('исправляем');
  await expect(card).toHaveAttribute('data-status', 'in_progress');
  await expect(tab).not.toContainText('·');
  await panel.getByLabel('Статус', { exact: true }).selectOption('new');
  await expect(panel.getByText('Обращений с такими условиями нет.')).toBeVisible();
  await panel.getByLabel('Статус', { exact: true }).selectOption('');
  await shot(page, '04-admin-feedback-replied.png');
  await logout(page);

  // Отправитель видит статус и ответ.
  await enter(page, 'ui.crew');
  await page.getByRole('button', { name: 'Обратная связь', exact: true }).click();
  await dialog.getByRole('tab', { name: 'Мои обращения' }).click();
  await expect(mine).toContainText('В работе');
  await expect(mine.getByTestId('feedback-reply')).toContainText('Спасибо, исправляем');
  await shot(page, '05-crew-sees-reply.png');
});

test('другой сотрудник не видит чужие обращения; у менеджера StP кнопки нет', async ({ page, request }) => {
  const login = await request.post(`${API}/auth/login`, { data: { login: 'ui.crew', password } });
  const { token } = (await login.json()) as { token: string };
  const res = await request.post(`${API}/feedback`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { type: 'question', text: 'Вопрос монтажника' },
  });
  expect(res.ok(), await res.text()).toBeTruthy();

  await enter(page, 'ui.owner');
  await page.getByRole('button', { name: 'Обратная связь', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Обратная связь' });
  await dialog.getByRole('tab', { name: 'Мои обращения' }).click();
  await expect(dialog.getByText(/Обращений пока нет/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Закрыть обратную связь' }).click();
  await logout(page);

  await enter(page, 'ui.stp_manager');
  await expect(page.getByRole('button', { name: 'Обратная связь', exact: true })).toHaveCount(0);
});

test('телефон: кнопка «Обратная связь» на экране «Профиль»', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enter(page, 'ui.sales');
  await page.getByRole('tab', { name: 'Профиль', exact: true }).click();
  const profile = page.getByRole('region', { name: 'Профиль' });
  await profile.getByRole('button', { name: 'Обратная связь', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Обратная связь' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('radio', { name: /Предложение/ }).check();
  await dialog.getByLabel('Что случилось или что предлагаете').fill('Добавьте в КП срок монтажа');
  await shot(page, '06-phone-feedback-form.png');
  const box = await dialog.boundingBox();
  expect(box && box.width).toBeLessThanOrEqual(390);
  await dialog.getByRole('button', { name: 'Отправить', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('Обращение отправлено');
  await dialog.getByRole('tab', { name: 'Мои обращения' }).click();
  await expect(dialog.getByTestId('feedback-card')).toContainText('Предложение');
  await shot(page, '07-phone-my-feedback.png');
});

test('телефон: админ StP удаляет обращение с фото после подтверждения', async ({ page, request }) => {
  const login = await request.post(`${API}/auth/login`, { data: { login: 'ui.crew', password } });
  const { token } = (await login.json()) as { token: string };
  const res = await request.post(`${API}/feedback`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { type: 'bug', text: 'Тестовое обращение, удалить' },
  });
  expect(res.ok(), await res.text()).toBeTruthy();

  await page.setViewportSize({ width: 390, height: 844 });
  await enter(page, 'ui.admin');
  await page.getByRole('tab', { name: /Обратная связь/ }).click();
  const panel = page.getByRole('region', { name: 'Обратная связь' });
  const card = panel.getByTestId('feedback-card');
  await expect(card).toHaveCount(1);
  const remove = card.getByRole('button', { name: 'Удалить', exact: true });
  await expect(remove).toBeVisible();
  const box = await remove.boundingBox();
  expect(box && box.x + box.width).toBeLessThanOrEqual(390);

  // Отмена ничего не удаляет.
  await remove.click();
  const confirm = page.getByRole('alertdialog', { name: 'Удалить обращение?' });
  await expect(confirm).toBeVisible();
  await shot(page, '07-phone-admin-delete-confirm.png');
  await confirm.getByRole('button', { name: 'Отмена' }).click();
  await expect(confirm).toHaveCount(0);
  await expect(card).toHaveCount(1);

  await remove.click();
  await page.getByRole('alertdialog', { name: 'Удалить обращение?' }).getByRole('button', { name: 'Удалить', exact: true }).click();
  await expect(card).toHaveCount(0);
  await expect(panel.getByText('Обращений с такими условиями нет.')).toBeVisible();
  await page.reload();
  await page.getByRole('tab', { name: /Обратная связь/ }).click();
  await expect(page.getByRole('region', { name: 'Обратная связь' }).getByTestId('feedback-card')).toHaveCount(0);
});
