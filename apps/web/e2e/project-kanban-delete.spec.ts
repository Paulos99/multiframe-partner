import { expect, test, type Page } from '@playwright/test';

const password = 'ui-fixture-password-only';

test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:4181/__reset');
});

async function enter(page: Page, role: string, board = true) {
  await page.goto('/');
  await page.getByLabel('Логин', { exact: true }).fill(`ui.${role}`);
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await page.getByRole('tab', { name: 'Проекты', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Проекты', exact: true })).toBeVisible();
  if (!board) return;
  await page.getByRole('button', { name: 'Канбан', exact: true }).click();
  await expect(page.locator('[data-project-stage]')).toHaveCount(5);
}

const menuButton = (page: Page) => page.getByRole('button', { name: 'Действия с проектом «Тестовая квартира»', exact: true });

for (const role of ['owner', 'sales']) {
  test(`${role}: проект удаляется прямо с доски через «…», без перезагрузки`, async ({ page }) => {
    await enter(page, role);
    const card = page.locator('[data-project-id="ui_project"]');
    await expect(card).toBeVisible();
    await menuButton(page).click();
    // Кнопка не открыла проект.
    await expect(page).not.toHaveURL(/#project\//);
    await page.getByRole('menuitem', { name: 'Удалить проект…' }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText('Удалить проект «Тестовая квартира»?');
    await expect(dialog).toContainText('3 комнаты');
    await expect(dialog).toContainText('нельзя отменить');
    // Окно по центру экрана, не боковая панель.
    const view = page.viewportSize()!;
    await expect
      .poll(async () => {
        const box = await dialog.boundingBox();
        return box ? Math.abs(box.x + box.width / 2 - view.width / 2) + Math.abs(box.y + box.height / 2 - view.height / 2) : 999;
      })
      .toBeLessThan(40);

    await dialog.getByRole('button', { name: 'Отмена' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(card).toBeVisible();
    await expect(page).not.toHaveURL(/#project\//);

    await menuButton(page).click();
    await page.getByRole('menuitem', { name: 'Удалить проект…' }).click();
    const del = page.waitForRequest((r) => r.method() === 'DELETE' && new URL(r.url()).pathname === '/projects/ui_project');
    await page.getByRole('alertdialog').getByRole('button', { name: 'Удалить проект', exact: true }).click();
    await del;
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(card).toHaveCount(0);
    await expect(page.getByRole('status').filter({ hasText: 'Проект удалён' })).toBeVisible();
    await expect(page).not.toHaveURL(/#project\//);

    await page.reload();
    await page.getByRole('tab', { name: 'Проекты', exact: true }).click();
    await page.getByRole('button', { name: 'Канбан', exact: true }).click();
    await expect(page.locator('[data-project-id="ui_project"]')).toHaveCount(0);
  });
}

test('правый щелчок по карточке открывает то же меню, а щелчок по карточке по-прежнему открывает проект', async ({ page }) => {
  await enter(page, 'owner');
  await page.locator('[data-project-id="ui_project"]').click({ button: 'right' });
  await expect(page.getByRole('menu', { name: 'Действия с проектом «Тестовая квартира»' })).toBeVisible();
  await expect(page).not.toHaveURL(/#project\//);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await page.locator('[data-project-id="ui_project"]').click();
  await expect(page).toHaveURL(/#project\/ui_project\/overview$/);
});

test('перенос мышью за «…» карточку не двигает и не открывает', async ({ page }) => {
  await enter(page, 'owner');
  const button = menuButton(page);
  const a = await button.boundingBox();
  const b = await page.locator('[data-project-stage="measure"]').boundingBox();
  await page.mouse.move(a!.x + a!.width / 2, a!.y + a!.height / 2);
  await page.mouse.down();
  await page.mouse.move(b!.x + b!.width / 2, b!.y + 90, { steps: 12 });
  await page.mouse.up();
  await expect(page.locator('[data-project-stage="install"] [data-project-id="ui_project"]')).toBeVisible();
  await expect(page.locator('[data-project-stage="measure"] [data-project-id="ui_project"]')).toHaveCount(0);
  await expect(page).not.toHaveURL(/#project\//);
});

test('у замерщика доски и удаления проекта нет', async ({ page }) => {
  await enter(page, 'owner');
  await page.locator('[data-project-id="ui_project"]').click();
  await page.getByRole('region', { name: 'Проект' }).getByRole('button', { name: 'Настройки проекта', exact: true }).click();
  await page.getByRole('combobox', { name: 'Замерщик', exact: true }).selectOption('ui_measurer');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Сохранить', exact: true })).toBeEnabled();
  await page.getByRole('region', { name: 'Проект' }).getByRole('tab', { name: 'Рабочая информация', exact: true }).click();
  await page.getByRole('region', { name: 'Проект' }).getByRole('button', { name: 'Кухня' }).click();
  await page.getByRole('region', { name: 'Комната' }).getByLabel('Исполнитель').selectOption('ui_measurer');
  await expect(page.getByRole('status').filter({ hasText: 'Сохранено' })).toBeVisible();
  await page.getByRole('button', { name: 'Выйти', exact: true }).click();

  await enter(page, 'measurer', false);
  const card = page.locator('[data-project-id="ui_project"]');
  await expect(card).toBeVisible();
  await expect(page.getByRole('button', { name: 'Канбан', exact: true })).toHaveCount(0);
  await expect(page.locator('[data-project-stage]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Действия с проектом/ })).toHaveCount(0);
  await card.click({ button: 'right' });
  await expect(page.getByRole('menu')).toHaveCount(0);
});

test('демо: удаление с доски сохраняется после перезагрузки', async ({ page }) => {
  await page.goto('/?demo=1');
  await page.getByRole('region', { name: 'Потолки Столицы', exact: true }).getByRole('button', { name: /Прайс и команда/ }).click();
  await page.getByRole('tab', { name: 'Проекты', exact: true }).click();
  await page.getByRole('button', { name: 'Канбан', exact: true }).click();
  const card = page.locator('[data-project-stage="new"] [data-project-id]', { hasText: 'Чернов А.' });
  const id = await card.getAttribute('data-project-id');
  expect(id).toBeTruthy();
  await page.getByRole('button', { name: 'Действия с проектом «Чернов А.»', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Удалить проект…' }).click();
  await expect(page.getByRole('alertdialog')).toContainText('Вместе с проектом удалятся все его комнаты');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Удалить проект', exact: true }).click();
  await expect(page.locator(`[data-project-id="${id}"]`)).toHaveCount(0);
  await page.reload();
  await page.getByRole('tab', { name: 'Проекты', exact: true }).click();
  await page.getByRole('button', { name: 'Канбан', exact: true }).click();
  await expect(page.locator(`[data-project-id="${id}"]`)).toHaveCount(0);
  await expect(page.getByText('Чернов А.')).toHaveCount(0);
});
