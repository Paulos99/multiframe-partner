import { test, expect, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';

/**
 * Автообновление без вопросов. Настоящая сборка собирается дважды (две «выкладки»), static-сервер
 * на случайном порту отдаёт то одну, то другую — как GitHub Pages после деплоя.
 */
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.mp3': 'audio/mpeg',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};

type Site = { dir: string; id: string };
let siteA: Site;
let siteB: Site;
let server: Server;
let origin = '';
/** Какая выкладка «сейчас на сервере». */
let live: 'A' | 'B' = 'A';
/** Имитация кэша: HTML отдаётся от выкладки A, пока в адресе нет параметра обхода. */
let staleHtml = false;
/** Совсем упрямый кэш: параметр обхода тоже не помогает. */
let stubbornHtml = false;

function build(id: string): Site {
  const dir = mkdtempSync(join(tmpdir(), `mf-update-${id}-`));
  execFileSync('node', ['node_modules/vite/bin/vite.js', 'build', '--outDir', dir, '--emptyOutDir'], {
    cwd: process.cwd(),
    env: { ...process.env, GITHUB_SHA: id.padEnd(12, id), VITE_BASE: '/', VITE_API_URL: '' },
    stdio: 'pipe',
    timeout: 170_000,
  });
  return { dir, id: id.padEnd(12, id) };
}

function readSite(site: Site, urlPath: string): { body: Buffer; type: string } | null {
  let rel = normalize(decodeURIComponent(urlPath)).replace(/^([/\\])+/, '');
  if (rel.includes('..')) return null;
  if (!rel || rel.endsWith('/')) rel += 'index.html';
  let file = join(site.dir, rel);
  if (!existsSync(file) || !statSync(file).isFile()) {
    if (extname(rel)) return null;
    file = join(site.dir, 'index.html');
  }
  return { body: readFileSync(file), type: TYPES[extname(file)] || 'application/octet-stream' };
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(400_000);
  siteA = build('a');
  siteB = build('b');
  server = createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://x');
    const wantsHtml = url.pathname === '/' || url.pathname.endsWith('.html') || !extname(url.pathname);
    const bypass = url.searchParams.has('_v') && !stubbornHtml;
    const site = wantsHtml && staleHtml && !bypass ? siteA : live === 'A' ? siteA : siteB;
    const file = readSite(site, url.pathname);
    if (!file) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
      return;
    }
    // Как у GitHub Pages: всё живёт в кэше браузера до 10 минут.
    res.writeHead(200, { 'content-type': file.type, 'cache-control': 'max-age=600' });
    res.end(file.body);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  origin = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
});

test.beforeEach(() => {
  live = 'A';
  staleHtml = false;
  stubbornHtml = false;
});

async function mainScript(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.querySelector('script[type="module"][src*="/assets/"]') as HTMLScriptElement | null;
    return el ? new URL(el.src).pathname : '';
  });
}

function countLoads(page: Page): { count: () => number } {
  let loads = 0;
  page.on('load', () => (loads += 1));
  return { count: () => loads };
}

test('service worker: новый деплой включается сам при перезагрузке, без вопросов и без цикла', async ({ page }) => {
  const swText = readFileSync(join(siteA.dir, 'sw.js'), 'utf8');
  expect(swText).toContain('skipWaiting()');
  expect(swText).toContain('clientsClaim()');
  expect(swText).toContain('mf-pages-v1');
  // index.html не в предкэше (сеть сначала), и запросов API worker не касается.
  expect(swText).not.toContain('index.html');
  expect(swText).not.toMatch(/auth\/(login|me|logout)|apigw|\/materials['"?]/);

  await page.goto(`${origin}/`);
  await page.waitForFunction(() => navigator.serviceWorker?.controller !== null && navigator.serviceWorker?.controller !== undefined, null, { timeout: 30_000 });
  const scriptA = await mainScript(page);
  expect(scriptA).toContain('/assets/');
  // Копия страницы для офлайна лежит в кэше «сеть сначала».
  await expect.poll(() => page.evaluate(async () => (await caches.keys()).includes('mf-pages-v1'))).toBe(true);

  // Выкладка B. Обычная перезагрузка: браузер находит новый sw.js, worker встаёт и сам перезагружает страницу.
  live = 'B';
  const loads = countLoads(page);
  await page.reload();
  // Страница сама перезагружается: оценка во время перехода может упасть, тогда считаем, что скрипт ещё прежний.
  await expect.poll(() => mainScript(page).catch(() => scriptA), { timeout: 30_000 }).not.toBe(scriptA);
  await expect.poll(() => page.evaluate(() => fetch('/version.json', { cache: 'no-store' }).then((r) => r.json()).then((j) => j.id))).toBe(siteB.id);
  await page.waitForTimeout(4000);
  // Один ручной reload + не больше одной автоматической перезагрузки; потом тихо.
  const settled = loads.count();
  expect(settled).toBeLessThanOrEqual(3);
  await page.waitForTimeout(4000);
  expect(loads.count()).toBe(settled);
  // Никаких вопросов про обновление на экране.
  await expect(page.getByText(/обновить приложение|доступна новая версия|нажмите, чтобы обновить/i)).toHaveCount(0);
});

test('без service worker: устаревшая страница сама догоняет сборку (параметр обхода кэша)', async ({ page }) => {
  await page.goto(`${origin}/?demo=1`);
  await page.getByRole('heading', { name: /Кабинет партнёра/ }).waitFor();
  const scriptA = await mainScript(page);

  live = 'B';
  staleHtml = true; // кэш отдаёт старый HTML, version.json уже новый
  const loads = countLoads(page);
  await page.reload();
  // Страница сама перезагружается: оценка во время перехода может упасть, тогда считаем, что скрипт ещё прежний.
  await expect.poll(() => mainScript(page).catch(() => scriptA), { timeout: 30_000 }).not.toBe(scriptA);
  await page.waitForTimeout(3000);
  const settled = loads.count();
  expect(settled).toBeLessThanOrEqual(3);
  // Служебный параметр убран из адреса, когда страница свежая.
  await expect.poll(() => page.url()).not.toContain('_v=');
  await page.waitForTimeout(3000);
  expect(loads.count()).toBe(settled);
});

test('без service worker: упрямый кэш не вызывает бесконечную перезагрузку', async ({ page }) => {
  await page.goto(`${origin}/?demo=1`);
  await page.getByRole('heading', { name: /Кабинет партнёра/ }).waitFor();
  live = 'B';
  staleHtml = true;
  stubbornHtml = true; // и параметр обхода не помогает
  const loads = countLoads(page);
  await page.reload();
  await page.waitForTimeout(8000);
  const settled = loads.count();
  // Ручная загрузка + перезагрузка + обход кэша — и стоп.
  expect(settled).toBeLessThanOrEqual(4);
  await page.waitForTimeout(5000);
  expect(loads.count()).toBe(settled);
});
