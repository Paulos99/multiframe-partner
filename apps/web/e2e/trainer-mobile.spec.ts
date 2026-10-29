import { test, expect, type Page } from '@playwright/test';

const password = 'ui-fixture-password-only';

test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:4181/__reset');
});

async function enter(page: Page) {
  await page.goto('/');
  await page.getByLabel('Логин', { exact: true }).fill('ui.sales');
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Разделы кабинета' })).toBeVisible();
  const entry = page.getByRole('tab', { name: 'Обучение', exact: true }).or(page.getByRole('button', { name: 'Обучение', exact: true }));
  await entry.first().click();
  await page.getByRole('tab', { name: 'Тренажёр', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Тренажёр продаж' })).toBeVisible();
}

const trainer = (page: Page) => page.locator('#help-panel-trainer');

/** Страница не шире экрана, а нажимаемое в тренажёре не ниже 44 пикселей. */
async function fits(page: Page, where: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${where}: горизонтальная прокрутка`).toBeLessThanOrEqual(1);
  const small = await trainer(page).evaluate((root) => {
    const hit = [...root.querySelectorAll<HTMLElement>('button, a[href], select, summary')].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.height < 43.5;
    });
    return hit.map((el) => `${el.tagName}:${(el.textContent ?? '').trim().slice(0, 30)}:${Math.round(el.getBoundingClientRect().height)}`);
  });
  expect(small, `${where}: нажимаемое ниже 44 px`).toEqual([]);
}

/** Закреплённая кнопка видна целиком и стоит выше нижней панели разделов. */
async function stickyAboveNav(page: Page, button: ReturnType<Page['getByRole']>, where: string) {
  await expect(button, where).toBeVisible();
  const nav = await page.getByRole('complementary', { name: 'Разделы кабинета' }).boundingBox();
  const box = await button.boundingBox();
  const view = page.viewportSize();
  expect(nav && box && view, where).toBeTruthy();
  expect(box!.y, `${where}: кнопка выше верхнего края экрана`).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height, `${where}: кнопка закрыта нижней панелью`).toBeLessThanOrEqual(nav!.y + 0.5);
  expect(box!.y + box!.height, `${where}: кнопка ниже экрана`).toBeLessThanOrEqual(view!.height);
}

test.describe('телефон 390 на 844', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('главная: три режима с пояснением, ничего не вылезает, нажимаемое от 44 px', async ({ page }) => {
    await enter(page);
    const home = page.getByRole('region', { name: 'Тренажёр продаж' });
    await expect(home).toContainText('Выберите, как тренироваться');
    for (const mode of ['Быстрая отработка', 'Ролевые разговоры', 'Проверка знаний']) {
      await expect(home.getByRole('button', { name: new RegExp(mode) })).toBeVisible();
    }
    await expect(page.getByRole('button', { name: 'Подход на 5 минут', exact: true })).toBeVisible();
    await fits(page, 'главная');
  });

  test('отработка: «Ответить» всегда над нижней панелью, шаги и итог карточки на виду', async ({ page }) => {
    await enter(page);
    await page.getByRole('button', { name: 'Подход на 5 минут', exact: true }).click();
    await expect(page.getByText('Возражение 1 из 5')).toBeVisible();
    await expect(page.getByText(/Шаг 1 из 2/)).toBeVisible();
    await stickyAboveNav(page, page.getByRole('button', { name: 'Ответить', exact: true }), 'шаг 1');
    await fits(page, 'шаг 1');
    await page.getByLabel('Ваш ответ клиенту').fill('Понимаю вас, цена кажется высокой, давайте посмотрим, что вы получаете за эти деньги в вашей комнате');
    await page.getByRole('button', { name: 'Ответить', exact: true }).click();
    await expect(page.getByText(/Шаг 2 из 2/)).toBeVisible();
    await stickyAboveNav(page, page.getByRole('button', { name: 'Ответить', exact: true }), 'шаг 2');
    await page.getByLabel('Ваш ответ клиенту').fill('Понимаю, но по шуму вы получаете реальное снижение, а не обещание, и это измеримо в вашей квартире');
    await page.getByRole('button', { name: 'Ответить', exact: true }).click();
    await expect(page.getByRole('heading', { level: 3, name: 'Разбор ответа' })).toBeVisible();
    await expect(trainer(page)).toContainText('Что названо');
    await fits(page, 'разбор');
    await page.getByRole('button', { name: 'Сохранить оценку' }).click();
    const next = page.getByRole('button', { name: 'Следующее возражение', exact: true });
    await next.scrollIntoViewIfNeeded();
    await stickyAboveNav(page, next, 'итог карточки');
    await fits(page, 'итог карточки');
  });

  test('«Не знаю», подсказка и разделы разбора раскрываются нажатием', async ({ page }) => {
    await enter(page);
    await page.getByRole('button', { name: 'Подход на 5 минут', exact: true }).click();
    const hint = page.getByRole('complementary', { name: 'Подсказки' });
    await expect(hint.locator('details')).not.toHaveAttribute('open', '');
    await hint.getByText('На что смотрим').click();
    await expect(hint.locator('details')).toHaveAttribute('open', '');
    await page.getByRole('button', { name: 'Не знаю', exact: true }).click();
    const video = page.getByRole('region', { name: 'Из видео' });
    await expect(video.locator('details')).not.toHaveAttribute('open', '');
    await video.getByText('Из видео').click();
    await expect(video.locator('details')).toHaveAttribute('open', '');
    await fits(page, 'разбор «Не знаю»');
  });

  test('разговор, проверка знаний, прогресс и банк: без прокрутки вбок, с возвратом назад', async ({ page }) => {
    await enter(page);
    await page.evaluate(() => { location.hash = '#trainer/scenarios'; });
    await expect(page.getByRole('heading', { level: 3, name: 'Ролевые разговоры' })).toBeVisible();
    await fits(page, 'список разговоров');
    await trainer(page).locator('ul li button').first().click();
    await expect(page.getByRole('button', { name: /Начать разговор|Продолжить/ })).toBeVisible();
    await stickyAboveNav(page, page.getByRole('button', { name: /Начать разговор|Продолжить/ }), 'ситуация');
    await fits(page, 'ситуация');
    await page.getByRole('button', { name: /Начать разговор|Продолжить/ }).click();
    await expect(page.getByText(/Шаг 1 из/)).toBeVisible();
    await stickyAboveNav(page, page.getByRole('button', { name: 'Ответить', exact: true }), 'разговор');
    await fits(page, 'разговор');

    await page.evaluate(() => { location.hash = '#trainer/quiz'; });
    await expect(page.getByRole('heading', { level: 3, name: 'Проверка знаний' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Быстрая/ })).toBeVisible();
    await fits(page, 'старт проверки');
    await page.getByRole('button', { name: /Быстрая/ }).click();
    await expect(page.getByText('Вопрос 1 из 10')).toBeVisible();
    await trainer(page).locator('fieldset label').first().click();
    await page.getByRole('button', { name: 'Проверить', exact: true }).click();
    await stickyAboveNav(page, page.getByRole('button', { name: 'Дальше', exact: true }), 'вопрос проверен');
    await fits(page, 'вопрос проверен');

    await page.evaluate(() => { location.hash = '#trainer/progress'; });
    await expect(page.getByRole('heading', { level: 3, name: 'Мой прогресс' })).toBeVisible();
    await fits(page, 'прогресс');

    await page.evaluate(() => { location.hash = '#trainer/bank'; });
    await expect(page.getByRole('heading', { level: 3, name: 'Банк возражений' })).toBeVisible();
    await fits(page, 'банк');
    await trainer(page).locator('ul li button').first().click();
    await stickyAboveNav(page, page.getByRole('button', { name: 'Потренировать', exact: true }), 'карточка банка');
    await fits(page, 'карточка банка');
    await page.getByRole('button', { name: /Банк возражений/ }).first().click();
    await expect(page.getByRole('heading', { level: 3, name: 'Банк возражений' })).toBeVisible();
  });
});

test.describe('компьютер 1280 на 800', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('главная в три колонки, подсказка отработки раскрыта сразу', async ({ page }) => {
    await enter(page);
    const home = page.getByRole('region', { name: 'Тренажёр продаж' });
    const boxes = await Promise.all(['Быстрая отработка', 'Ролевые разговоры', 'Проверка знаний'].map((m) => home.getByRole('button', { name: new RegExp(m) }).boundingBox()));
    expect(new Set(boxes.map((b) => Math.round(b!.y))).size, 'режимы в один ряд').toBe(1);
    await page.getByRole('button', { name: 'Подход на 5 минут', exact: true }).click();
    await expect(page.getByRole('complementary', { name: 'Подсказки' }).locator('details')).toHaveAttribute('open', '');
    await fits(page, 'отработка на компьютере');
  });
});
