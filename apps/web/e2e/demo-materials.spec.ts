import { test, expect, type Page } from '@playwright/test';
import { demoSignIn, type DemoRole } from './demo-login';

const SHOTS = process.env.DEMO_SHOTS_DIR || '';

test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:4181/__reset');
});

async function enterDemo(page: Page, role: DemoRole) {
  await demoSignIn(page, role);
  const entry = page
    .getByRole('tab', { name: 'Обучение', exact: true })
    .or(page.getByRole('button', { name: 'Обучение', exact: true }));
  await entry.first().click();
  await expect(page.getByRole('heading', { level: 2, name: 'Обучение' })).toBeVisible();
}

async function expectDemoMaterials(page: Page) {
  await expect(page.getByText('Инструкции и презентации по продукту.')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Папки' })).toBeVisible();
  // Список настоящий, без красной плашки, без «пусто» и без вечного подсчёта размера.
  await expect(page.locator('[data-material-id]').first()).toBeVisible();
  await expect(page.getByText('Пока пусто', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Вход без связи с сервером')).toHaveCount(0);
  await expect(page.getByText('Войдите заново')).toHaveCount(0);
  await expect(page.getByText('Считаем размер')).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByTestId('materials-relogin')).toHaveCount(0);
}

test('демо, Менеджер StP: «Материалы» открываются без сервера, плашки «войдите заново» нет', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enterDemo(page, 'stp_manager');
  await expectDemoMaterials(page);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/demo-stp-manager-materials-390.png` });
  await page.getByRole('tab', { name: 'Тренажёр', exact: true }).click();
  const home = page.getByRole('region', { name: 'Тренажёр продаж' });
  await expect(home).toBeVisible();
  await expect(home).toContainText('Быстрая отработка');
  await page.getByRole('tab', { name: 'Материалы', exact: true }).click();
  await expectDemoMaterials(page);
});

test('демо, Админ StP и роли «Потолков Столицы»: материалы без плашки', async ({ page }) => {
  await enterDemo(page, 'admin');
  await expectDemoMaterials(page);
  await page.evaluate(() => localStorage.clear());
  await enterDemo(page, 'owner');
  await expectDemoMaterials(page);
});
