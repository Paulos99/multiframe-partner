import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const shots = '/workspace/review-fixes-shots';
mkdirSync(shots, { recursive: true });

type Role = 'manager' | 'owner';

async function enter(page: Page, role: Role = 'manager') {
  await page.goto('/?demo=1');
  const capital = page.getByRole('region', { name: 'Потолки Столицы', exact: true });
  await capital.getByRole('button', { name: role === 'manager' ? /Проекты и КП/ : /Прайс и команда/ }).click();
  await page.getByRole('tab', { name: 'Проекты', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Проекты', exact: true })).toBeVisible();
}

async function openProject(page: Page, name: string) {
  await page.getByRole('region', { name: 'Список проектов' }).getByRole('button', { name, exact: true }).click();
  const card = page.getByRole('region', { name: 'Проект' });
  await expect(card).toBeVisible();
  return card;
}

async function shot(page: Page, name: string) {
  const size = page.viewportSize();
  const kind = size && size.width < 600 ? 'phone' : 'desktop';
  await page.screenshot({ path: `${shots}/${name}-${kind}.png`, fullPage: false });
}

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
]) {
  const tag = viewport.width < 600 ? 'телефон' : 'компьютер';

  test(`вкладка «Комнаты» и исполнители на «Монтаже» (${tag})`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await enter(page);
    const card = await openProject(page, 'Фёдорова О.');
    await expect(card.getByRole('tab', { name: 'Рабочая информация' })).toHaveCount(0);
    await card.getByRole('tab', { name: 'Комнаты', exact: true }).click();
    await expect(card.getByRole('tab', { name: 'Комнаты', exact: true })).toHaveAttribute('aria-selected', 'true');
    await shot(page, 'item6-tab-komnaty');

    await card.locator('button[class*="roomBtn"]').first().click();
    const room = page.getByRole('region', { name: 'Комната' });
    await expect(room).toBeVisible();
    // замер: исполнитель — замерщик
    const select = room.locator('select[data-stale], select').filter({ hasText: 'Не назначен' }).last();
    await expect(select).toContainText('Игорь Лебедев');

    await room.getByRole('group', { name: 'Сменить статус' }).getByRole('button', { name: 'Монтаж', exact: true }).click();
    const picker = room.locator('label', { hasText: 'Исполнитель' }).locator('select');
    await expect(picker).toBeVisible();
    const options = await picker.locator('option').allTextContents();
    expect(options.join('|')).toContain('Павел Орлов');
    expect(options.join('|')).toContain('Дмитрий Волков');
    expect(options.join('|')).not.toContain('Игорь Лебедев');
    expect(options.join('|')).not.toContain('Елена Крылова');
    await expect(room).toContainText('На монтаже в списке только монтажники');
    await picker.scrollIntoViewIfNeeded();
    await shot(page, 'item1-executor-picker');
  });

  test(`закрытие комнаты: «Завершён» и «Отказ» с причиной (${tag})`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await enter(page);
    const card = await openProject(page, 'Сидорова М.');
    await card.getByRole('tab', { name: 'Комнаты', exact: true }).click();
    await card.locator('button[class*="roomBtn"]').first().click();
    const room = page.getByRole('region', { name: 'Комната' });
    await room.getByRole('group', { name: 'Сменить статус' }).getByRole('button', { name: 'Завершён', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: /Закрыть комнату/ });
    await expect(dialog).toBeVisible();
    await shot(page, 'item2-close-dialog');
    await dialog.getByRole('radio', { name: /Отказ/ }).check();
    await dialog.getByRole('button', { name: 'Закрыть с отказом' }).click();
    await expect(dialog.getByRole('alert')).toContainText('Выберите причину отказа');
    await dialog.getByLabel('Причина отказа').selectOption({ label: '«Дорого»' });
    await shot(page, 'item2-close-dialog-reason');
    await dialog.getByRole('button', { name: 'Закрыть с отказом' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(room.locator('[data-outcome="refused"]')).toContainText('Отказ: «Дорого»'.replace(/[«»]/g, ''), { ignoreCase: true });
    await room.scrollIntoViewIfNeeded();
    await shot(page, 'item2-room-refused');
  });

  test(`закрытие проекта в настройках и «Отказ» в канбане (${tag})`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await enter(page, 'owner');
    const card = await openProject(page, 'Громов П.');
    await card.getByRole('button', { name: 'Настройки проекта', exact: true }).click();
    await card.locator('label').filter({ hasText: /^\s*Статус/ }).locator('select').selectOption('done');
    await expect(card.locator('[data-close-outcome]')).toBeVisible();
    await card.getByRole('radio', { name: /Отказ/ }).check();
    await card.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await expect(card.getByRole('alert')).toContainText('Выберите причину отказа');
    await card.getByLabel('Причина отказа').selectOption({ label: '«Шум не мешает / не нужно»' });
    await card.locator('[data-close-outcome]').scrollIntoViewIfNeeded();
    await shot(page, 'item2-project-settings-refusal');
    const save = card.getByRole('button', { name: 'Сохранить', exact: true });
    await save.evaluate((el) => el.scrollIntoView({ block: 'end', inline: 'nearest' }));
    await save.click();
    await expect(page.getByRole('status').filter({ hasText: 'Сохранено' })).toBeVisible();
    await card.getByRole('tab', { name: 'Обзор', exact: true }).click();
    await expect(card.locator('[data-outcome="refused"]').first()).toContainText('Отказ');
    await shot(page, 'item2-project-overview-refused');

    await page.reload();
    await page.getByRole('tab', { name: 'Проекты', exact: true }).click();
    const desk = page.getByRole('region', { name: 'Список проектов' });
    await expect(desk.getByRole('button', { name: 'Громов П.', exact: true })).toBeVisible();
    await desk.getByRole('button', { name: 'Канбан', exact: true }).click();
    const board = desk.locator('[data-project-stage="done"]');
    await expect(board.locator('[data-outcome="refused"]').first()).toContainText('Отказ');
    await expect(board.locator('[data-outcome="completed"]').first()).toContainText('Завершён');
    await shot(page, 'item2-kanban');
  });

  test(`телефон клиента: нет на «Новый», есть с «Замера» (${tag})`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await enter(page);
    // «Новый»: проект Чернов А. — черновик
    let card = await openProject(page, 'Чернов А.');
    await card.getByRole('button', { name: 'Настройки проекта', exact: true }).click();
    await expect(card.getByLabel('Телефон клиента (необязательно)')).toHaveCount(0);
    await expect(card.locator('[data-phone-hint]')).toContainText('появится на стадии «Замер»');
    await shot(page, 'item5-phone-hidden-new');

    // «Замер»
    await page.reload();
    await page.getByRole('tab', { name: 'Проекты', exact: true }).click();
    card = await openProject(page, 'Громов П.');
    await card.getByRole('button', { name: 'Настройки проекта', exact: true }).click();
    const phone = card.getByLabel('Телефон клиента (необязательно)');
    await expect(phone).toBeVisible();
    await expect(phone).toHaveAttribute('inputmode', 'tel');
    await phone.fill('+7 900 123-45-67');
    const save = card.getByRole('button', { name: 'Сохранить', exact: true });
    await save.evaluate((el) => el.scrollIntoView({ block: 'end', inline: 'nearest' }));
    await save.click();
    await expect(page.getByRole('status').filter({ hasText: 'Сохранено' })).toBeVisible();
    await phone.scrollIntoViewIfNeeded();
    await shot(page, 'item5-phone-field-measure');
    await card.getByRole('tab', { name: 'Обзор', exact: true }).click();
    await expect(card.locator('[data-client-phone] a')).toHaveAttribute('href', /^tel:\+?7900/);
    await shot(page, 'item5-phone-overview');
  });
  test(`аналитика считает отказы и причины (${tag})`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await enter(page, 'owner');
    const card = await openProject(page, 'Сидорова М.');
    await card.getByRole('tab', { name: 'Комнаты', exact: true }).click();
    await card.locator('button[class*="roomBtn"]').first().click();
    const room = page.getByRole('region', { name: 'Комната' });
    await room.getByRole('group', { name: 'Сменить статус' }).getByRole('button', { name: 'Завершён', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: /Закрыть комнату/ });
    await dialog.getByRole('radio', { name: /Отказ/ }).check();
    await dialog.getByLabel('Причина отказа').selectOption({ label: '«Дорого»' });
    await dialog.getByRole('button', { name: 'Закрыть с отказом' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(room.locator('[data-outcome="refused"]')).toBeVisible();
    await page.reload();
    await page.getByRole('tab', { name: 'Аналитика', exact: true }).click();
    await page.getByRole('tab', { name: 'Комнаты', exact: true }).click();
    const block = page.locator('[data-refusals]');
    await expect(block).toContainText('Отказы клиентов: 1');
    await expect(block).toContainText('Дорого');
    await block.scrollIntoViewIfNeeded();
    await shot(page, 'item2-analytics-refusals');
  });
}
