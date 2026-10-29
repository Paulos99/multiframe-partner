import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPhotoReportHtml,
  paginatePhotos,
  reportDate,
  reportPeriod,
  type ReportPhoto,
} from './photos/photoReportHtml';

const DOT = 'data:image/jpeg;base64,/9j/4AAQ';

function photo(stage: ReportPhoto['stage'], day: number, month = 3): ReportPhoto {
  return { stage, createdAt: new Date(2026, month - 1, day, 12).toISOString(), dataUrl: DOT };
}

test('дата и период съёмки по-русски', () => {
  assert.equal(reportDate(new Date(2026, 2, 12, 12).toISOString()), '12 марта 2026');
  assert.equal(reportPeriod([photo('before', 12)]), '12 марта 2026');
  assert.equal(reportPeriod([photo('after', 14), photo('before', 12)]), '12 марта – 14 марта 2026');
  assert.equal(reportPeriod([photo('before', 30, 12), photo('after', 5, 12)]), '5 декабря – 30 декабря 2026');
  assert.equal(reportPeriod([]), '');
});

test('PDF: название комнаты, этапы в порядке до → в процессе → после, даты, без цен и подписей', () => {
  const html = buildPhotoReportHtml({
    roomName: 'Спальня <b>Иванова</b>',
    photos: [photo('after', 14), photo('before', 12), photo('progress', 13), photo('before', 12)],
  });
  assert.match(html, /Фотоотчёт/);
  assert.match(html, /Спальня &lt;b&gt;Иванова&lt;\/b&gt;/, 'название экранируется');
  const order = ['До', 'В процессе', 'После'].map((label) => html.indexOf(`<h2 class="stage">${label}`));
  assert.ok(order.every((i) => i > 0));
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  assert.match(html, /12 марта 2026/);
  assert.match(html, /Дата съёмки: 12 марта – 14 марта 2026/);
  assert.equal((html.match(/<img /g) || []).length, 4);
  for (const banned of ['₽', 'руб', 'Цена', 'Смета', 'Итого', 'Подпись', 'authorName', '+7', 'тел']) {
    assert.ok(!html.includes(banned), `в PDF нет «${banned}»`);
  }
});

test('пустой этап в PDF не выводится', () => {
  const html = buildPhotoReportHtml({ roomName: 'Кухня', photos: [photo('before', 1)] });
  assert.ok(html.includes('<h2 class="stage">До'));
  assert.ok(!html.includes('<h2 class="stage">После'));
  assert.ok(!html.includes('<h2 class="stage">В процессе'));
  assert.match(html, /Страница 1 из 1/);
});

test('много фото уходит на следующие страницы, у этапа есть «продолжение»', () => {
  const photos = Array.from({ length: 16 }, (_, i) => photo('before', 1 + (i % 20)));
  const pages = paginatePhotos(photos);
  assert.ok(pages.length >= 3, `страниц: ${pages.length}`);
  const rows = pages.flat().filter((b) => b.kind === 'row');
  assert.equal(rows.reduce((n, b) => n + (b.kind === 'row' ? b.photos.length : 0), 0), 16);
  assert.ok(pages.slice(1).every((page) => page[0]?.kind === 'stage'), 'каждая следующая страница начинается с заголовка этапа');
  const html = buildPhotoReportHtml({ roomName: 'Зал', photos });
  assert.match(html, /продолжение/);
  assert.match(html, new RegExp(`Страница ${pages.length} из ${pages.length}`));
});

test('заголовок этапа не остаётся один в конце страницы', () => {
  const photos = [...Array.from({ length: 5 }, (_, i) => photo('before', i + 1)), photo('after', 9)];
  for (const page of paginatePhotos(photos)) {
    const last = page[page.length - 1];
    assert.notEqual(last?.kind, 'stage');
  }
});
