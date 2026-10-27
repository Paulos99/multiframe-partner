import { expect, type Page } from '@playwright/test';

/** Комната открывается из карточки проекта, не с доски на странице «Проекты». */
export async function openProjectRoom(page: Page, room: string) {
  await page.getByRole('button', { name: 'Тестовая квартира', exact: true }).click();
  const card = page.getByRole('dialog', { name: 'Карточка проекта' });
  await card.getByRole('tab', { name: 'Рабочая информация', exact: true }).click();
  await card.getByRole('button', { name: room }).click();
  const drawer = page.getByRole('dialog', { name: 'Комната' });
  await expect(drawer).toBeVisible();
  return { card, drawer };
}
