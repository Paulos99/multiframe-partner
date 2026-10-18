import { expect, test, type Browser, type Page, type TestInfo } from '@playwright/test';
import {
  documentStatus,
  expectHome,
  horizontalOverflow,
  login,
  objectNames,
  openList,
  openProjects,
  openTraining,
  shot,
  watchObjects,
  type ServerObject,
} from '../src/cabinet';
import { API, CREW_OBJECT_NAME, roleById, ROLES } from '../src/env';
import { installReadOnlyGuard, summarizeWrites, type WriteHit } from '../src/guard';

const writesByPage = new WeakMap<Page, WriteHit[]>();

async function guardedPage(browser: Browser, info: TestInfo): Promise<Page> {
  const project = info.project.use;
  const page = await browser.newPage({
    viewport: project.viewport,
    userAgent: project.userAgent,
    isMobile: project.isMobile,
    hasTouch: project.hasTouch,
    deviceScaleFactor: project.deviceScaleFactor,
  });
  const hits: WriteHit[] = [];
  writesByPage.set(page, hits);
  await installReadOnlyGuard(page, hits);
  return page;
}

function writesOf(page: Page): string[] {
  return summarizeWrites(writesByPage.get(page) || []);
}

async function assertPageFits(page: Page): Promise<void> {
  const overflow = await horizontalOverflow(page);
  expect(overflow, `горизонтальный вылет ${overflow}px`).toBeLessThanOrEqual(1);
}

test.afterEach(async ({ page }) => {
  const writes = writesOf(page);
  expect(writes, 'попытка записи в прод, кроме POST /auth/login').toEqual([]);
});

for (const role of ROLES) {
  test(`${role.id}: кабинет, сводка, список и обучение`, async ({ page, browser }, info) => {
    test.setTimeout(role.id === 'crew' ? 180_000 : 120_000);
    const hits: WriteHit[] = [];
    writesByPage.set(page, hits);
    await installReadOnlyGuard(page, hits);
    const server: { objects: ServerObject[] } = { objects: [] };
    watchObjects(page, server);

    await login(page, role);
    await expectHome(page, role);
    await assertPageFits(page);
    await shot(page, info, `${role.id}-home`);

    await openList(page, role);
    await assertPageFits(page);
    await shot(page, info, `${role.id}-list`);

    const projects = await openProjects(page);
    info.annotations.push({ type: 'projects', description: projects });
    await shot(page, info, `${role.id}-projects`);

    if (role.id === 'crew') await checkCrewDocuments(page, browser, info, server);

    await openTraining(page, role);
    await assertPageFits(page);
    await shot(page, info, `${role.id}-training`);
  });
}

test('компании не видят объекты друг друга', async ({ browser }, info) => {
  test.setTimeout(180_000);
  const ownerPage = await guardedPage(browser, info);
  const otherPage = await guardedPage(browser, info);
  try {
    await login(ownerPage, roleById('owner'));
    await openList(ownerPage, roleById('owner'));
    const own = await objectNames(ownerPage);
    await shot(ownerPage, info, 'isolation-owner');

    await login(otherPage, roleById('owner-b'));
    await openList(otherPage, roleById('owner-b'));
    const other = await objectNames(otherPage);
    await shot(otherPage, info, 'isolation-owner-b');

    expect(own.length).toBeGreaterThan(0);
    expect(other.length).toBeGreaterThan(0);
    const overlap = own.filter((name) => other.includes(name));
    expect(overlap, 'одинаковые имена объектов у двух компаний').toEqual([]);
    expect(own).toContain(CREW_OBJECT_NAME);
    expect(other).not.toContain(CREW_OBJECT_NAME);

    await expectForeignHidden(ownerPage, pickForeign(other, own));
    await expectForeignHidden(otherPage, pickForeign(own, other));
    await assertPageFits(ownerPage);
    await assertPageFits(otherPage);
    expect.soft(writesOf(ownerPage), 'запись от владельца A').toEqual([]);
    expect.soft(writesOf(otherPage), 'запись от владельца B').toEqual([]);
  } finally {
    await ownerPage.close();
    await otherPage.close();
  }
});

function pickForeign(foreign: string[], own: string[]): string {
  return (
    foreign.find(
      (name) =>
        name !== CREW_OBJECT_NAME &&
        name.length > 4 &&
        !own.some((item) => item.includes(name) || name.includes(item)),
    ) || foreign[0]
  );
}

async function expectForeignHidden(page: Page, foreignName: string): Promise<void> {
  await page.getByPlaceholder('Имя, адрес или телефон').fill(foreignName);
  await expect(page.getByText('Ничего не нашлось по этому фильтру.')).toBeVisible();
  await page.getByPlaceholder('Имя, адрес или телефон').fill('');
}

async function checkCrewDocuments(
  page: Page,
  browser: Browser,
  info: TestInfo,
  server: { objects: ServerObject[] },
): Promise<void> {
  await expect(page.locator('body')).not.toContainText('₽');
  await expect.poll(() => server.objects.length, { timeout: 20_000 }).toBeGreaterThan(0);
  expect(server.objects.some((obj) => obj.priced), 'в ответе монтажника есть сумма').toBe(false);

  const crewObject = server.objects.find((obj) => obj.clientName === CREW_OBJECT_NAME);
  expect(crewObject, `в списке монтажника нет «${CREW_OBJECT_NAME}»`).toBeTruthy();
  const kinds = crewObject?.documents.map((doc) => doc.kind) || [];
  expect(kinds).toContain('spec');
  expect(kinds).not.toContain('estimate');

  await page.getByRole('button', { name: /^Все · \d+/ }).click();
  await page.getByPlaceholder('Имя, адрес или телефон').fill(CREW_OBJECT_NAME);
  await page.getByRole('button', { name: /Проверка доступа монтажника/ }).click();

  const detail = page.locator('h3', { hasText: CREW_OBJECT_NAME }).locator('xpath=..');
  await expect(detail.getByText('Спецификации без цен')).toBeVisible();
  await expect(detail.getByText('Спецификация без цен').first()).toBeVisible();
  await expect(detail.getByText('Смета с ценами')).toHaveCount(0);
  await expect(detail.getByText('Итого КП')).toHaveCount(0);
  await expect(detail.getByText(/₽/)).toHaveCount(0);
  await shot(page, info, 'crew-object');

  const spec = crewObject?.documents.find((doc) => doc.kind === 'spec');
  expect(spec?.id).toBeTruthy();
  await expect
    .poll(() => documentStatus(page, crewObject!.id, spec!.id), { timeout: 30_000 })
    .toBe(200);

  const download = page.waitForResponse(
    (response) =>
      response.request().method() === 'GET' && response.url().includes('/documents/'),
    { timeout: 30_000 },
  );
  await detail.getByRole('button', { name: 'Открыть' }).first().click();
  expect((await download).status()).toBe(200);
  await expect(page.getByText('Не удалось открыть PDF')).toHaveCount(0);

  const estimateId = await estimateIdFromOwner(browser, info);
  expect(await documentStatus(page, crewObject!.id, estimateId)).toBe(404);
}

/**
 * Id сметы есть только у роли с ценами. Читаем его отдельным входом владельца
 * и не нажимаем «Выйти»: выход — это POST.
 */
async function estimateIdFromOwner(browser: Browser, info: TestInfo): Promise<string> {
  const page = await guardedPage(browser, info);
  const server: { objects: ServerObject[] } = { objects: [] };
  watchObjects(page, server);
  try {
    await login(page, roleById('owner'));
    await expect.poll(() => server.objects.length, { timeout: 20_000 }).toBeGreaterThan(0);
    const obj = server.objects.find((item) => item.clientName === CREW_OBJECT_NAME);
    const estimate = obj?.documents.find((doc) => doc.kind === 'estimate');
    const spec = obj?.documents.find((doc) => doc.kind === 'spec');
    expect(obj, `у владельца нет «${CREW_OBJECT_NAME}»`).toBeTruthy();
    expect(spec?.id, 'у владельца нет спецификации тестового объекта').toBeTruthy();
    expect(estimate?.id, 'у владельца нет сметы тестового объекта').toBeTruthy();
    expect(await documentStatus(page, obj!.id, spec!.id)).toBe(200);
    expect(await documentStatus(page, obj!.id, estimate!.id)).toBe(200);
    expect.soft(writesOf(page), 'запись при чтении документов владельцем').toEqual([]);
    return estimate!.id;
  } finally {
    await page.close();
  }
}

test('guard: запись кроме входа не уходит на сервер', async ({ page }) => {
  const hits: WriteHit[] = [];
  writesByPage.set(page, hits);
  await installReadOnlyGuard(page, hits);
  await page.goto('./');
  const statuses = await page.evaluate(async (api) => {
    const analytics = await fetch(`${api}/analytics/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"events":[]}',
    });
    const blocked = async (path: string, method: string) => {
      try {
        return (await fetch(`${api}${path}`, { method, body: '{}' })).status;
      } catch {
        return 0;
      }
    };
    return {
      analytics: analytics.status,
      objects: await blocked('/objects', 'POST'),
      patch: await blocked('/org/settings', 'PATCH'),
      put: await blocked('/objects/smoke-guard', 'PUT'),
      delete: await blocked('/objects/smoke-guard', 'DELETE'),
    };
  }, API.replace(/\/$/, ''));
  expect(statuses.analytics).toBe(200);
  expect(statuses.objects).toBe(0);
  expect(statuses.patch).toBe(0);
  expect(statuses.put).toBe(0);
  expect(statuses.delete).toBe(0);
  expect(hits.map((hit) => `${hit.method} ${hit.path}`)).toEqual([
    'POST /objects',
    'PATCH /org/settings',
    'PUT /objects/smoke-guard',
    'DELETE /objects/smoke-guard',
  ]);
  hits.length = 0;
});
