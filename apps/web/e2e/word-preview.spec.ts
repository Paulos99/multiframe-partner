import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test, expect, type Page } from '@playwright/test';
import JSZip from 'jszip';

const password = 'ui-fixture-password-only';
const fixture = (name: string) => readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)));

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const DOC = 'application/msword';

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

/** Минимальный .docx с двумя ссылками: обычной и javascript:. */
async function hostileDocxBase64(): Promise<string> {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  );
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  );
  zip.file(
    'word/_rels/document.xml.rels',
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdBad" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="javascript:window.__pwned=1" TargetMode="External"/><Relationship Id="rIdOk" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com/" TargetMode="External"/></Relationships>',
  );
  zip.file(
    'word/document.xml',
    '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>' +
      '<w:p><w:r><w:t>Проверка безопасности</w:t></w:r></w:p>' +
      '<w:p><w:hyperlink r:id="rIdBad"><w:r><w:t>Плохая ссылка</w:t></w:r></w:hyperlink></w:p>' +
      '<w:p><w:hyperlink r:id="rIdOk"><w:r><w:t>Хорошая ссылка</w:t></w:r></w:hyperlink></w:p>' +
      '</w:body></w:document>',
  );
  return (await zip.generateAsync({ type: 'nodebuffer' })).toString('base64');
}

type Mat = { id: string; name: string; mime: string; size: number; hasPreview?: boolean };

async function enter(page: Page, files: Mat[], content: Record<string, string>, previews: Record<string, string> = {}) {
  const materials = files.map((f) => ({
    parentId: null,
    kind: 'file',
    stub: null,
    hasFile: true,
    updatedAt: '2026-10-01T00:00:00.000Z',
    hasPreview: false,
    ...f,
  }));
  await page.route('http://127.0.0.1:4181/materials', (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ materials }) })
      : route.continue(),
  );
  await page.route('http://127.0.0.1:4181/materials/*/content', (route) => {
    const id = new URL(route.request().url()).pathname.split('/')[2]!;
    const file = files.find((f) => f.id === id)!;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ name: file.name, mime: file.mime, base64: content[id] }),
    });
  });
  await page.route('http://127.0.0.1:4181/materials/*/preview', (route) => {
    const id = new URL(route.request().url()).pathname.split('/')[2]!;
    if (!previews[id]) {
      return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ message: 'нет' }) });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ name: 'copy.pdf', mime: 'application/pdf', base64: previews[id] }),
    });
  });
  await page.goto('/');
  await page.getByLabel('Логин', { exact: true }).fill('ui.owner');
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Разделы кабинета' })).toBeVisible();
  await page.getByRole('tab', { name: 'Обучение', exact: true }).first().click();
}

test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:4181/__reset');
});

const docxFile: Mat = { id: 'mat_kp', name: 'КП.docx', mime: DOCX, size: 6039 };

test('.docx opens in the preview window and shows its text', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await enter(page, [docxFile], { mat_kp: fixture('kp-sample.docx').toString('base64') });
  await page.getByRole('button', { name: /КП\.docx/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Просмотр: КП.docx' });
  await expect(dialog).toHaveAttribute('data-file-kind', 'docx');
  await expect(dialog.getByText('Коммерческое предложение MultiFrame')).toBeVisible({ timeout: 20000 });
  await expect(dialog.getByText('Итог по смете: 95 840 ₽')).toBeVisible();
  await expect(dialog.getByText('Дюбель')).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'Скачать' })).toHaveAttribute('download', 'КП.docx');
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('.docx output is sanitized: no javascript: links, external links open in a new tab', async ({ page }) => {
  await enter(page, [{ id: 'mat_bad', name: 'Ссылки.docx', mime: DOCX, size: 1200 }], { mat_bad: await hostileDocxBase64() });
  await page.getByRole('button', { name: /Ссылки\.docx/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Просмотр: Ссылки.docx' });
  await expect(dialog.getByText('Проверка безопасности')).toBeVisible({ timeout: 20000 });
  const audit = await page.getByTestId('word-preview').evaluate((host) => {
    const root = host.shadowRoot!;
    return {
      scripts: root.querySelectorAll('script,iframe,object,embed').length,
      hrefs: Array.from(root.querySelectorAll('a')).map((a) => ({ text: a.textContent, href: a.getAttribute('href'), target: a.getAttribute('target') })),
    };
  });
  expect(audit.scripts).toBe(0);
  expect(audit.hrefs.find((a) => a.text === 'Плохая ссылка')?.href ?? null).toBeNull();
  const good = audit.hrefs.find((a) => a.text === 'Хорошая ссылка');
  expect(good?.href).toBe('https://example.com/');
  expect(good?.target).toBe('_blank');
  await dialog.getByText('Плохая ссылка').click();
  expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
});

test('broken .docx shows an error with a download button', async ({ page }) => {
  await enter(page, [{ id: 'mat_broken', name: 'Битый.docx', mime: DOCX, size: 2 }], { mat_broken: Buffer.from('PK').toString('base64') });
  await page.getByRole('button', { name: /Битый\.docx/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Просмотр: Битый.docx' });
  await expect(dialog.getByRole('alert')).toBeVisible({ timeout: 20000 });
  await expect(dialog.getByRole('link', { name: /Скачать/ }).last()).toHaveAttribute('download', 'Битый.docx');
});

test('.doc without a PDF copy shows a clear message and download', async ({ page }) => {
  await enter(page, [{ id: 'mat_old', name: 'Старый договор.doc', mime: DOC, size: 10752 }], {
    mat_old: fixture('kp-legacy.doc').toString('base64'),
  });
  await page.getByRole('button', { name: /Старый договор\.doc/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Просмотр: Старый договор.doc' });
  await expect(dialog).toHaveAttribute('data-file-kind', 'doc');
  await expect(dialog.getByText('Старый формат Word (.doc) браузер не показывает', { exact: false })).toBeVisible();
  await expect(dialog.getByRole('link', { name: /Скачать/ }).last()).toHaveAttribute('download', 'Старый договор.doc');
});

test('.doc with a PDF copy shows the copy, download keeps the original', async ({ page }) => {
  await enter(
    page,
    [{ id: 'mat_old', name: 'Старый договор.doc', mime: DOC, size: 10752, hasPreview: true }],
    { mat_old: fixture('kp-legacy.doc').toString('base64') },
    { mat_old: tinyPdfBase64() },
  );
  await page.getByRole('button', { name: /Старый договор\.doc/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Просмотр: Старый договор.doc' });
  await expect(dialog.locator('[data-pdf-copy="true"] [data-testid="pdf-preview"] canvas').first()).toBeAttached({ timeout: 20000 });
  await expect(dialog.locator('iframe, object, embed')).toHaveCount(0);
  await expect(dialog.getByText('PDF-копия документа для просмотра', { exact: false })).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'Скачать' }).first()).toHaveAttribute('download', 'Старый договор.doc');
});

test('phone: .docx page is scaled to the screen width', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enter(page, [docxFile], { mat_kp: fixture('kp-sample.docx').toString('base64') });
  await page.getByRole('button', { name: /КП\.docx/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Просмотр: КП.docx' });
  await expect(dialog.getByText('Коммерческое предложение MultiFrame')).toBeVisible({ timeout: 20000 });
  const widths = await page.getByTestId('word-preview').evaluate((host) => {
    const page = host.shadowRoot!.querySelector('section') as HTMLElement;
    return { page: page.getBoundingClientRect().width, host: host.getBoundingClientRect().width };
  });
  expect(widths.page).toBeLessThanOrEqual(widths.host + 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
