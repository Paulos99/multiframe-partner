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
  await expect(page.getByRole('region', { name: 'Сегодня', exact: true })).toBeVisible();
}

test('«Сегодня» напоминает пройти занятие и ведёт в тренажёр', async ({ page }) => {
  await enter(page, 'sales');
  const block = page.getByTestId('today-training');
  await expect(block).toBeVisible({ timeout: 30000 });
  await expect(block.getByText('Нужно пройти занятие в тренажёре')).toBeVisible();
  await expect(block.getByRole('button', { name: 'Перейти к занятию' })).toBeVisible();
  // Название самого занятия на «Сегодня» не показываем.
  await expect(block.getByText('Ролевой разговор')).toHaveCount(0);
  await expect(block.getByText('Отработка возражения')).toHaveCount(0);

  await block.getByRole('button', { name: 'Перейти к занятию' }).click();
  await expect(page).toHaveURL(/#trainer\//);
  await expect(page.getByRole('tab', { name: 'Тренажёр', exact: true })).toHaveAttribute('aria-selected', 'true');
});

test('у владельца напоминание на «Сегодня» есть', async ({ page }) => {
  await enter(page, 'owner');
  const block = page.getByTestId('today-training');
  await expect(block).toBeVisible({ timeout: 30000 });
  await expect(block.getByRole('button', { name: 'Перейти к занятию' })).toBeVisible();
});

test('у замерщика напоминание на «Сегодня» есть', async ({ page }) => {
  await enter(page, 'measurer');
  const block = page.getByTestId('today-training');
  await expect(block).toBeVisible({ timeout: 30000 });
  await expect(block.getByRole('button', { name: 'Перейти к занятию' })).toBeVisible();
});
