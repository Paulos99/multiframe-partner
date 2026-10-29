import { test, expect, type Page } from '@playwright/test';
import { pickChoice, playDrillCard, playScenario, shownOptions } from './trainer-helpers';

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

const next = (page: Page, name: string | RegExp) => page.getByRole('button', { name, exact: typeof name === 'string' });

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

  test('отработка: четыре варианта, ошибка с пояснением, «Дальше» над нижней панелью, разбор на виду', async ({ page }) => {
    await enter(page);
    await page.getByRole('button', { name: 'Подход на 5 минут', exact: true }).click();
    await expect(page.getByText('Возражение 1 из 5')).toBeVisible();
    await expect(page.locator('[data-option]')).toHaveCount(4);
    await fits(page, 'выбор: до ответа');

    // ошибка: вариант помечен, пояснение видно целиком выше нижней панели
    const options = await shownOptions(page);
    const wrong = options.find((o) => !o.correct)!;
    await wrong.button.tap();
    await expect(wrong.button).toHaveAttribute('data-state', 'wrong');
    const why = page.getByText(/^Почему неверно:/).first();
    await expect(why).toBeVisible();
    const nav = (await page.getByRole('complementary', { name: 'Разделы кабинета' }).boundingBox())!;
    await expect
      .poll(async () => {
        const box = (await why.boundingBox())!;
        return box.y + box.height;
      }, { message: 'пояснение закрыто нижней панелью' })
      .toBeLessThanOrEqual(nav.y + 0.5);
    await fits(page, 'выбор: после ошибки');

    const right = options.find((o) => o.correct)!;
    await right.button.tap();
    await stickyAboveNav(page, next(page, 'Дальше: клиент повторяет'), 'шаг 1: дальше');
    await fits(page, 'выбор: верно');
    await next(page, 'Дальше: клиент повторяет').tap();

    await expect(page.getByText('Клиент не согласен и повторяет')).toBeVisible();
    await pickChoice(page);
    await stickyAboveNav(page, next(page, 'К разбору'), 'шаг 2: к разбору');
    await next(page, 'К разбору').tap();

    await expect(page.getByRole('heading', { level: 3, name: 'Разбор ответа' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Итог карточки' })).toContainText('1 из 2');
    await stickyAboveNav(page, next(page, 'Следующее возражение'), 'итог карточки');
    await fits(page, 'разбор');
  });

  test('разделы разбора раскрываются нажатием, свободная практика не мешает', async ({ page }) => {
    await enter(page);
    await page.getByRole('button', { name: 'Подход на 5 минут', exact: true }).click();
    const hint = page.getByRole('complementary', { name: 'Подсказки' });
    await expect(hint.locator('details')).not.toHaveAttribute('open', '');
    await hint.getByText('Как это работает').click();
    await expect(hint.locator('details')).toHaveAttribute('open', '');
    await playDrillCard(page);
    const fold = page.getByText('Ответить своими словами');
    await fold.scrollIntoViewIfNeeded();
    await fold.click();
    await expect(page.getByRole('textbox').first()).toBeVisible();
    expect(await page.getByRole('textbox').first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
    await fits(page, 'разбор со свободной практикой');
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
    await expect(page.locator('[data-option]')).toHaveCount(4);
    await fits(page, 'разговор: выбор');
    await pickChoice(page);
    await stickyAboveNav(page, next(page, /^Дальше/), 'разговор: дальше');
    await fits(page, 'разговор: верно');

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

  test('сценарий до итога: итог и критерии помещаются, кнопки над панелью', async ({ page }) => {
    await enter(page);
    await page.evaluate(() => { location.hash = '#trainer/scenarios'; });
    await trainer(page).locator('ul li button').first().click();
    await page.getByRole('button', { name: /Начать разговор|Продолжить/ }).click();
    await playScenario(page, { slip: [1] });
    await expect(page.getByRole('region', { name: 'Итог разговора' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Критерии', exact: true })).toBeVisible();
    await fits(page, 'итог разговора');
  });

  test('источники с сайтов: ссылка и оговорка читаются на телефоне', async ({ page }) => {
    await enter(page);
    await page.evaluate(() => { location.hash = '#trainer/drill/obj-eco-child-allergy'; });
    await expect(page.getByText('Возражение 1 из 1')).toBeVisible();
    await playDrillCard(page);
    await page.getByText('Из видео и с сайтов').click();
    await expect(page.getByText('Производитель указывает', { exact: false }).first()).toBeVisible();
    await expect(page.getByText('Клиенту не говорить').first()).toBeVisible();
    await fits(page, 'источники');
  });
});

test.describe('телефон 390 на 844, тёмная тема', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, colorScheme: 'dark' });

  test('варианты, ошибка и верный ответ различимы, ничего не вылезает', async ({ page }) => {
    await enter(page);
    await page.getByRole('button', { name: 'Подход на 5 минут', exact: true }).click();
    const options = await shownOptions(page);
    const colors = async (b: (typeof options)[number]['button']) => b.evaluate((el) => getComputedStyle(el).backgroundColor);
    const idle = await colors(options[0].button);
    const wrong = options.find((o) => !o.correct)!;
    await wrong.button.tap();
    const wrongBg = await colors(wrong.button);
    expect(wrongBg, 'неверный вариант отличается цветом').not.toBe(idle);
    const right = options.find((o) => o.correct)!;
    await right.button.tap();
    const rightBg = await colors(right.button);
    expect(rightBg).not.toBe(wrongBg);
    await fits(page, 'тёмная тема');
    await stickyAboveNav(page, next(page, 'Дальше: клиент повторяет'), 'тёмная тема: дальше');
  });
});

test.describe('компьютер 1280 на 800', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('главная в три колонки, подсказка отработки раскрыта сразу, выбор помещается', async ({ page }) => {
    await enter(page);
    const home = page.getByRole('region', { name: 'Тренажёр продаж' });
    const boxes = await Promise.all(['Быстрая отработка', 'Ролевые разговоры', 'Проверка знаний'].map((m) => home.getByRole('button', { name: new RegExp(m) }).boundingBox()));
    expect(new Set(boxes.map((b) => Math.round(b!.y))).size, 'режимы в один ряд').toBe(1);
    await page.getByRole('button', { name: 'Подход на 5 минут', exact: true }).click();
    await expect(page.getByRole('complementary', { name: 'Подсказки' }).locator('details')).toHaveAttribute('open', '');
    await expect(page.locator('[data-option]')).toHaveCount(4);
    await fits(page, 'отработка на компьютере');
    await playDrillCard(page, true);
    await expect(page.getByRole('region', { name: 'Итог карточки' })).toBeVisible();
    await fits(page, 'разбор на компьютере');
  });
});

test.describe('компьютер 1280 на 800, тёмная тема', () => {
  test.use({ viewport: { width: 1280, height: 800 }, colorScheme: 'dark' });

  test('разбор читается в тёмной теме', async ({ page }) => {
    await enter(page);
    await page.getByRole('button', { name: 'Подход на 5 минут', exact: true }).click();
    await playDrillCard(page, true);
    await fits(page, 'разбор, тёмная тема');
  });
});
