import { expect, type Page } from '@playwright/test';

/** Комната открывается страницей проекта. У монтажника она уже в списке. */
export async function openProjectRoom(page: Page, room: string) {
  const desk = page.getByRole('region', { name: 'Список проектов' });
  const inline = desk.getByRole('button', { name: room });
  const project = page.getByRole('button', { name: 'Тестовая квартира', exact: true });
  await expect(inline.or(project)).toBeVisible();
  if (await inline.isVisible()) {
    await inline.click();
  } else {
    await project.click();
    await expect(page).toHaveURL(/#project\/ui_project\/overview/);
    await page.getByRole('tab', { name: 'Комнаты', exact: true }).click();
    await page.getByRole('button', { name: room }).click();
  }
  await expect(page).toHaveURL(/#project\/ui_project\/room\//);
  const drawer = page.getByRole('region', { name: 'Комната' });
  await expect(drawer).toBeVisible();
  return { card: page.getByRole('region', { name: 'Проект' }), drawer };
}
