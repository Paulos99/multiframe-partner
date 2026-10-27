import { spawn, execSync, type ChildProcess } from 'node:child_process';
import { existsSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, chromium, type Page } from '@playwright/test';

const PORT = 4195;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const MID = '/tmp/mf-carry-3ee8094';

function ensureMidCheckout() {
  if (!existsSync(path.join(MID, 'apps/web/src/main.tsx'))) {
    execSync(`git worktree add --detach ${MID} 3ee8094`, { cwd: ROOT, stdio: 'inherit' });
  }
  const modules = path.join(MID, 'apps/web/node_modules');
  if (!existsSync(modules)) symlinkSync(path.join(ROOT, 'apps/web/node_modules'), modules);
}

function startVite(cwd: string) {
  const child = spawn(
    'node',
    ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'],
    { cwd, env: { ...process.env, VITE_BASE: '/', BROWSER: 'none' }, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let log = '';
  child.stdout?.on('data', (buf) => {
    log += buf.toString();
  });
  child.stderr?.on('data', (buf) => {
    log += buf.toString();
  });
  return Object.assign(child, { log: () => log });
}

async function waitUp(child: ChildProcess & { log: () => string }) {
  for (let i = 0; i < 80; i += 1) {
    if (child.exitCode != null) throw new Error(`vite завершился ${child.exitCode}\n${child.log().slice(-2000)}`);
    try {
      const res = await fetch(ORIGIN);
      if (res.status < 500) return;
    } catch {
      /* ещё стартует */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`vite не поднялся\n${child.log().slice(-2000)}`);
}

async function stopVite(child: ChildProcess | null) {
  if (!child || child.killed) return;
  child.kill('SIGTERM');
  for (let i = 0; i < 40; i += 1) {
    if (child.exitCode != null) return;
    try {
      await fetch(ORIGIN);
    } catch {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  child.kill('SIGKILL');
}

async function signIn(page: Page) {
  const shell = page.getByRole('complementary', { name: 'Разделы кабинета' });
  const owner = page.getByRole('button', { name: 'Владелец Прайс и команда' }).first();
  await owner.or(shell).first().waitFor({ timeout: 30000 });
  if (await owner.isVisible().catch(() => false)) await owner.click();
  await expect(shell).toBeVisible({ timeout: 30000 });
}

async function clickThrough(page: Page) {
  await signIn(page);
  const quoted = page.getByRole('button', { name: /Никитин И\./ }).first();
  if (await quoted.isVisible().catch(() => false)) {
    await quoted.click();
  } else {
    await page.getByRole('tab', { name: 'Проекты', exact: true }).click();
    await page.locator('[data-room-id]').first().click();
  }
  const status = page.getByRole('group', { name: 'Сменить статус' });
  await status.waitFor();
  const install = status.getByRole('button', { name: 'Монтаж', exact: true });
  if (await install.isEnabled()) await install.click();
  const close = page.getByRole('button', { name: 'Закрыть', exact: true });
  if (await close.count()) await close.first().click();

  await page.getByRole('tab', { name: 'Сегодня', exact: true }).click();
  await page.getByRole('button', { name: 'Проблемомер', exact: true }).click();
  await page.getByRole('button', { name: 'Начать', exact: true }).click();
  const title = page.getByRole('heading', { name: 'Акустический профиль помещения' });
  for (let i = 0; i < 24; i += 1) {
    if (await title.isVisible().catch(() => false)) break;
    const area = page.getByPlaceholder('Например, 18');
    if (await area.isVisible().catch(() => false)) {
      await page.getByRole('button', { name: 'Спальня' }).first().click();
      await area.fill('18');
    }
    const next = page.getByRole('button', { name: 'Далее', exact: true });
    if ((await next.isVisible().catch(() => false)) && (await next.isEnabled().catch(() => false))) await next.click();
    await page.waitForTimeout(300);
  }
  await title.waitFor({ timeout: 30000 });
  const saveCard = page.getByRole('region', { name: 'Комната', exact: true });
  await saveCard.getByLabel('Комната', { exact: true }).fill('Кухня');
  await saveCard.getByPlaceholder('Имя').fill('Клиент');
  await saveCard.getByPlaceholder('+7…').fill('+70000000000');
  await saveCard.getByPlaceholder('Улица, дом, квартира').fill('Адрес');
  await saveCard.getByRole('button', { name: 'Сохранить комнату', exact: true }).click();
  await page.getByText('Комната сохранена').first().waitFor({ timeout: 20000 });

  await page.getByRole('button', { name: 'Кабинет', exact: true }).click();
  await page.getByRole('tab', { name: 'Сегодня', exact: true }).click();
  await page.getByRole('button', { name: 'Калькулятор', exact: true }).click();
  const frame = page.frameLocator('iframe[title="Калькулятор MultiFrame · партнёр"]');
  await frame.getByRole('heading', { name: 'Что вы знаете о помещении?' }).waitFor();
  await frame.getByRole('button', { name: /Ввести размеры/ }).click();
  const calc = frame.getByRole('button', { name: 'Рассчитать', exact: true });
  if (await calc.count()) await calc.click();
  await page.waitForTimeout(1500);
}

test('чекаут 3ee8094 ?demo=1, клики и HEAD без очистки не дают нули', async () => {
  test.setTimeout(180000);
  ensureMidCheckout();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  const session = await context.newCDPSession(page);
  await session.send('Network.setCacheDisabled', { cacheDisabled: true });
  page.setDefaultTimeout(20000);
  let vite: ReturnType<typeof startVite> | null = null;
  try {
    vite = startVite(path.join(MID, 'apps/web'));
    await waitUp(vite);
    await page.goto(`${ORIGIN}/?demo=1&debug=1`, { waitUntil: 'domcontentloaded' });
    await clickThrough(page);

    await stopVite(vite);
    vite = null;
    vite = startVite(path.join(ROOT, 'apps/web'));
    await waitUp(vite);
    await page.goto(`${ORIGIN}/?demo=1&debug=1`, { waitUntil: 'domcontentloaded' });
    await signIn(page);

    await page.getByRole('tab', { name: 'Аналитика', exact: true }).click();
    await page.getByRole('button', { name: /Панели/ }).first().click();
    const panels = page.getByRole('region', { name: 'Панели' });
    const report = panels.getByTestId('why-zero');
    await expect(report).toBeVisible();
    await expect(report).toContainText('Хранилище mf_partner_db_v5');
    const reportText = await report.innerText();
    expect(reportText).toMatch(/Комнат \d+/);
    expect(reportText).toMatch(/компания \d+/);
    expect(reportText).toMatch(/период \d+/);
    expect(reportText).toMatch(/исполнитель \d+/);
    expect(reportText).toMatch(/u_[a-z0-9]+ × \d+/i);

    await panels.getByRole('tab', { name: 'Монтажники' }).click();
    const mounted = () => panels.getByRole('button').filter({ hasText: 'Смонтировано' });
    for (const period of ['Месяц', 'Квартал', 'Год'] as const) {
      await panels.getByRole('button', { name: period, exact: true }).click();
      await expect.poll(async () => mounted().count()).toBeGreaterThan(0);
      const lines = await mounted().allInnerTexts();
      expect(lines.join('\n'), period).not.toContain('Смонтировано 0');
    }
    await page.goBack();
    await expect(page).not.toHaveURL(/#analytics\//);

    await page.getByRole('button', { name: /Площадь, м²/ }).first().click();
    const drill = page.getByRole('region', { name: 'Площадь, м²' });
    await drill.getByRole('tab', { name: 'Менеджеры' }).click();
    for (const period of ['Месяц', 'Квартал', 'Год'] as const) {
      await drill.getByRole('button', { name: period, exact: true }).click();
      await drill.getByRole('button', { name: /Менеджер · Потолки Столицы|Елена Крылова/ }).first().click();
      await expect(drill.getByText(/проекты 0/)).toHaveCount(0);
      await expect(drill.getByText('За период проектов нет')).toHaveCount(0);
      await expect(drill.getByRole('heading', { name: 'Топ проектов' })).toBeVisible();
      await drill.getByRole('button', { name: 'Назад', exact: true }).click();
    }
  } finally {
    await stopVite(vite);
    await browser.close();
  }
});
