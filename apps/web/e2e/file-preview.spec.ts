import { test, expect, type Page } from '@playwright/test';

const password = 'ui-fixture-password-only';

function tinyPdfBase64(): string {
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>',
  ];
  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((off) => (body += `${String(off).padStart(10, '0')} 00000 n \n`));
  body += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, 'latin1').toString('base64');
}

// 1×1 PNG.
const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkaPhfDwAFhwJ/lXcFJgAAAABJRU5ErkJggg==';

const materials = [
  { id: 'mat_pdf', parentId: null, kind: 'file', name: 'Инструкция.pdf', mime: 'application/pdf', size: 600, stub: null, hasFile: true, updatedAt: '2026-10-01T00:00:00.000Z' },
  { id: 'mat_png', parentId: null, kind: 'file', name: 'Схема.png', mime: 'image/png', size: 70, stub: null, hasFile: true, updatedAt: '2026-10-01T00:00:00.000Z' },
  { id: 'mat_doc', parentId: null, kind: 'file', name: 'Договор.docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 20480, stub: null, hasFile: true, updatedAt: '2026-10-01T00:00:00.000Z' },
];
const content: Record<string, { name: string; mime: string; base64: string }> = {
  mat_pdf: { name: 'Инструкция.pdf', mime: 'application/pdf', base64: tinyPdfBase64() },
  mat_png: { name: 'Схема.png', mime: 'image/png', base64: PNG },
  mat_doc: { name: 'Договор.docx', mime: materials[2]!.mime, base64: Buffer.from('PK').toString('base64') },
};

test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:4181/__reset');
});

async function enter(page: Page) {
  await page.route('http://127.0.0.1:4181/materials', (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ materials }) })
      : route.continue(),
  );
  await page.route('http://127.0.0.1:4181/materials/*/content', (route) => {
    const id = new URL(route.request().url()).pathname.split('/')[2]!;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(content[id]) });
  });
  await page.goto('/');
  await page.getByLabel('Логин', { exact: true }).fill('ui.owner');
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Разделы кабинета' })).toBeVisible();
  await page.getByRole('tab', { name: 'Обучение', exact: true }).first().click();
}

test('preview opens PDF and image, navigates with arrows and closes', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await enter(page);
  await page.getByRole('button', { name: /Инструкция\.pdf/ }).click();

  const dialog = page.getByRole('dialog', { name: 'Просмотр: Инструкция.pdf' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('data-file-kind', 'pdf');
  // PDF рисует pdf.js на холсте — без iframe (мобильный браузер не показывает PDF во фрейме).
  await expect(dialog.locator('[data-testid="pdf-preview"] canvas').first()).toBeAttached({ timeout: 20000 });
  await expect(dialog.locator('iframe, object, embed')).toHaveCount(0);
  await expect(dialog.getByRole('link', { name: 'Скачать' })).toHaveAttribute('download', 'Инструкция.pdf');
  await expect(dialog.getByRole('link', { name: 'Открыть в новой вкладке' })).toHaveAttribute('target', '_blank');
  await expect(dialog.getByText(/2 из 3/)).toBeVisible();
  // Фокус внутри окна сразу после открытия.
  await expect(dialog.getByRole('button', { name: 'Закрыть' })).toBeFocused();

  await page.keyboard.press('ArrowRight');
  const image = page.getByRole('dialog', { name: 'Просмотр: Схема.png' });
  await expect(image).toHaveAttribute('data-file-kind', 'image');
  await expect(image.getByRole('img', { name: 'Схема.png' })).toHaveAttribute('data-ready', 'true');
  await image.getByRole('button', { name: 'Увеличить' }).click();
  await expect(image.getByRole('button', { name: 'Сбросить масштаб' })).toHaveText('140%');
  await image.getByRole('button', { name: 'Сбросить масштаб' }).click();
  await expect(image.getByRole('button', { name: 'Сбросить масштаб' })).toHaveText('100%');

  await image.getByRole('button', { name: 'Следующий файл' }).click();
  const doc = page.getByRole('dialog', { name: 'Просмотр: Договор.docx' });
  await expect(doc).toHaveAttribute('data-file-kind', 'docx');
  // Содержимое — не настоящий .docx: окно показывает ошибку и даёт скачать файл.
  await expect(doc.getByRole('alert')).toBeVisible();
  await expect(doc.getByRole('link', { name: /Скачать/ }).last()).toHaveAttribute('download', 'Договор.docx');

  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('dialog', { name: 'Просмотр: Инструкция.pdf' })).toBeVisible();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('dialog', { name: 'Просмотр: Договор.docx' })).toBeVisible();

  // Tab не выходит за пределы окна.
  for (let i = 0; i < 8; i += 1) await page.keyboard.press('Tab');
  expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true);

  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // Фокус возвращается на строку материала.
  await expect(page.getByRole('button', { name: /Инструкция\.pdf/ })).toBeFocused();

  await page.getByRole('button', { name: /Схема\.png/ }).click();
  await expect(page.getByRole('dialog', { name: 'Просмотр: Схема.png' })).toBeVisible();
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('preview shows an error with download fallback when loading fails', async ({ page }) => {
  await enter(page);
  await page.unroute('http://127.0.0.1:4181/materials/*/content');
  await page.route('http://127.0.0.1:4181/materials/*/content', (route) =>
    route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'Хранилище недоступно' }) }),
  );
  await page.getByRole('button', { name: /Инструкция\.pdf/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Просмотр: Инструкция.pdf' });
  await expect(dialog.getByRole('alert')).toContainText('Хранилище недоступно');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('phone: preview is full screen and stays inside the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enter(page);
  await page.getByRole('button', { name: /Схема\.png/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Просмотр: Схема.png' });
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  // Допуск — под классическую полосу прокрутки десктопного Chromium (на телефонах она накладная).
  expect(box?.width || 0).toBeGreaterThanOrEqual(390 - 16);
  expect(box?.x || 0).toBeLessThanOrEqual(1);
  expect(Math.round(box?.height || 0)).toBe(844);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await dialog.getByRole('button', { name: 'Закрыть' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
