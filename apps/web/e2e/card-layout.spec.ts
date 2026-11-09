import { expect, test, type Page } from '@playwright/test';

/** Демо «Потолки Столицы»: проект Чернова, три комнаты с расчётом. */
async function openChernov(page: Page) {
  await page.goto('/?demo=1');
  await page.getByRole('region', { name: 'Потолки Столицы', exact: true }).getByRole('button', { name: /Прайс и команда/ }).click();
  await page.getByRole('tab', { name: 'Проекты', exact: true }).click();
  await page.getByRole('region', { name: 'Список проектов' }).getByRole('button', { name: /Чернов/ }).first().click();
  const card = page.getByRole('region', { name: 'Проект', exact: true });
  await expect(card).toBeVisible();
  return card;
}

async function noSideScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

test('страница проекта: шапка с клиентом и адресом, следующий шаг, шкала этапов, комнаты на обзоре', async ({ page }) => {
  const card = await openChernov(page);
  const hero = card.locator('[data-project-hero]');
  await expect(hero.getByRole('heading', { level: 1 })).toContainText('Чернов');
  await expect(hero).toContainText('ул. Бауманская');
  await expect(hero.locator('[data-next-step]')).toContainText('Следующий шаг');
  await expect(hero.getByRole('list', { name: 'Этапы проекта' }).getByRole('listitem')).toHaveCount(5);
  await expect(hero.locator('[aria-current="step"]')).toHaveCount(1);
  // Общее напоминание по всем проектам на странице проекта не показывается.
  await expect(page.getByText('ждут следующего шага')).toHaveCount(0);
  const rooms = card.getByRole('region', { name: 'Комнаты', exact: true });
  await expect(rooms.getByRole('button')).toHaveCount(3);
  await hero.getByRole('button', { name: 'Открыть комнату', exact: true }).click();
  await expect(page).toHaveURL(/\/room\//);
  await expect(page.getByRole('region', { name: 'Комната' })).toBeVisible();
});

test('карточка комнаты: шапка, главное действие, шкала этапов, факты и документы открыты', async ({ page }) => {
  const card = await openChernov(page);
  await card.getByRole('region', { name: 'Комнаты', exact: true }).getByRole('button', { name: /Кабинет/ }).click();
  const room = page.getByRole('region', { name: 'Комната' });
  const hero = room.locator('[data-room-hero]');
  await expect(hero.getByRole('heading', { level: 1 })).toContainText('Кабинет');
  await expect(hero).toContainText('ул. Бауманская');
  await expect(hero.locator('[data-next-action]')).toBeVisible();
  await expect(hero.getByRole('button', { name: 'Проблемомер', exact: true })).toBeVisible();
  await expect(hero.getByRole('button', { name: 'Калькулятор', exact: true })).toBeVisible();
  const track = hero.getByRole('group', { name: 'Сменить статус' });
  await expect(track.getByRole('button')).toHaveCount(5);
  await expect(track.locator('[aria-pressed="true"]')).toHaveCount(1);
  const facts = room.locator('[data-room-facts]');
  await expect(facts.getByText('Площадь', { exact: true })).toBeVisible();
  await expect(facts.getByText('Панели', { exact: true })).toBeVisible();
  await expect(facts.getByText('Итого комнаты', { exact: true })).toBeVisible();
  await expect(room.locator('[data-doc-block]')).toBeVisible();
  await expect(room.locator('[data-doc-block] summary')).toHaveCount(0);
  await expect(room.getByRole('navigation', { name: 'Комнаты проекта' }).getByRole('button')).toHaveCount(3);
  await expect(room.getByRole('navigation', { name: 'Комнаты проекта' }).locator('[aria-current="page"]')).toContainText('Кабинет');
  await noSideScroll(page);
});

test.describe('телефон, тёмная тема', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: 'dark' });

  test('переключатель комнат читается в тёмной теме, страница без прокрутки вбок', async ({ page }) => {
    const card = await openChernov(page);
    await noSideScroll(page);
    await card.getByRole('region', { name: 'Комнаты', exact: true }).getByRole('button', { name: /Кабинет/ }).click();
    const room = page.getByRole('region', { name: 'Комната' });
    await expect(room.locator('[data-room-hero]')).toBeVisible();
    const chip = room.getByRole('navigation', { name: 'Комнаты проекта' }).getByRole('button').nth(1);
    const colors = await chip.evaluate((el) => {
      const style = getComputedStyle(el);
      return { bg: style.backgroundColor, ink: getComputedStyle(el.querySelector('strong')!).color };
    });
    // Раньше карточки комнат были белыми с белым текстом.
    expect(colors.bg).not.toBe('rgb(255, 255, 255)');
    expect(colors.bg).not.toBe(colors.ink);
    await noSideScroll(page);
  });
});
