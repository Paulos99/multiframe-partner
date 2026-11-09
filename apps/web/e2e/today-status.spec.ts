import { expect, test, type Page } from '@playwright/test';
import { demoSignIn } from './demo-login';

const password = 'ui-fixture-password-only';

test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:4181/__reset');
});

async function drag(page: Page, id: string, stage: string) {
  const from = page.locator(`[data-project-id="${id}"]`);
  await from.scrollIntoViewIfNeeded();
  const a = await from.boundingBox();
  const b = await page.locator(`[data-project-stage="${stage}"]`).boundingBox();
  if (!a || !b) throw new Error('нет координат');
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 12, a.y + a.height / 2 + 4, { steps: 3 });
  await page.mouse.move(b.x + b.width / 2, b.y + 90, { steps: 12 });
  await page.mouse.up();
}

/** У владельца/менеджера ближайшие комнаты сгруппированы по стадии проекта. */
async function expandStage(today: ReturnType<Page['getByRole']>, label: RegExp) {
  const group = today.getByRole('button', { name: label }).first();
  await expect(group).toBeVisible();
  if ((await group.getAttribute('aria-expanded')) !== 'true') {
    await group.click();
  }
  return group;
}

test('«Сегодня» показывает стадию проекта с доски и после перезагрузки', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Логин', { exact: true }).fill('ui.owner');
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  const today = page.getByRole('region', { name: 'Сегодня' });
  await expect(today).toBeVisible();
  // Без сохранённой стадии: группа «Монтаж» с комнатами проекта.
  await expandStage(today, /^Монтаж/);
  await expect(today.getByRole('button', { name: /Спальня/ })).toBeVisible();
  await expect(today).not.toContainText('Черновик');

  await page.getByRole('tab', { name: 'Проекты', exact: true }).click();
  await page.getByRole('button', { name: 'Канбан', exact: true }).click();
  await drag(page, 'ui_project', 'measure');
  await expect(page.locator('[data-project-stage="measure"] [data-project-id="ui_project"]')).toBeVisible();

  await page.reload();
  await page.getByRole('tab', { name: 'Сегодня', exact: true }).click();
  const after = page.getByRole('region', { name: 'Сегодня' });
  await expandStage(after, /^Замер/);
  for (const room of ['Спальня', 'Гостиная', 'Кухня']) {
    await expect(after.getByRole('button', { name: new RegExp(room) })).toBeVisible();
  }
  await expect(after).not.toContainText('Черновик');
  // Группа «Монтаж» после переноса должна исчезнуть.
  await expect(after.getByRole('button', { name: /^Монтаж/ })).toHaveCount(0);
});

test('демо: «Чернов А.» после переноса в «Замер» и перезагрузки так же в «Сегодня»', async ({ page }) => {
  await demoSignIn(page, 'owner');
  await page.getByRole('tab', { name: 'Проекты', exact: true }).click();
  await page.getByRole('button', { name: 'Канбан', exact: true }).click();
  const card = page.locator('[data-project-stage="new"] [data-project-id]', { hasText: 'Чернов А.' });
  const id = await card.getAttribute('data-project-id');
  expect(id).toBeTruthy();
  await drag(page, id!, 'measure');
  await expect(page.locator(`[data-project-stage="measure"] [data-project-id="${id}"]`)).toBeVisible();

  await page.reload();
  await page.getByRole('tab', { name: 'Сегодня', exact: true }).click();
  const today = page.getByRole('region', { name: 'Сегодня' });
  await expandStage(today, /^Замер/);
  const entries = today.getByRole('button', { name: /Чернов/ });
  await expect(entries.first()).toBeVisible();
  await page.getByRole('tab', { name: 'Проекты', exact: true }).click();
  await expect(page.locator(`[data-project-stage="measure"] [data-project-id="${id}"]`)).toBeVisible();
});
