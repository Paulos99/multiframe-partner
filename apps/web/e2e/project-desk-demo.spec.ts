import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const shots = '/opt/cursor/artifacts/project-desk-demo';
mkdirSync(shots, { recursive: true });

async function enterCapital(page: Page, role: 'Владелец' | 'Монтажник') {
  await page.goto('/?demo=1');
  const capital = page.getByRole('region', { name: 'Потолки Столицы', exact: true });
  const hint = role === 'Владелец' ? /Прайс и команда/ : /Задания на монтаж/;
  await capital.getByRole('button', { name: hint }).click();
  await page.getByRole('tab', { name: 'Проекты', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Проекты', exact: true })).toBeVisible();
}

test('демо ?demo=1 группирует комнаты и открывает все вкладки', async ({ page }) => {
  await enterCapital(page, 'Владелец');
  const desk = page.getByRole('region', { name: 'Список проектов' });
  await expect(desk.getByText('Пока нет проектов')).toHaveCount(0);
  await expect(desk.locator('[data-project-id]')).toHaveCount(11);

  await page.evaluate(() => {
    const key = 'mf_partner_db_v5';
    const db = JSON.parse(localStorage.getItem(key) || '{}') as {
      projects?: unknown[];
      objects?: Array<Record<string, unknown>>;
    };
    db.projects = [];
    for (const object of db.objects || []) delete object.projectId;
    localStorage.setItem(key, JSON.stringify(db));
  });
  await page.reload();
  await page.getByRole('tab', { name: 'Проекты', exact: true }).click();
  await expect(desk.getByText('Пока нет проектов')).toHaveCount(0);
  await expect(desk.locator('[data-project-id]')).toHaveCount(11);
  await expect(page.getByText('Потолки Столицы').first()).toBeVisible();
  await expect(page.getByText('Комнаты по стадиям')).toHaveCount(0);
  await expect(page.locator('[aria-label="Доска проектов"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Фильтры' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Сортировка/ })).toHaveCount(0);

  await page.screenshot({ path: `${shots}/01-list.png` });
  await desk.getByRole('button', { name: 'Канбан', exact: true }).click();
  await expect(desk.locator('[data-project-stage="done"] [data-project-id]').first()).toBeVisible();
  await page.screenshot({ path: `${shots}/02-kanban.png` });
  await desk.getByRole('button', { name: 'Список', exact: true }).click();

  await desk.getByRole('button', { name: 'Иванова А.', exact: true }).click();
  const card = page.getByRole('dialog', { name: 'Карточка проекта' });
  await expect(card).toBeVisible();
  const tabs = ['Обзор', 'Рабочая информация', 'Команда', 'Задачи', 'Отчёты', 'Документы', 'Настройки'] as const;
  for (const [index, name] of tabs.entries()) {
    await card.getByRole('tab', { name, exact: true }).click();
    await expect(card.getByRole('tab', { name, exact: true })).toHaveAttribute('aria-selected', 'true');
    await card.screenshot({ path: `${shots}/03-tab-${index + 1}-${name}.png` });
  }

  await card.getByRole('tab', { name: 'Команда', exact: true }).click();
  await expect(card.getByText('Монтажник · Потолки Столицы')).toBeVisible();
  await card.getByRole('tab', { name: 'Рабочая информация', exact: true }).click();
  await card.getByRole('button', { name: /Гостиная/ }).click();
  const room = page.getByRole('dialog', { name: 'Комната' });
  await expect(room).toBeVisible();
  await room.screenshot({ path: `${shots}/04-room.png` });
  await page.keyboard.press('Escape');
  await expect(room).toHaveCount(0);
  await expect(card).toBeVisible();

  await card.getByRole('button', { name: 'Настройки проекта', exact: true }).click();
  await expect(card.getByRole('tab', { name: 'Настройки', exact: true })).toHaveAttribute('aria-selected', 'true');
  await card.getByLabel('Описание', { exact: true }).fill('Демо: тихая квартира');
  const save = card.getByRole('button', { name: 'Сохранить', exact: true });
  await save.evaluate((el) => el.scrollIntoView({ block: 'end', inline: 'nearest' }));
  await save.click();
  await expect(page.getByRole('status').filter({ hasText: 'Сохранено' })).toBeVisible();
  await card.screenshot({ path: `${shots}/05-settings.png` });
  const overview = card.getByRole('tab', { name: 'Обзор', exact: true });
  const box = await overview.boundingBox();
  if (!box) throw new Error('вкладка Обзор не видна');
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await expect
    .poll(() =>
      page.evaluate(
        ({ x, y }) => document.elementFromPoint(x, y)?.closest('[role="tab"]')?.textContent?.trim() ?? '',
        point,
      ),
    )
    .toBe('Обзор');
  await page.mouse.click(point.x, point.y);
  await expect(overview).toHaveAttribute('aria-selected', 'true');
  await expect(card.getByText('Демо: тихая квартира')).toBeVisible();
  await card.screenshot({ path: `${shots}/06-overview.png` });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${shots}/07-mobile.png` });
});

test('демо-бригада не видит суммы', async ({ page }) => {
  await enterCapital(page, 'Монтажник');
  const desk = page.getByRole('region', { name: 'Список проектов' });
  await expect(desk.getByText('Пока нет проектов')).toHaveCount(0);
  await expect(desk.getByRole('columnheader', { name: 'Сумма' })).toHaveCount(0);
  await desk.getByRole('button', { name: 'Иванова А.', exact: true }).click();
  const card = page.getByRole('dialog', { name: 'Карточка проекта' });
  await expect(card).toBeVisible();
  await expect(card).not.toContainText('₽');
  await expect(card.getByText('Сумма', { exact: true })).toHaveCount(0);
  await card.getByRole('tab', { name: 'Настройки', exact: true }).click();
  await expect(card.getByRole('button', { name: 'Сохранить', exact: true })).toHaveCount(0);
});
