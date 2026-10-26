import { test, expect, type Page } from '@playwright/test';
import JSZip from 'jszip';

const password = 'ui-fixture-password-only';
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** PDF из нескольких страниц A4 с текстом Helvetica (шрифт не встроен — нужен standard_fonts pdf.js). */
function textPdfBase64(pages: number): string {
  const objs: string[] = [];
  const kids: string[] = [];
  objs.push('<< /Type /Catalog /Pages 2 0 R >>');
  objs.push('PAGES');
  objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  for (let i = 0; i < pages; i += 1) {
    const stream = `BT /F1 36 Tf 60 720 Td (MultiFrame page ${i + 1}) Tj ET 0 0.4 0.3 rg 60 100 475 500 re f`;
    const contentId = objs.length + 1;
    objs.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    const pageId = objs.length + 1;
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`);
    kids.push(`${pageId} 0 R`);
  }
  objs[1] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pages} >>`;
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

// 4×4 PNG (зелёный).
const PNG4 =
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEklEQVR4nGNgYPiPhBioywEAGa0P8fYH1P8AAAAASUVORK5CYII=';

/**
 * .docx «из картинок», как гайд в «Обучении»: лист Letter, поля 0,6", картинка шириной 6,9"
 * (почти во всю ширину листа). На телефоне раньше лист вылезал за экран.
 */
async function imageDocxBase64(): Promise<string> {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  );
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  );
  zip.file(
    'word/_rels/document.xml.rels',
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdImg" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/></Relationships>',
  );
  zip.file('word/media/image1.png', Buffer.from(PNG4, 'base64'));
  const drawing =
    '<w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="6343650" cy="9086850"/><wp:docPr id="1" name="Picture 1"/>' +
    '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
    '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="1" name="image1.png"/><pic:cNvPicPr/></pic:nvPicPr>' +
    '<pic:blipFill><a:blip r:embed="rIdImg"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>' +
    '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="6343650" cy="9086850"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>' +
    '</a:graphicData></a:graphic></wp:inline></w:drawing>';
  // Вторая картинка обрезана сверху (srcRect), как фото панелей во втором листе гайда.
  const cropped = drawing
    .replace('cx="6343650" cy="9086850"/><wp:docPr id="1"', 'cx="5303473" cy="3033395"/><wp:docPr id="2"')
    .replace('<a:blip r:embed="rIdImg"/>', '<a:blip r:embed="rIdImg"/><a:srcRect t="20280"/>')
    .replace('<a:ext cx="6343650" cy="9086850"/>', '<a:ext cx="5303473" cy="3033395"/>');
  zip.file(
    'word/document.xml',
    '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><w:body>' +
      '<w:p><w:r><w:t>Гайд по оценке звукоизоляции</w:t></w:r></w:p>' +
      `<w:p><w:r>${drawing}</w:r></w:p>` +
      '<w:p><w:r><w:br w:type="page"/></w:r></w:p>' +
      `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r>${cropped}</w:r></w:p>` +
      '<w:p><w:r><w:t>Порядок акустической оценки</w:t></w:r></w:p>' +
      '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="765" w:right="879" w:bottom="765" w:left="879" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>' +
      '</w:body></w:document>',
  );
  return (await zip.generateAsync({ type: 'nodebuffer' })).toString('base64');
}

type Mat = { id: string; name: string; mime: string; size: number };

async function enter(page: Page, files: Mat[], content: Record<string, string>) {
  const materials = files.map((f) => ({ parentId: null, kind: 'file', stub: null, hasFile: true, hasPreview: false, updatedAt: '2026-10-01T00:00:00.000Z', ...f }));
  await page.route('http://127.0.0.1:4181/materials', (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ materials }) })
      : route.continue(),
  );
  await page.route('http://127.0.0.1:4181/materials/*/content', (route) => {
    const id = new URL(route.request().url()).pathname.split('/')[2]!;
    const file = files.find((f) => f.id === id)!;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ name: file.name, mime: file.mime, base64: content[id] }) });
  });
  await page.route('http://127.0.0.1:4181/materials/*/preview', (route) =>
    route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ message: 'нет' }) }),
  );
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

const pdfFile: Mat = { id: 'mat_ctaxrnbcp0df', name: '2.Коммерческое предложение.pdf', mime: 'application/pdf', size: 4000 };

async function inkRatio(page: Page): Promise<number> {
  return page.locator('[data-testid="pdf-preview"] [data-index="0"] canvas').evaluate((node) => {
    const canvas = node as HTMLCanvasElement;
    const ctx = canvas.getContext('2d')!;
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let ink = 0;
    for (let i = 0; i < data.length; i += 16) if (data[i]! < 200) ink += 1;
    return ink / (data.length / 16);
  });
}

for (const vp of [
  { name: 'phone', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 1000 },
]) {
  test(`${vp.name}: PDF renders with pdf.js on canvas, fits the width, has a page counter and zoom`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await enter(page, [pdfFile], { [pdfFile.id]: textPdfBase64(3) });
    await page.getByRole('button', { name: /Коммерческое предложение/ }).click();
    const dialog = page.getByRole('dialog', { name: `Просмотр: ${pdfFile.name}` });
    await expect(dialog).toHaveAttribute('data-file-kind', 'pdf');
    const viewer = dialog.getByTestId('pdf-preview');
    await expect(viewer.locator('[data-index="0"][data-drawn="true"] canvas')).toBeAttached({ timeout: 20000 });
    await expect(dialog.locator('iframe, object, embed')).toHaveCount(0);
    await expect(dialog.getByTestId('pdf-page-counter')).toHaveText('1 / 3');
    // Никакого «mat_…» вместо имени файла.
    await expect(dialog).not.toContainText('mat_');
    await expect(dialog.getByRole('heading', { level: 2 })).toHaveText(pdfFile.name);
    await expect(dialog.getByRole('link', { name: 'Скачать' })).toHaveAttribute('download', pdfFile.name);
    await expect(dialog.getByRole('link', { name: 'Открыть в новой вкладке' })).toHaveAttribute('target', '_blank');
    // На холсте есть текст и заливка — страница действительно нарисована.
    expect(await inkRatio(page)).toBeGreaterThan(0.05);
    const fit = await viewer.evaluate((el) => {
      const pageBox = el.querySelector('[data-index="0"]')!.getBoundingClientRect();
      const box = el.getBoundingClientRect();
      return { page: pageBox.width, left: pageBox.left - box.left, right: box.right - pageBox.right, box: box.width, scroll: el.scrollWidth, client: el.clientWidth };
    });
    expect(fit.scroll).toBeLessThanOrEqual(fit.client);
    expect(fit.left).toBeGreaterThanOrEqual(0);
    expect(fit.right).toBeGreaterThanOrEqual(0);
    if (vp.name === 'phone') expect(fit.page).toBeGreaterThan(fit.box - 40);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    // Прокрутка до последней страницы обновляет счётчик.
    await viewer.evaluate((el) => el.scrollTo(0, el.scrollHeight));
    await expect(dialog.getByTestId('pdf-page-counter')).toHaveText('3 / 3');
    await expect(viewer.locator('[data-index="2"][data-drawn="true"] canvas')).toBeAttached({ timeout: 20000 });

    // Масштаб: «+» увеличивает страницу, «По ширине» возвращает.
    const before = await viewer.locator('[data-index="2"]').evaluate((el) => el.getBoundingClientRect().width);
    await dialog.getByRole('button', { name: 'Увеличить' }).click();
    await expect(dialog.getByRole('button', { name: 'По ширине' })).toHaveText('125%');
    // Под reduced motion глобальный transition длится кадр — ждём, а не читаем сразу.
    await expect
      .poll(() => viewer.locator('[data-index="2"]').evaluate((el) => el.getBoundingClientRect().width))
      .toBeGreaterThan(before * 1.2);
    await dialog.getByRole('button', { name: 'По ширине' }).click();
    await expect(dialog.getByRole('button', { name: 'По ширине' })).toHaveText('100%');
    expect(errors).toEqual([]);
  });
}

test('phone: PDF that fails to load shows a download card, not the browser fallback', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enter(page, [pdfFile], { [pdfFile.id]: Buffer.from('not a pdf at all').toString('base64') });
  await page.getByRole('button', { name: /Коммерческое предложение/ }).click();
  const dialog = page.getByRole('dialog', { name: `Просмотр: ${pdfFile.name}` });
  await expect(dialog.getByRole('alert')).toBeVisible({ timeout: 20000 });
  await expect(dialog.getByRole('link', { name: /Скачать/ }).last()).toHaveAttribute('download', pdfFile.name);
  await expect(dialog).not.toContainText('mat_');
});

for (const width of [360, 390, 430]) {
  test(`phone ${width}px: image-heavy .docx page fits the screen width, no horizontal scroll`, async ({ page }) => {
    await page.setViewportSize({ width, height: 860 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const file: Mat = { id: 'mat_rzfs7elkp5vo', name: '4.Гайд по оценке звукоизоляции помещения.docx', mime: DOCX, size: 568042 };
    await enter(page, [file], { [file.id]: await imageDocxBase64() });
    await page.getByRole('button', { name: /Гайд по оценке/ }).click();
    const dialog = page.getByRole('dialog', { name: `Просмотр: ${file.name}` });
    await expect(dialog.getByText('Гайд по оценке звукоизоляции')).toBeVisible({ timeout: 20000 });
    const m = await page.getByTestId('word-preview').evaluate((host) => {
      const root = host.shadowRoot!;
      const scroll = root.querySelector('.mf-scroll') as HTMLElement;
      const section = root.querySelector('section') as HTMLElement;
      const img = root.querySelector('img') as HTMLElement;
      const h = host.getBoundingClientRect();
      const s = section.getBoundingClientRect();
      const i = img.getBoundingClientRect();
      return { hostL: h.left, hostR: h.right, secL: s.left, secR: s.right, secW: s.width, imgL: i.left, imgR: i.right, scrollW: scroll.scrollWidth, clientW: scroll.clientWidth };
    });
    // Весь лист и картинка внутри окна по ширине.
    expect(m.secL).toBeGreaterThanOrEqual(m.hostL - 1);
    expect(m.secR).toBeLessThanOrEqual(m.hostR + 1);
    expect(m.imgL).toBeGreaterThanOrEqual(m.hostL - 1);
    expect(m.imgR).toBeLessThanOrEqual(m.hostR + 1);
    // Лист занимает почти всю ширину экрана (а не крошечный).
    expect(m.secW).toBeGreaterThan(width - 40);
    expect(m.scrollW).toBeLessThanOrEqual(m.clientW);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    // Обрезанная картинка не наезжает на заголовок под ней.
    const crop = await page.getByTestId('word-preview').evaluate((host) => {
      const root = host.shadowRoot!;
      const img = root.querySelectorAll('img')[1] as HTMLElement;
      const box = img.parentElement!.getBoundingClientRect();
      const heading = Array.from(root.querySelectorAll('p')).find((p) => p.textContent === 'Порядок акустической оценки')!;
      return { boxBottom: box.bottom, headingTop: heading.getBoundingClientRect().top, overflow: getComputedStyle(img.parentElement!).overflow, clip: img.style.clipPath };
    });
    expect(crop.overflow).toBe('hidden');
    expect(crop.clip).toBe('');
    expect(crop.headingTop).toBeGreaterThanOrEqual(crop.boxBottom - 1);
  });
}

test('desktop: .docx keeps the natural page size (scale 1)', async ({ page }) => {
  const file: Mat = { id: 'mat_rzfs7elkp5vo', name: 'Гайд.docx', mime: DOCX, size: 568042 };
  await enter(page, [file], { [file.id]: await imageDocxBase64() });
  await page.getByRole('button', { name: /Гайд\.docx/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Просмотр: Гайд.docx' });
  await expect(dialog.getByText('Гайд по оценке звукоизоляции')).toBeVisible({ timeout: 20000 });
  const scale = await page.getByTestId('word-preview').evaluate((host) => (host.shadowRoot!.querySelector('.mf-scroll') as HTMLElement).dataset.scale);
  expect(scale).toBe('1.000');
  const secW = await page.getByTestId('word-preview').evaluate((host) => host.shadowRoot!.querySelector('section')!.getBoundingClientRect().width);
  // Letter 8,5" = 816 px.
  expect(Math.round(secW)).toBe(816);
});
