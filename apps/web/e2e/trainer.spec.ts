import { test, expect, type Page } from '@playwright/test';
import { objectionsFile as objections, playDrillCard, playScenario, questions, scenarios } from './trainer-helpers';

const password = 'ui-fixture-password-only';
const roles = ['admin', 'owner', 'sales', 'measurer', 'crew'] as const;
type RoleName = (typeof roles)[number];
const TRAINER_ROLE: Record<RoleName, string> = { admin: 'stp_admin', owner: 'owner', sales: 'manager', measurer: 'measurer', crew: 'crew' };
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

/** Адрес тренажёра открывается внутри «Обучения», поэтому сначала заходим в раздел. */
async function openAt(page: Page, role: RoleName, hash: string) {
  await enter(page, role);
  await openTrainer(page);
  await page.goto(`/${hash}`);
}

const result = (page: Page) => page.getByRole('region', { name: 'Итог карточки' });

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
    await page.getByRole('complementary', { name: 'Разделы кабинета' }).getByRole('tab', { name: 'Сегодня', exact: true }).click();
    await expect(page).not.toHaveURL(/#trainer/);
    await page.getByRole('button', { name: 'Выйти', exact: true }).click();
  }
});

test('отработка: ошибка помечается и объясняется, повтор возможен, в зачёт идёт первый выбор', async ({ page }) => {
  await enter(page, 'sales');
  await openTrainer(page);
  await page.getByRole('button', { name: 'Подход на 5 минут', exact: true }).click();
  await expect(page).toHaveURL(/#trainer\/drill$/);
  await expect(page.getByText('Возражение 1 из 5')).toBeVisible();
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await expect(page.locator('[data-option]')).toHaveCount(4);
  await expect(page.getByRole('button', { name: 'Дальше: клиент повторяет' })).toHaveCount(0);

  // первая реплика: сначала ошибка, потом верный вариант
  await playDrillCard(page, true);
  const res = result(page);
  await expect(res).toContainText('1 из 2');
  await expect(res).toContainText('верно с первой попытки');
  await expect(res).toContainText('Не засчитано');
  await expect(page.getByRole('region', { name: 'Ошибки' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Верные ответы' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Эталон' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Критерии', exact: true })).toHaveCount(0);

  // «Повторить это»: теперь без ошибок
  await res.getByRole('button', { name: 'Повторить это', exact: true }).click();
  await expect(page.getByText('Возражение 1 из 5')).toBeVisible();
  await playDrillCard(page, false);
  await expect(result(page)).toContainText('2 из 2');
  await expect(result(page)).toContainText('Засчитано');
  await result(page).getByRole('button', { name: 'Закончить', exact: true }).click();
  await expect(page.getByRole('heading', { level: 3, name: 'Итог подхода' })).toBeVisible();
  await expect(page.getByText(/Засчитано возражений:\s*1\s*из 1/)).toBeVisible();
  await expect(page.getByRole('region', { name: 'Критерии', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'В тренажёр', exact: true }).click();

  await page.getByRole('button', { name: 'Весь прогресс', exact: true }).click();
  await expect(page.getByRole('region', { name: 'История' }).getByRole('listitem')).toHaveCount(2);
  await expect(page.getByRole('region', { name: 'Частые ошибки' })).toBeVisible();
  await noDrawers(page, 'прогресс');

  await page.reload();
  await expect(page.getByRole('heading', { level: 3, name: 'Мой прогресс' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'История' }).getByRole('listitem')).toHaveCount(2);
});

test('отработка: полный подход из пяти возражений без ошибок даёт 100 %', async ({ page }) => {
  await enter(page, 'owner');
  await openTrainer(page);
  await page.getByRole('button', { name: 'Подход на 5 минут', exact: true }).click();
  for (let i = 1; i <= 5; i += 1) {
    await expect(page.getByText(`Возражение ${i} из 5`)).toBeVisible();
    await playDrillCard(page);
    await expect(result(page)).toContainText('2 из 2');
    await result(page).getByRole('button', { name: i === 5 ? 'Закончить подход' : 'Следующее возражение', exact: true }).click();
  }
  await expect(page.getByRole('heading', { level: 3, name: 'Итог подхода' })).toBeVisible();
  await expect(page.getByText('100 %').first()).toBeVisible();
  await expect(page.getByText('Все возражения подхода засчитаны')).toBeVisible();
});

test('свободная практика в разборе необязательна и не меняет оценку', async ({ page }) => {
  await openAt(page, 'sales', '#trainer/drill/obj-cheaper-membrane');
  await expect(page.getByText('Возражение 1 из 1')).toBeVisible();
  await playDrillCard(page, true);
  await expect(result(page)).toContainText('1 из 2');
  await page.getByText('Ответить своими словами').click();
  const field = page.getByRole('textbox').first();
  await field.fill('Понимаю, давайте сравним, что именно входит в цену, и покажем это на замере.');
  await page.getByRole('button', { name: 'Показать, что вы сказали', exact: true }).click();
  await expect(page.getByText('Оценку это не меняет').first()).toBeVisible();
  await expect(result(page)).toContainText('1 из 2');
  expect(await field.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
});

test('цитаты с сайтов: «Производитель указывает», ссылка на источник, оговорка «Клиенту не говорить»', async ({ page }) => {
  await openAt(page, 'owner', '#trainer/drill/obj-eco-child-allergy');
  await expect(page.getByText('Возражение 1 из 1')).toBeVisible();
  await playDrillCard(page);
  const sources = page.getByText('Из видео и с сайтов');
  await sources.click();
  const claim = page.getByText('Производитель указывает', { exact: false }).first();
  await expect(claim).toBeVisible();
  const link = page.getByRole('link', { name: 'Открыть страницу' }).first();
  await expect(link).toHaveAttribute('href', /^https:\/\//);
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', /noopener/);
  await expect(page.getByText('Клиенту не говорить').first()).toBeVisible();
});

test('возражение о пожарной безопасности открыто в тренажёре после снятия вопроса', async ({ page }) => {
  await openAt(page, 'owner', '#trainer/drill/obj-eco-fire');
  await expect(page.getByText('Возражение 1 из 1')).toBeVisible();
  await expect(page.locator('[data-option]')).toHaveCount(4);
});

test('старые попытки с набором текста не ломают прогресс и не попадают в итоги', async ({ page }) => {
  await enter(page, 'owner');
  await openTrainer(page);
  await page.getByRole('button', { name: 'Подход на 5 минут', exact: true }).click();
  await playDrillCard(page);
  await result(page).getByRole('button', { name: 'Закончить', exact: true }).or(page.getByRole('button', { name: 'Закончить подход', exact: true })).click();
  // дублируем попытку без выбранных вариантов: так выглядела старая запись
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('training');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction('attempts', 'readwrite');
          const store = tx.objectStore('attempts');
          const all = store.getAll();
          all.onsuccess = () => {
            const base = all.result[0] as Record<string, unknown>;
            const old = { ...base, id: 'legacy-1', scheme: undefined, picks: undefined, firstTryCorrect: undefined, choiceScores: undefined, autoScores: {}, answers: [] };
            store.put(old);
          };
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
  await page.reload();
  await page.goto('/#trainer/progress');
  await expect(page.getByRole('heading', { level: 3, name: 'Мой прогресс' })).toBeVisible();
  await expect(page.getByText('Старых попыток с набором ответа текстом: 1')).toBeVisible();
  await expect(page.getByRole('region', { name: 'История' }).getByRole('listitem')).toHaveCount(1);
});

test('прогресс разных пользователей на одном устройстве не смешивается, сброс очищает только своё', async ({ page }) => {
  await openAt(page, 'owner', '#trainer/drill/obj-cheaper-membrane');
  await playDrillCard(page);
  await result(page).getByRole('button', { name: 'Закончить подход', exact: true }).click();
  await page.getByRole('button', { name: 'В тренажёр', exact: true }).click();
  await page.getByRole('button', { name: 'Весь прогресс', exact: true }).click();
  await expect(page.getByRole('region', { name: 'История' }).getByRole('listitem')).toHaveCount(1);

  await page.getByRole('button', { name: 'Выйти', exact: true }).click();
  await page.getByLabel('Логин', { exact: true }).fill('ui.sales');
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Разделы кабинета' })).toBeVisible();
  await page.goto('/#trainer/progress');
  await expect(page.getByRole('heading', { level: 3, name: 'Мой прогресс' })).toBeVisible();
  await expect(page.getByText('Пока нет ни одной попытки.')).toBeVisible();

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

test('сценарий: выбор по шагам, подсказка, черновик, итог с критериями и закрытием', async ({ page }) => {
  await enter(page, 'crew');
  await openTrainer(page);
  await page.getByRole('button', { name: /Ролевые разговоры/ }).click();
  const sc = forRole(scenarios, 'crew').find((s) => s.title.startsWith('Монтажник на объекте'))!;
  await page.getByRole('button', { name: new RegExp(sc.title.slice(0, 20)) }).click();
  await expect(page.getByRole('region', { name: 'Ситуация' })).toBeVisible();
  await page.getByRole('button', { name: 'Начать разговор', exact: true }).click();
  await expect(page.getByText(/Шаг 1 из \d+/)).toBeVisible();
  await expect(page.getByRole('textbox')).toHaveCount(0);

  // подсказка не снижает оценку
  await page.getByRole('button', { name: 'Подсказка', exact: true }).click();
  await expect(page.getByText('Подсказка наставника')).toBeVisible();

  // выбор, выход, продолжение с черновика
  await playScenario(page, { stopAfter: 1 });
  await page.getByRole('button', { name: /Выйти \(разговор сохранится\)/ }).click();
  await expect(page.getByRole('button', { name: 'Продолжить разговор', exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Продолжить разговор', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Разговор' })).toContainText('Вы:');

  await playScenario(page, { slip: [3] });
  await expect(page).toHaveURL(/\/result$/);
  const done = page.getByRole('region', { name: 'Итог разговора' });
  await expect(done).toBeVisible();
  await expect(done).toContainText('верно с первой попытки');
  await expect(page.getByRole('region', { name: 'Критерии успеха' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Критерии', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Разбор шагов' })).toBeVisible();
  await noDrawers(page, 'итог разговора');

  await page.goto('/#trainer/progress');
  await expect(page.getByRole('region', { name: 'История' }).getByRole('listitem')).toHaveCount(1);
});

test('сценарий: чистое прохождение засчитывается', async ({ page }) => {
  await openAt(page, 'sales', `#trainer/scenarios/${forRole(scenarios, 'sales')[0].id}`);
  await page.getByRole('button', { name: 'Начать разговор', exact: true }).click();
  await playScenario(page);
  await expect(page.getByRole('region', { name: 'Итог разговора' })).toContainText('Разговор засчитан');
});

test('настройки подхода открываются окном по центру и меняют размер подхода', async ({ page }) => {
  await enter(page, 'owner');
  await openTrainer(page);
  await page.getByRole('button', { name: 'Настройки подхода', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Настройки подхода' });
  await expect(dialog).toBeVisible();
  await expect(dialog).not.toContainText('Автоматическая оценка');
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
  await openAt(page, 'owner', '#trainer/drill/obj-cheaper-membrane');
  await playDrillCard(page);
  await result(page).getByRole('button', { name: 'Закончить подход', exact: true }).click();
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

test('без сети тренажёр продолжает работать после загрузки', async ({ page, context }) => {
  await enter(page, 'owner');
  await openTrainer(page);
  await page.getByRole('button', { name: 'Быстрая отработка' }).click();
  await expect(page.getByText('Возражение 1 из 5')).toBeVisible();
  await context.setOffline(true);
  await playDrillCard(page, true);
  await expect(result(page)).toBeVisible();
  await context.setOffline(false);
});

test('на телефоне тренажёр помещается в экран, варианты нажимаются', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await enter(page, 'sales');
  await page.getByRole('complementary', { name: 'Разделы кабинета' }).getByRole('tab', { name: 'Обучение', exact: true }).click();
  await page.getByRole('tab', { name: 'Тренажёр', exact: true }).click();
  await page.getByRole('button', { name: 'Подход на 5 минут', exact: true }).click();
  await expect(page.locator('[data-option]').first()).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await playDrillCard(page, true);
  const overflow2 = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow2).toBeLessThanOrEqual(1);
});
