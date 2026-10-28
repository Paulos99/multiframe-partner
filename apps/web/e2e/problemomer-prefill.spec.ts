import { test, expect, type Page } from '@playwright/test';
import { openProjectRoom } from './open-room';

const password = 'ui-fixture-password-only';

test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:4181/__reset');
});

async function enter(page: Page) {
  await page.goto('/');
  await page.getByLabel('Логин', { exact: true }).fill('ui.sales');
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Проекты', exact: true })).toBeVisible();
}

test('из комнаты Проблемомер подставляет тип и площадь, «Далее» активно', async ({ page }) => {
  await enter(page);
  await page.getByRole('tab', { name: 'Проекты', exact: true }).click();
  const { drawer } = await openProjectRoom(page, 'Спальня');
  await expect(drawer.getByRole('button', { name: 'Проблемомер', exact: true })).toBeVisible();
  await drawer.getByRole('button', { name: 'Проблемомер', exact: true }).click();
  await page.locator('button[aria-label="Кабинет"]').click();
  await expect(page.getByRole('region', { name: 'Комната' })).toBeVisible();
  await page.getByRole('region', { name: 'Комната' }).getByRole('button', { name: 'Проблемомер', exact: true }).click();
  await page.getByRole('button', { name: 'Начать', exact: true }).click();

  const question = page.getByRole('heading', { name: 'Укажите тип комнаты и площадь' });
  for (let i = 0; i < 6 && !(await question.isVisible().catch(() => false)); i += 1) {
    const next = page.getByRole('button', { name: 'Далее', exact: true });
    await expect(next).toBeEnabled();
    await next.click();
  }

  await expect(question).toBeVisible();
  await expect(page.getByLabel('Площадь комнаты, м²')).toBeVisible();
  await expect(page.getByText('Сохранится в комнату проекта и в калькулятор')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Спальня', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByPlaceholder('Например, 18')).toHaveValue('24');
  await expect(page.getByText('выберите тип')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Далее', exact: true })).toBeEnabled();

  const result = page.getByRole('heading', { name: 'Акустический профиль помещения' });
  for (let i = 0; i < 8 && !(await result.isVisible().catch(() => false)); i += 1) {
    const next = page.getByRole('button', { name: 'Далее', exact: true });
    if (await next.isVisible().catch(() => false)) {
      if (await next.isEnabled()) await next.click();
    }
    await page.waitForTimeout(300);
  }
  await expect(result).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole('region', { name: 'Параметры комнаты' })).toContainText('Спальня');
  await expect(page.getByRole('button', { name: 'Сохранить', exact: true })).toBeVisible();
  await expect(page.getByText('Другие действия', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Рассчитать количество', exact: true })).toHaveCount(0);
  await expect(page.getByText('без каркаса')).toHaveCount(0);
  await expect(page.getByLabel('Проект')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Отправить КП', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Пройти ещё раз', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  const room = page.getByRole('region', { name: 'Комната' });
  await expect(room).toBeVisible();
  await expect(room).toContainText('Спальня');
});

test('калькулятор из комнаты сразу показывает одну сумму в смете и внизу', async ({ page }) => {
  await enter(page);
  await page.getByRole('tab', { name: 'Проекты', exact: true }).click();
  const { drawer } = await openProjectRoom(page, 'Спальня');
  await drawer.getByRole('button', { name: 'Калькулятор', exact: true }).click();
  const frame = page.frameLocator('iframe[title="Калькулятор MultiFrame · партнёр"]');
  await expect(frame.locator('#areaOnlyInput')).toHaveValue(/24/);
  const sideTotal = frame.locator('.rb-kv--total strong');
  const bottomTotal = frame.locator('#partnerTotalCost');
  await expect(sideTotal).toBeVisible();
  await expect(sideTotal).not.toHaveText('0 ₽');
  await expect(bottomTotal).toHaveText(await sideTotal.innerText());
  await expect(frame.locator('.rb-kv--install strong')).not.toHaveText('0 ₽');
  await expect(frame.getByText('Высота стен').filter({ visible: true })).toHaveCount(0);
  await expect(frame.getByText('вкладка «Стены»').filter({ visible: true })).toHaveCount(0);
});

test('замерщик видит только назначенную комнату и её цену', async ({ page }) => {
  await enter(page);
  await page.getByRole('tab', { name: 'Проекты', exact: true }).click();
  const { drawer } = await openProjectRoom(page, 'Гостиная');
  const saved = page.waitForResponse(
    (res) => res.request().method() === 'PATCH' && res.url().includes('/objects/ui_crew_room') && res.ok(),
  );
  await drawer.getByLabel('Исполнитель').selectOption('ui_measurer');
  await saved;
  await expect(drawer.getByLabel('Исполнитель')).toHaveValue('ui_measurer');
  await drawer.getByRole('button', { name: 'К проекту', exact: true }).click();
  await page.getByRole('button', { name: 'Выйти', exact: true }).click();

  await page.getByLabel('Логин', { exact: true }).fill('ui.measurer');
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await page.getByRole('tab', { name: 'Проекты', exact: true }).click();
  const desk = page.getByRole('region', { name: 'Список проектов' });
  // Комната ушла в монтаж, у замерщика она в «Готовых».
  await desk.locator('summary').click();
  await expect(desk.getByRole('button', { name: 'Гостиная' })).toBeVisible();
  await expect(desk.getByRole('button', { name: 'Спальня' })).toHaveCount(0);
  await expect(desk.getByRole('button', { name: 'Кухня' })).toHaveCount(0);
  await desk.getByRole('button', { name: 'Гостиная' }).click();
  const room = page.getByRole('region', { name: 'Комната' });
  await expect(room.getByText('Итого комнаты')).toBeVisible();
  await expect(room.getByText(/75[\s\u00a0\u202f]*261/)).toBeVisible();
});
