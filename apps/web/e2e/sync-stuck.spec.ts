import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, type Page } from '@playwright/test';

/**
 * Застрявшие PDF в очереди: «Отправить сейчас» снимает окончательные ошибки,
 * полоса на ПК пишет «На этом компьютере», а не «На телефоне».
 */
const shots = process.env.REVIEW_SHOTS_DIR || '/workspace/handover/screenshots-sync-stuck';
mkdirSync(shots, { recursive: true });

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `${shots}/${name}`, fullPage: true });
}

async function enter(page: Page, login: string) {
  await page.goto('/');
  await page.getByLabel('Логин', { exact: true }).fill(login);
  await page.getByLabel('Пароль', { exact: true }).fill('ui-fixture-password-only');
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Проекты', exact: true })).toBeVisible();
}

const tinyPdf = Buffer.from('%PDF-1.4\n%%EOF\n').toString('base64');

test('застрявшие PDF: полоса на ПК, «Отправить сейчас» снимает их с очереди', async ({ page }) => {
  await enter(page, 'ui.measurer');
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.evaluate(
    ({ pdf }) => {
      const docs = [0, 1, 2, 3, 4].map((i) => ({
        objectId: `obj_gone_${i}`,
        versionId: `ver_stuck_${i}`,
        kind: 'estimate',
        filename: `смета-застряла-${i + 1}.pdf`,
        pdfBase64: pdf,
        hasScheme: true,
        roomName: `Комната ${i + 1}`,
        // Уже «ошибка»: автоотправка их не трогает, пока не нажмут «Отправить сейчас».
        failed: true,
        attempts: 5,
        lastError: 'Комната не найдена',
      }));
      localStorage.setItem('mf_partner_doc_queue_v1', JSON.stringify(docs));
      // Свежая синхронизация, чтобы полоса шла только от очереди, а не «больше суток».
      localStorage.setItem(
        'mf_partner_last_sync_v1',
        JSON.stringify({ ui_measurer: new Date().toISOString() }),
      );
    },
    { pdf: tinyPdf },
  );
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Проекты', exact: true })).toBeVisible();

  const banner = page.getByTestId('sync-banner');
  await expect(banner).toBeVisible({ timeout: 15000 });
  await expect(banner).toContainText('5 PDF');
  await expect(banner).toContainText('На этом компьютере');
  await expect(banner).not.toContainText('На телефоне');
  await shot(page, 'sync-stuck-before.png');

  await banner.getByRole('button', { name: 'Отправить сейчас' }).click();
  // Окончательная ошибка (комнаты нет) снимает собираемые PDF.
  await expect(banner).toHaveCount(0, { timeout: 30000 });
  await expect(page.getByTestId('sync-status').first()).toHaveAttribute('aria-label', 'Всё отправлено', {
    timeout: 15000,
  });
  await shot(page, 'sync-stuck-after.png');

  const left = await page.evaluate(() => {
    try {
      return JSON.parse(localStorage.getItem('mf_partner_doc_queue_v1') || '[]').length;
    } catch {
      return -1;
    }
  });
  expect(left).toBe(0);
});
