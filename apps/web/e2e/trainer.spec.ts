import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const password = 'ui-fixture-password-only';
const roles = ['admin', 'owner', 'sales', 'measurer', 'crew'] as const;
type RoleName = (typeof roles)[number];
const TRAINER_ROLE: Record<RoleName, string> = { admin: 'stp_admin', owner: 'owner', sales: 'manager', measurer: 'measurer', crew: 'crew' };

type Objection = {
  id: string;
  roles: string[];
  clientPhrasing: string[];
  pushback: string;
  referenceAnswer: string;
  pushbackReferenceAnswer: string;
  panel: { title: string };
  refusalReasonKey: string;
};
type Scenario = {
  id: string;
  title: string;
  roles: string[];
  steps: { id: string; objectionId: string; beats: number }[];
  closing: { clientLine: string; goodExamples: string[] };
};
type Question = { id: string; question: string; options: { id: string; text: string }[]; correctOptionIds: string[]; roles: string[]; type: string };

const read = <T>(name: string): T => JSON.parse(readFileSync(new URL(`../src/trainer/content/${name}.json`, import.meta.url), 'utf-8')) as T;
const objections = read<{ objections: Objection[]; refusalReasons: { key: string; title: string }[] }>('objections');
const scenarios = read<{ scenarios: Scenario[] }>('scenarios').scenarios;
const questions = read<{ questions: Question[] }>('quiz').questions;
const forRole = <T extends { roles: string[] }>(items: T[], role: RoleName) => (role === 'admin' ? items : items.filter((i) => i.roles.includes(TRAINER_ROLE[role])));

test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:4181/__reset');
});

async function enter(page: Page, role: RoleName) {
  await page.goto('/');
  await page.getByLabel('Логин', { exact: true }).fill(`ui.${role}`);
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Разделы кабинета' })).toBeVisible();
}

async function openTrainer(page: Page) {
  const entry = page.getByRole('tab', { name: 'Обучение', exact: true }).or(page.getByRole('button', { name: 'Обучение', exact: true }));
  await entry.first().click();
  await page.getByRole('tab', { name: 'Тренажёр', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Тренажёр продаж' })).toBeVisible();
  await expect(page).toHaveURL(/#trainer$/);
}

async function noDrawers(page: Page, where: string) {
  await expect(page.locator('[class*="drawer" i]'), where).toHaveCount(0);
}

function objectionByLine(line: string): Objection {
  const found = objections.objections.find((o) => o.clientPhrasing.includes(line.trim()) || o.pushback === line.trim());
  if (!found) throw new Error(`Не нашли возражение по реплике: ${line}`);
  return found;
}

/** Отвечает на карточку быстрой отработки эталоном и сохраняет оценку как есть. */
async function answerDrillCard(page: Page): Promise<Objection> {
  const first = (await page.locator('blockquote').first().innerText()).trim();
  const o = objectionByLine(first);
  const area = page.getByLabel('Ваш ответ клиенту');
  await area.fill(o.referenceAnswer);
  await page.getByRole('button', { name: 'Ответить', exact: true }).click();
  await expect(page.getByText('Клиент не согласен и повторяет')).toBeVisible();
  await page.getByLabel('Ваш ответ клиенту').fill(o.pushbackReferenceAnswer);
  await page.getByRole('button', { name: 'Ответить', exact: true }).click();
  await expect(page.getByRole('heading', { level: 3, name: 'Разбор ответа' })).toBeVisible();
  return o;
}

test('на каждой роли в «Обучении» есть «Тренажёр» с тремя режимами, без «Кабинета» и боковых панелей', async ({ page }) => {
  for (const role of roles) {
    await enter(page, role);
    await openTrainer(page);
    const home = page.getByRole('region', { name: 'Тренажёр продаж' });
    await expect(home).toContainText('Быстрая отработка');
    await expect(home).toContainText('Ролевые разговоры');
    await expect(home).toContainText('Проверка знаний');
    await expect(home).toContainText(`Возражений для вас: ${forRole(objections.objections, role).length}`);
    await expect(home).toContainText(`Сценариев: ${forRole(scenarios, role).length}`);
    await expect(home).toContainText(`Вопросов: ${forRole(questions, role).length}`);
    await expect(page.getByRole('tab', { name: 'Кабинет', exact: true })).toHaveCount(0);
    if (role === 'admin') await expect(home).toContainText('Версия:');
    else await expect(home).not.toContainText('Версия:');
    await noDrawers(page, role);
    // Переход в другой раздел кабинета снимает адрес тренажёра.
    await page.getByRole('complementary', { name: 'Разделы кабинета' }).getByRole('tab', { name: 'Сегодня', exact: true }).click();
    await expect(page).not.toHaveURL(/#trainer/);
    await page.getByRole('button', { name: 'Выйти', exact: true }).click();
  }
});

test('быстрая отработка: короткий ответ не уходит, эталон засчитывается, прогресс остаётся после перезагрузки', async ({ page }) => {
  await enter(page, 'sales');
  await openTrainer(page);
  await page.getByRole('button', { name: 'Подход на 5 минут', exact: true }).click();
  await expect(page).toHaveURL(/#trainer\/drill$/);
  await expect(page.getByText('Возражение 1 из 5')).toBeVisible();

  await page.getByLabel('Ваш ответ клиенту').fill('дорого очень');
  await page.getByRole('button', { name: 'Ответить', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('нужно хотя бы 8 слов');

  const o = await answerDrillCard(page);
  // разбор: подсветка, пункты, нарушения, оба эталона, цитаты, типичная ошибка
  await expect(page.getByRole('region', { name: 'Ваш ответ' })).toContainText(o.referenceAnswer.slice(0, 20));
  await expect(page.getByRole('region', { name: 'Пункты ответа' }).getByText('Названо').first()).toBeVisible();
  await expect(page.getByRole('region', { name: 'Нарушения' })).toContainText('Запрещённых утверждений не найдено');
  await expect(page.getByRole('region', { name: 'Эталон' })).toContainText(o.pushbackReferenceAnswer.slice(0, 30));
  await expect(page.getByRole('region', { name: 'Из видео' })).toContainText('Видео');
  await expect(page.getByRole('region', { name: 'Типичная ошибка' })).toBeVisible();
  await expect(page.locator('mark').first()).toBeVisible();

  // самооценка: изменение больше чем на балл требует пометки
  const honesty = page.getByRole('radiogroup', { name: 'Честность утверждений' });
  await honesty.getByRole('radio', { name: '1', exact: true }).check();
  await page.getByRole('button', { name: 'Сохранить оценку', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Напишите коротко, почему');
  await page.getByLabel('Почему вы изменили оценку?').fill('Не уверен, что назвал это клиенту');
  await page.getByRole('button', { name: 'Сохранить оценку', exact: true }).click();
  const result = page.getByRole('region', { name: 'Итог карточки' });
  await expect(result).toBeVisible();
  await expect(result).toContainText('Не засчитано');
  await expect(result).toContainText('сохранены отдельно');

  // «Повторить это»: второй заход, теперь с оценкой по эталону
  await result.getByRole('button', { name: 'Повторить это', exact: true }).click();
  await answerDrillCard(page);
  await page.getByRole('button', { name: 'Сохранить оценку', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Итог карточки' })).toContainText('Засчитано');
  await page.getByRole('button', { name: 'Закончить', exact: true }).click();
  await expect(page.getByRole('heading', { level: 3, name: 'Итог подхода' })).toBeVisible();
  await page.getByRole('button', { name: 'В тренажёр', exact: true }).click();

  await page.getByRole('button', { name: 'Весь прогресс', exact: true }).click();
  await expect(page.getByRole('region', { name: 'История' }).getByRole('listitem')).toHaveCount(2);
  await noDrawers(page, 'прогресс');

  // перезагрузка: адрес и данные на месте
  await page.reload();
  await expect(page.getByRole('heading', { level: 3, name: 'Мой прогресс' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'История' }).getByRole('listitem')).toHaveCount(2);
});

test('«Не знаю» ставит один балл и сразу показывает эталон', async ({ page }) => {
  await enter(page, 'owner');
  await openTrainer(page);
  await page.getByRole('button', { name: 'Быстрая отработка' }).click();
  await page.getByRole('button', { name: 'Не знаю', exact: true }).click();
  const result = page.getByRole('region', { name: 'Итог карточки' });
  await expect(result).toContainText('1');
  await expect(result).toContainText('Не засчитано');
  await expect(page.getByRole('region', { name: 'Эталон' })).toBeVisible();
});

test('прогресс разных пользователей на одном устройстве не смешивается, сброс очищает только своё', async ({ page }) => {
  await enter(page, 'owner');
  await openTrainer(page);
  await page.getByRole('button', { name: 'Быстрая отработка' }).click();
  await page.getByRole('button', { name: 'Не знаю', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Итог карточки' })).toBeVisible();
  await page.getByRole('button', { name: 'Закончить', exact: true }).click();
  await page.getByRole('button', { name: 'В тренажёр', exact: true }).click();
  await page.getByRole('button', { name: 'Весь прогресс', exact: true }).click();
  await expect(page.getByRole('region', { name: 'История' }).getByRole('listitem')).toHaveCount(1);

  // другой пользователь на том же устройстве начинает с чистого листа
  await page.getByRole('button', { name: 'Выйти', exact: true }).click();
  await page.getByLabel('Логин', { exact: true }).fill('ui.sales');
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Разделы кабинета' })).toBeVisible();
  await page.goto('/#trainer/progress');
  await expect(page.getByRole('heading', { level: 3, name: 'Мой прогресс' })).toBeVisible();
  await expect(page.getByText('Пока нет ни одной попытки.')).toBeVisible();

  // вернулся первый: его попытка на месте
  await page.getByRole('button', { name: 'Выйти', exact: true }).click();
  await page.getByLabel('Логин', { exact: true }).fill('ui.owner');
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await page.goto('/#trainer/progress');
  await expect(page.getByRole('region', { name: 'История' }).getByRole('listitem')).toHaveCount(1);
});

test('викторина: десять вопросов, верный ответ виден сразу, итог по темам', async ({ page }) => {
  await enter(page, 'measurer');
  await openTrainer(page);
  await page.getByRole('button', { name: /Проверка знаний/ }).click();
  await page.getByRole('button', { name: /Быстрая \(10 вопросов\)/ }).click();
  for (let i = 1; i <= 10; i += 1) {
    await expect(page.getByText(`Вопрос ${i} из 10`)).toBeVisible();
    const text = (await page.locator('legend').first().innerText()).trim();
    const q = questions.find((x) => x.question === text);
    if (!q) throw new Error(`Нет вопроса: ${text}`);
    expect(q.roles).toContain('measurer');
    for (const id of q.correctOptionIds) {
      const opt = q.options.find((o) => o.id === id)!;
      await page.getByRole(q.type === 'single' ? 'radio' : 'checkbox', { name: opt.text, exact: true }).check();
    }
    await page.getByRole('button', { name: 'Проверить', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Разбор вопроса' })).toContainText('Верно');
    await expect(page.getByRole('region', { name: 'Разбор вопроса' })).toContainText('Видео');
    await page.getByRole('button', { name: i === 10 ? 'Показать итог' : 'Дальше', exact: true }).click();
  }
  await expect(page).toHaveURL(/#trainer\/quiz\/result$/);
  await expect(page.getByText('✔ Засчитано (от 80 %)')).toBeVisible();
  await expect(page.getByRole('region', { name: 'По темам' })).toBeVisible();
  await expect(page.getByText('✔ Ошибок нет.')).toBeVisible();
});

test('викторина: ошибка в ловушке ведёт к возражению', async ({ page }) => {
  await enter(page, 'sales');
  await openTrainer(page);
  await page.getByRole('button', { name: /Проверка знаний/ }).click();
  await page.getByRole('button', { name: /Ловушки/ }).click();
  const total = await page.getByText(/Вопрос 1 из \d+/).innerText();
  const n = Number(/из (\d+)/.exec(total)![1]);
  for (let i = 1; i <= n; i += 1) {
    const text = (await page.locator('legend').first().innerText()).trim();
    const q = questions.find((x) => x.question === text)!;
    const wrong = q.options.find((o) => !q.correctOptionIds.includes(o.id))!;
    await page.getByRole(q.type === 'single' ? 'radio' : 'checkbox', { name: wrong.text, exact: true }).check();
    await page.getByRole('button', { name: 'Проверить', exact: true }).click();
    await page.getByRole('button', { name: i === n ? 'Показать итог' : 'Дальше', exact: true }).click();
  }
  await expect(page.getByText(/✖ Не засчитано/)).toBeVisible();
  await page.getByRole('button', { name: /^Потренировать:/ }).first().click();
  await expect(page).toHaveURL(/#trainer\/drill\//);
  await expect(page.getByText('Возражение 1 из 1')).toBeVisible();
});

test('сценарий: разговор по шагам, итог, самооценка, черновик сохраняется', async ({ page }) => {
  await enter(page, 'crew');
  await openTrainer(page);
  await page.getByRole('button', { name: /Ролевые разговоры/ }).click();
  const sc = forRole(scenarios, 'crew').find((s) => s.title.startsWith('Монтажник на объекте'))!;
  await page.getByRole('button', { name: new RegExp(sc.title.slice(0, 20)) }).click();
  await expect(page.getByRole('region', { name: 'Ситуация' })).toBeVisible();
  await page.getByRole('button', { name: 'Начать разговор', exact: true }).click();

  // первый шаг: ответ, выход, продолжение с черновика
  const first = sc.steps[0];
  const o1 = objections.objections.find((o) => o.id === first.objectionId)!;
  await page.getByLabel('Ваш ответ клиенту').fill(o1.referenceAnswer);
  await page.getByRole('button', { name: 'Ответить', exact: true }).click();
  await page.getByRole('button', { name: /Выйти \(разговор сохранится\)/ }).click();
  await expect(page.getByRole('button', { name: 'Продолжить разговор', exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Продолжить разговор', exact: true }).click();
  await expect(page.getByText('Клиент: ' + o1.clientPhrasing[0].slice(0, 12), { exact: false }).first()).toBeVisible();

  for (let i = 0; i < sc.steps.length; i += 1) {
    const step = sc.steps[i];
    const o = objections.objections.find((x) => x.id === step.objectionId)!;
    if (i > 0) {
      await page.getByLabel('Ваш ответ клиенту').fill(o.referenceAnswer);
      await page.getByRole('button', { name: 'Ответить', exact: true }).click();
    }
    if (step.beats === 2) {
      await page.getByLabel('Ваш ответ клиенту').fill(o.pushbackReferenceAnswer);
      await page.getByRole('button', { name: 'Ответить', exact: true }).click();
    }
    await page.getByRole('button', { name: 'Дальше', exact: true }).click();
  }
  await page.getByLabel('Ваша заключительная реплика').fill(sc.closing.goodExamples[0]);
  await page.getByRole('button', { name: 'Ответить', exact: true }).click();
  await expect(page).toHaveURL(/\/result$/);
  await expect(page.getByRole('region', { name: 'Критерии успеха' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Разбор шагов' })).toBeVisible();
  await page.getByRole('button', { name: 'Сохранить оценку', exact: true }).click();
  const done = page.getByRole('region', { name: 'Итог разговора' });
  await expect(done).toBeVisible();
  await expect(done).toContainText('сохранены отдельно');
  await noDrawers(page, 'итог разговора');
});

test('банк возражений: фильтр по причине отказа и карточка страницей', async ({ page }) => {
  await enter(page, 'owner');
  await openTrainer(page);
  await page.getByRole('button', { name: 'Банк возражений', exact: true }).click();
  const reason = objections.refusalReasons.find((r) => forRole(objections.objections, 'owner').some((o) => o.refusalReasonKey === r.key))!;
  await page.getByLabel('Причина отказа').selectOption({ label: reason.title });
  const expected = forRole(objections.objections, 'owner').filter((o) => o.refusalReasonKey === reason.key);
  await expect(page.getByRole('button', { name: new RegExp(expected[0].panel.title.slice(0, 15)) }).first()).toBeVisible();
  await page.getByRole('button', { name: new RegExp(expected[0].panel.title.slice(0, 15)) }).first().click();
  await expect(page).toHaveURL(/#trainer\/bank\//);
  await expect(page.getByRole('heading', { level: 3, name: expected[0].panel.title })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Эталон' })).toContainText(expected[0].referenceAnswer.slice(0, 20));
  await noDrawers(page, 'карточка банка');
});

test('настройки подхода открываются окном по центру и меняют размер подхода', async ({ page }) => {
  await enter(page, 'owner');
  await openTrainer(page);
  await page.getByRole('button', { name: 'Настройки подхода', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Настройки подхода' });
  await expect(dialog).toBeVisible();
  const box = (await dialog.boundingBox())!;
  const vp = page.viewportSize()!;
  expect(Math.abs(box.x + box.width / 2 - vp.width / 2)).toBeLessThan(16);
  await dialog.getByLabel('Возражений в подходе').selectOption('3');
  await dialog.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: 'Подход на 5 минут', exact: true }).click();
  await expect(page.getByText('Возражение 1 из 3')).toBeVisible();
});

test('сброс прогресса просит подтверждение', async ({ page }) => {
  await enter(page, 'owner');
  await openTrainer(page);
  await page.getByRole('button', { name: 'Быстрая отработка' }).click();
  await page.getByRole('button', { name: 'Не знаю', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Итог карточки' })).toBeVisible();
  await page.getByRole('button', { name: 'Закончить', exact: true }).click();
  await page.getByRole('button', { name: 'В тренажёр', exact: true }).click();
  await page.getByRole('button', { name: 'Весь прогресс', exact: true }).click();
  await page.getByRole('button', { name: 'Сбросить мой прогресс', exact: true }).click();
  const confirm = page.getByRole('alertdialog');
  await confirm.getByRole('button', { name: 'Отмена', exact: true }).click();
  await expect(page.getByRole('region', { name: 'История' }).getByRole('listitem')).toHaveCount(1);
  await page.getByRole('button', { name: 'Сбросить мой прогресс', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Сбросить', exact: true }).click();
  await expect(page.getByText('Пока нет ни одной попытки.')).toBeVisible();
});

test('монтажник и замерщик в тренажёре не видят цен', async ({ page }) => {
  for (const role of ['crew', 'measurer'] as const) {
    await enter(page, role);
    await openTrainer(page);
    const body = page.getByRole('tabpanel');
    await expect(body).not.toContainText('₽');
    await expect(body).not.toContainText(/\d\s?руб/i);
    await page.getByRole('button', { name: 'Банк возражений', exact: true }).click();
    await expect(body).not.toContainText('₽');
    await body.locator('li button').first().click();
    await expect(body).not.toContainText('₽');
    await page.getByRole('button', { name: 'Выйти', exact: true }).click();
  }
});

test('без сети тренажёр продолжает работать после загрузки', async ({ page, context }) => {
  await enter(page, 'owner');
  await openTrainer(page);
  await page.getByRole('button', { name: 'Быстрая отработка' }).click();
  await expect(page.getByText('Возражение 1 из 5')).toBeVisible();
  await context.setOffline(true);
  await answerDrillCard(page);
  await page.getByRole('button', { name: 'Сохранить оценку', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Итог карточки' })).toBeVisible();
  await context.setOffline(false);
});

test('на телефоне тренажёр помещается в экран, ввод не мельче 16 пикселей', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await enter(page, 'sales');
  await page.getByRole('complementary', { name: 'Разделы кабинета' }).getByRole('tab', { name: 'Обучение', exact: true }).click();
  await page.getByRole('tab', { name: 'Тренажёр', exact: true }).click();
  await page.getByRole('button', { name: 'Подход на 5 минут', exact: true }).click();
  const area = page.getByLabel('Ваш ответ клиенту');
  await expect(area).toBeVisible();
  expect(await area.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
