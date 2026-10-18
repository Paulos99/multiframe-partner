import type { Page, Request } from '@playwright/test';

export type WriteHit = { method: string; path: string };

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function requestPath(request: Request): string {
  try {
    return new URL(request.url()).pathname || '/';
  } catch {
    return 'invalid-url';
  }
}

export function isAllowedWrite(method: string, pathname: string): boolean {
  return method === 'POST' && /\/auth\/login\/?$/.test(pathname);
}

/** Ложный успех: клиент считает событие отправленным, сервер его не видит. */
export function isAnalyticsStub(method: string, pathname: string): boolean {
  return method === 'POST' && /\/analytics\/events\/?$/.test(pathname);
}

/**
 * Пропускает чтение и POST /auth/login.
 * POST /analytics/events отвечает 200 локально и не попадает в список записей.
 * Любой другой POST/PATCH/PUT/DELETE обрывается и валит тест.
 * В список попадают только метод и путь, без тела и query.
 */
export async function installReadOnlyGuard(page: Page, hits: WriteHit[]): Promise<void> {
  await page.addLocatorHandler(page.getByRole('button', { name: 'Закрыть подсказку' }), async (hint) => {
    await hint.click();
  });
  await page.route('**/*', async (route) => {
    const request = route.request();
    const method = request.method().toUpperCase();
    if (READ_METHODS.has(method)) {
      await route.continue();
      return;
    }
    const pathname = requestPath(request);
    if (isAllowedWrite(method, pathname)) {
      await route.continue();
      return;
    }
    if (isAnalyticsStub(method, pathname)) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{"ok":true}',
      });
      return;
    }
    hits.push({ method, path: pathname });
    await route.abort('blockedbyclient');
  });
}

export function summarizeWrites(hits: WriteHit[]): string[] {
  const counts = new Map<string, number>();
  for (const hit of hits) {
    const key = `${hit.method} ${hit.path}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].map(([key, count]) => (count > 1 ? `${key} ×${count}` : key));
}
