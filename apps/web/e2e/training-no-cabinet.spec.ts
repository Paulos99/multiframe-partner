import { test, expect, type Page } from '@playwright/test';

const password = 'ui-fixture-password-only';
const roles = ['admin', 'owner', 'sales', 'measurer', 'crew'] as const;

test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:4681/__reset');
});

async function openTraining(page: Page) {
  const entry = page
    .getByRole('tab', { name: 'Обучение', exact: true })
    .or(page.getByRole('button', { name: 'Обучение', exact: true }));
  await entry.first().click();
  await expect(page.getByRole('heading', { level: 2, name: 'Обучение' })).toBeVisible();
}

async function expectNoCabinetSection(page: Page) {
  await expect(page.getByRole('tablist', { name: 'Разделы обучения' })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Кабинет', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 3, name: /^Ваша работа/ })).toHaveCount(0);
  await expect(page.getByText('С чего начать', { exact: true })).toHaveCount(0);
  // Материалы остались на месте.
  await expect(page.getByText('Инструкции и презентации по продукту.')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Папки' })).toBeVisible();
}

for (const role of roles) {
  test(`${role}: в «Обучении» нет раздела «Кабинет», материалы открываются сразу`, async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Логин', { exact: true }).fill(`ui.${role}`);
    await page.getByLabel('Пароль', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Войти', exact: true }).click();
    await expect(page.getByRole('complementary', { name: 'Разделы кабинета' })).toBeVisible();
    await openTraining(page);
    await expectNoCabinetSection(page);
  });
}

test('демо: в «Обучении» нет раздела «Кабинет»', async ({ page }) => {
  await page.goto('/?demo=1');
  await page.getByRole('region', { name: 'Потолки Столицы', exact: true }).getByRole('button', { name: /Прайс и команда/ }).click();
  await openTraining(page);
  await expectNoCabinetSection(page);
});
