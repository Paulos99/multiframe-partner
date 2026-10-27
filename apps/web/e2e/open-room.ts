import { expect, type Page } from '@playwright/test';

/** Комната открывается из карточки проекта. У монтажника она уже в списке. */
export async function openProjectRoom(page: Page, room: string) {
  const desk = page.getByRole('region', { name: 'Список проектов' });
  const inline = desk.getByRole('button', { name: room });
  const project = page.getByRole('button', { name: 'Тестовая квартира', exact: true });
  const card = page.getByRole('dialog', { name: 'Карточка проекта' });
  await expect(inline.or(project)).toBeVisible();
  if (await inline.count()) {
    await inline.click();
  } else {
    await project.click();
    await card.getByRole('tab', { name: 'Рабочая информация', exact: true }).click();
    await card.getByRole('button', { name: room }).click();
  }
  const drawer = page.getByRole('dialog', { name: 'Комната' });
  await expect(drawer).toBeVisible();
  return { card, drawer };
}
