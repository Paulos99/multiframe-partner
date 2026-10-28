import { expect, test, type Locator, type Page } from '@playwright/test';

const password = 'ui-fixture-password-only';

test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:4181/__reset');
});

async function enter(page: Page, role: string) {
  await page.goto('/');
  await page.getByLabel('Логин', { exact: true }).fill(`ui.${role}`);
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await page.getByRole('tab', { name: 'Проекты', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Проекты', exact: true })).toBeVisible();
}

async function openBoard(page: Page) {
  await page.getByRole('button', { name: 'Канбан', exact: true }).click();
  await expect(page.locator('[data-project-stage]')).toHaveCount(5);
}

/** Настоящий жест мышью: нажать, несколько шагов движения, отпустить. Без клавиатуры и dispatchEvent. */
async function drag(page: Page, from: Locator, to: Locator, steps = 12) {
  await from.scrollIntoViewIfNeeded();
  const a = await from.boundingBox();
  const b = await to.boundingBox();
  if (!a || !b) throw new Error('нет координат для переноса');
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  if (steps > 1) await page.mouse.move(a.x + a.width / 2 + 12, a.y + a.height / 2 + 4, { steps: 3 });
  await page.mouse.move(b.x + b.width / 2, b.y + 90, { steps });
  await page.mouse.up();
}

for (const role of ['owner', 'sales']) {
  test(`${role}: карточку проекта можно перетащить на другую стадию, она сохраняется`, async ({ page }) => {
    await enter(page, role);
    await openBoard(page);
    const card = page.locator('[data-project-id="ui_project"]');
    await expect(page.locator('[data-project-stage="install"] [data-project-id="ui_project"]')).toBeVisible();

    await drag(page, card, page.locator('[data-project-stage="proposal"]'));
    await expect(page.locator('[data-project-stage="proposal"] [data-project-id="ui_project"]')).toBeVisible();
    await expect(page.locator('[data-project-stage="install"] [data-project-id="ui_project"]')).toHaveCount(0);
    // Перенос не открыл страницу проекта.
    await expect(page).not.toHaveURL(/#project\//);
    await expect(page.getByRole('alert')).toHaveCount(0);

    await page.reload();
    await page.getByRole('tab', { name: 'Проекты', exact: true }).click();
    await expect(page.locator('[data-project-stage="proposal"] [data-project-id="ui_project"]')).toBeVisible();
    await expect(page.locator('[data-project-stage="install"] [data-project-id="ui_project"]')).toHaveCount(0);

    // Обычный щелчок по-прежнему открывает страницу проекта.
    await page.locator('[data-project-id="ui_project"]').click();
    await expect(page).toHaveURL(/#project\/ui_project\/overview$/);
    await expect(page.getByRole('region', { name: 'Проект' }).getByRole('heading', { level: 1, name: 'Тестовая квартира' })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
}

for (const [name, steps] of [['быстрый жест в один прыжок', 1], ['медленный жест мелкими шагами', 60]] as const) {
  test(`мышь: ${name}`, async ({ page }) => {
    await enter(page, 'owner');
    await openBoard(page);
    const card = page.locator('[data-project-id="ui_project"]');
    await drag(page, card, page.locator('[data-project-stage="proposal"]'), steps);
    await expect(page.locator('[data-project-stage="proposal"] [data-project-id="ui_project"]')).toBeVisible();
    await expect(page).not.toHaveURL(/#project\//);
    await expect(page.getByRole('alert')).toHaveCount(0);
    // Выделения текста нет, а следующий перенос работает.
    expect(await page.evaluate(() => String(getSelection()))).toBe('');
    await drag(page, page.locator('[data-project-id="ui_project"]'), page.locator('[data-project-stage="measure"]'), steps);
    await expect(page.locator('[data-project-stage="measure"] [data-project-id="ui_project"]')).toBeVisible();
    await page.reload();
    await page.getByRole('tab', { name: 'Проекты', exact: true }).click();
    await expect(page.locator('[data-project-stage="measure"] [data-project-id="ui_project"]')).toBeVisible();
  });
}

test('перенос с клавиатуры: Alt и стрелка', async ({ page }) => {
  await enter(page, 'owner');
  await openBoard(page);
  const card = page.locator('[data-project-id="ui_project"]');
  await card.focus();
  await page.keyboard.press('Alt+ArrowLeft');
  await expect(page.locator('[data-project-stage="proposal"] [data-project-id="ui_project"]')).toBeVisible();
  await expect(page.locator('[data-project-stage] [data-project-id="ui_project"]')).toHaveCount(1);
  await page.reload();
  await page.getByRole('tab', { name: 'Проекты', exact: true }).click();
  await expect(page.locator('[data-project-stage="proposal"] [data-project-id="ui_project"]')).toBeVisible();
});

test('у замерщика доски нет, проект не переносится', async ({ page }) => {
  await enter(page, 'owner');
  await page.locator('[data-project-id="ui_project"], button:has-text("Тестовая квартира")').first().click();
  await page.getByRole('region', { name: 'Проект' }).getByRole('button', { name: 'Настройки проекта', exact: true }).click();
  await page.getByRole('combobox', { name: 'Замерщик', exact: true }).selectOption('ui_measurer');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Сохранить', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Выйти', exact: true }).click();

  await enter(page, 'measurer');
  await expect(page.getByRole('button', { name: 'Канбан', exact: true })).toHaveCount(0);
  await expect(page.locator('[data-project-stage]')).toHaveCount(0);
  await expect(page.locator('[data-project-id="ui_project"]')).not.toHaveAttribute('aria-roledescription', /.+/);
});

test('демо: перенос сохраняется после перезагрузки', async ({ page }) => {
  await page.goto('/?demo=1');
  const capital = page.getByRole('region', { name: 'Потолки Столицы', exact: true });
  await capital.getByRole('button', { name: /Прайс и команда/ }).click();
  await page.getByRole('tab', { name: 'Проекты', exact: true }).click();
  await openBoard(page);
  const first = page.locator('[data-project-stage="new"] [data-project-id]').first();
  await expect(first).toBeVisible();
  const id = await first.getAttribute('data-project-id');
  expect(id).toBeTruthy();
  const card = page.locator(`[data-project-id="${id}"]`);
  await drag(page, card, page.locator('[data-project-stage="measure"]'));
  await expect(page.locator(`[data-project-stage="measure"] [data-project-id="${id}"]`)).toBeVisible();

  await page.reload();
  await page.getByRole('tab', { name: 'Проекты', exact: true }).click();
  await expect(page.locator(`[data-project-stage="measure"] [data-project-id="${id}"]`)).toBeVisible();
  await expect(page.locator(`[data-project-stage="new"] [data-project-id="${id}"]`)).toHaveCount(0);
});

test.describe('телефон', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test('карточку можно перенести долгим касанием, а короткое касание открывает проект', async ({ page }) => {
    await enter(page, 'owner');
    await openBoard(page);
    const card = page.locator('[data-project-id="ui_project"]');
    await card.scrollIntoViewIfNeeded();
    const cdp = await page.context().newCDPSession(page);
    const a = await card.boundingBox();
    if (!a) throw new Error('нет карточки');
    const x = a.x + a.width / 2;
    const y = a.y + a.height / 2;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await page.waitForTimeout(400);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 4, y: y + 4 }] });
    // Подводим палец к левому краю: доска сама прокручивается к соседней стадии.
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 6, y: y + 4 }] });
    await page.waitForFunction(() => {
      const box = document.querySelector('[data-project-stage="proposal"]')?.getBoundingClientRect();
      return Boolean(box && box.x > -60 && box.x < 180);
    });
    // Середина экрана лежит внутри колонки при любом таком сдвиге; автопрокрутка у края прекращается.
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 195, y: y + 4 }] });
    await page.waitForTimeout(400);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(page.locator('[data-project-stage="proposal"] [data-project-id="ui_project"]')).toBeVisible();
    await expect(page).not.toHaveURL(/#project\//);

    await page.locator('[data-project-id="ui_project"]').tap();
    await expect(page).toHaveURL(/#project\/ui_project\/overview$/);
  });
});
