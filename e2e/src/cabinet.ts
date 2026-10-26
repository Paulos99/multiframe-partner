import fs from 'node:fs';
import path from 'node:path';
import { expect, type Page, type TestInfo } from '@playwright/test';
import { API, credential, type RoleCase } from './env';

const ARTIFACTS = path.join(process.cwd(), 'artifacts');

export async function shot(page: Page, info: TestInfo, name: string): Promise<void> {
  fs.mkdirSync(ARTIFACTS, { recursive: true });
  const file = path.join(ARTIFACTS, `${info.project.name}-${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  await info.attach(`${info.project.name}-${name}`, { path: file, contentType: 'image/png' });
}

async function clearPasswordFields(page: Page): Promise<void> {
  await page.locator('input[type="password"]').evaluateAll((els) => {
    const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    for (const el of els) proto?.set?.call(el, '');
  }).catch(() => undefined);
}

/** Вход через форму. Пароль не пишется в отчёт: поле очищается сразу после отправки. */
export async function login(page: Page, role: RoleCase): Promise<void> {
  const loginName = credential(role.loginEnv);
  const password = credential(role.passwordEnv);
  await page.goto('./', { waitUntil: 'domcontentloaded' });

  const decline = page.getByRole('button', { name: 'Отклонить' });
  if (await decline.isVisible().catch(() => false)) await decline.click();

  const manual = page.getByRole('button', { name: /Войти по логину|Скрыть форму|Скрыть ручной вход/ });
  if (await manual.isVisible().catch(() => false)) {
    const label = (await manual.innerText()).trim();
    if (label.includes('Войти по логину')) await manual.click();
  }

  await page.getByLabel('Логин').fill(loginName);
  const passwordField = page.getByLabel('Пароль');
  await passwordField.fill(password);
  await Promise.all([
    page.waitForRequest(
      (req) => req.method() === 'POST' && /\/auth\/login\/?$/.test(new URL(req.url()).pathname),
      { timeout: 20_000 },
    ),
    page.getByRole('button', { name: 'Войти', exact: true }).click(),
  ]);
  await clearPasswordFields(page);

  const opened = await page
    .getByRole('button', { name: 'Выйти' })
    .waitFor({ state: 'visible', timeout: 45_000 })
    .then(() => true)
    .catch(() => false);
  await clearPasswordFields(page);
  if (!opened) {
    throw new Error(`Кабинет роли ${role.id} не открылся после входа.`);
  }
}

export async function expectHome(page: Page, role: RoleCase): Promise<void> {
  await expect(page.getByRole('heading', { level: 1, name: role.title })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Сегодня', exact: true })).toHaveAttribute('aria-selected', 'true');
  if (role.id === 'admin') {
    await expect(page.getByRole('button', { name: 'Добавить партнёра', exact: true })).toBeVisible();
    return;
  }
  await expect(page.getByRole('region', { name: 'Сегодня' })).toBeVisible();
}

export async function openList(page: Page, role: RoleCase): Promise<void> {
  if (role.objectsHeading == null) {
    await page.getByRole('tab', { name: /Партнёры/ }).click();
    await expect(page.getByText('Потолки Столицы').first()).toBeVisible();
    await expect(page.getByText('Северный Потолок').first()).toBeVisible();
    return;
  }
  await page.getByRole('tab', { name: 'Проекты', exact: true }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Проекты' })).toBeVisible();
}

/** Вкладка или блок «Проекты». Форму создания не открываем. */
export async function openProjects(page: Page): Promise<'opened' | 'unavailable' | 'missing'> {
  const tab = page.getByRole('tab', { name: 'Проекты', exact: true });
  const heading = page.getByRole('heading', { level: 2, name: 'Проекты' });
  if (await tab.count()) {
    await tab.click();
    await expect(heading).toBeVisible();
  } else if (!(await heading.isVisible().catch(() => false))) {
    return 'missing';
  }
  let state: 'opened' | 'unavailable' | 'loading' = 'loading';
  await expect
    .poll(
      async () => {
        if (await page.getByText('Проекты на сервере пока недоступны').count()) state = 'unavailable';
        else if (await page.getByText('Загружаем проекты…').count()) state = 'loading';
        else state = 'opened';
        return state;
      },
      { timeout: 20_000 },
    )
    .not.toBe('loading');
  return state === 'unavailable' ? 'unavailable' : 'opened';
}

export async function openTraining(page: Page, role: RoleCase): Promise<void> {
  const tab = page.getByRole('tab', { name: 'Обучение', exact: true });
  if (await tab.count()) await tab.click();
  else await page.getByRole('button', { name: 'Обучение', exact: true }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Обучение' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Материалы' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('Инструкции и презентации по продукту.')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Папки' })).toBeVisible();
  await page.getByRole('tab', { name: 'Кабинет' }).click();
  await expect(page.getByRole('heading', { level: 3, name: role.trainingTitle })).toBeVisible();
}

export async function objectNames(page: Page): Promise<string[]> {
  const all = page.getByRole('button', { name: /^Все · \d+/ });
  if (await all.count()) await all.first().click();
  const search = page.getByPlaceholder('Имя, адрес или телефон');
  if (await search.count()) await search.fill('');
  const names = await page.locator('button').evaluateAll((buttons) => {
    const statuses = ['Черновик', 'Замер', 'КП отправлено', 'Монтаж', 'Закрыто'];
    return buttons.flatMap((button) => {
      const text = button.textContent || '';
      if (!statuses.some((status) => text.includes(status))) return [];
      const strong = button.querySelector('strong');
      const name = (strong?.textContent || '').replace(/\s·\s↻/g, '').trim();
      if (!name || !/[A-Za-zА-Яа-яЁё]/.test(name)) return [];
      return [name];
    });
  });
  return [...new Set(names)];
}

export async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

export type ServerObject = {
  id: string;
  clientName: string;
  documents: Array<{ id: string; kind: string }>;
  priced: boolean;
};

export function watchObjects(page: Page, bucket: { objects: ServerObject[] }): void {
  page.on('response', async (response) => {
    if (response.request().method() !== 'GET' || !response.ok()) return;
    let pathname = '';
    try {
      pathname = new URL(response.url()).pathname;
    } catch {
      return;
    }
    if (!pathname.endsWith('/objects')) return;
    try {
      const data = (await response.json()) as {
        objects?: Array<{
          id?: string;
          clientName?: string;
          documents?: Array<{ id?: string; kind?: string }>;
          estimate?: { totalCost?: number | null } | null;
        }>;
      };
      if (!Array.isArray(data.objects)) return;
      bucket.objects = data.objects.map((obj) => ({
        id: String(obj.id || ''),
        clientName: String(obj.clientName || ''),
        documents: (obj.documents || []).map((doc) => ({
          id: String(doc.id || ''),
          kind: String(doc.kind || ''),
        })),
        priced: obj.estimate?.totalCost != null,
      }));
    } catch {
      /* ответ не JSON — для смоука не важен */
    }
  });
}

/** GET документа из страницы, чтобы его тоже закрывал перехватчик. Тело наружу не отдаём. */
export async function documentStatus(page: Page, objectId: string, docId: string): Promise<number> {
  return page.evaluate(
    async ({ api, objectId: oid, docId: did }) => {
      const token = localStorage.getItem('mf_partner_token_v1');
      const res = await fetch(
        `${api}/objects/${encodeURIComponent(oid)}/documents/${encodeURIComponent(did)}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      await res.arrayBuffer().catch(() => undefined);
      return res.status;
    },
    { api: API.replace(/\/$/, ''), objectId, docId },
  );
}
