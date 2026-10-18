import assert from 'node:assert/strict';
import test from 'node:test';

process.env.PARTNERS_BUCKET = 'multiframe-partner-data';
process.env.MATERIALS_BUCKET = 'multiframe-partner-materials';
process.env.YC_ACCESS_KEY_ID = 'YCAJEtestaccesskey123';
process.env.YC_SECRET_ACCESS_KEY = 'test-secret-key-with-enough-length';
process.env.YC_REGION = 'ru-central1';

const { signedMaterialGetUrl } = await import('./materialsStorage.js');

function bucketOf(url) {
  const parsed = new URL(url);
  if (parsed.hostname.endsWith('.storage.yandexcloud.net') && parsed.hostname !== 'storage.yandexcloud.net') {
    return parsed.hostname.slice(0, -'.storage.yandexcloud.net'.length);
  }
  return parsed.pathname.split('/').filter(Boolean)[0] || '';
}

test('подписанный GET нового файла указывает на бакет материалов и живёт 15 минут', async () => {
  const url = await signedMaterialGetUrl(
    {
      storageKey: 'materials/mat_newfile',
      bucket: 'materials',
      name: 'Схема.pdf',
      mime: 'application/pdf',
    },
    { filename: 'Схема.pdf', mime: 'application/pdf' },
  );
  const parsed = new URL(url);
  assert.equal(parsed.protocol, 'https:');
  assert.match(parsed.hostname, /(^|\.)storage\.yandexcloud\.net$/);
  assert.equal(bucketOf(url), 'multiframe-partner-materials');
  assert.match(decodeURIComponent(parsed.pathname), /materials\/mat_newfile/);
  assert.equal(parsed.searchParams.get('X-Amz-Expires'), '900');
  assert.equal(parsed.searchParams.get('X-Amz-Algorithm'), 'AWS4-HMAC-SHA256');
  assert.match(parsed.searchParams.get('response-content-disposition') || '', /^inline/i);
  assert.equal(bucketOf(url) === 'multiframe-partner-data', false);
});

test('старый узел без bucket подписывается только на чтение из бакета кабинета', async () => {
  const url = await signedMaterialGetUrl({
    storageKey: 'materials/mat_oldfile',
    name: 'Архив.mp4',
    mime: 'video/mp4',
  });
  const parsed = new URL(url);
  assert.equal(bucketOf(url), 'multiframe-partner-data');
  assert.match(decodeURIComponent(parsed.pathname), /materials\/mat_oldfile/);
  assert.equal(parsed.searchParams.get('X-Amz-Expires'), '900');
  assert.match(parsed.searchParams.get('response-content-disposition') || '', /^inline/i);
  assert.equal(url.includes('multiframe-partner-materials'), false);
});

test('подписанный PUT указывает на бакет материалов и не фиксирует Content-Type', async () => {
  const { signMaterialUpload } = await import('./materialsStorage.js');
  const signed = await signMaterialUpload('materials/mat_largevideo');
  const parsed = new URL(signed.url);
  assert.equal(parsed.protocol, 'https:');
  assert.match(parsed.hostname, /(^|\.)storage\.yandexcloud\.net$/);
  assert.equal(bucketOf(signed.url), 'multiframe-partner-materials');
  assert.match(decodeURIComponent(parsed.pathname), /materials\/mat_largevideo/);
  assert.equal(parsed.searchParams.get('X-Amz-Expires'), '3600');
  assert.equal(parsed.searchParams.get('X-Amz-Algorithm'), 'AWS4-HMAC-SHA256');
  const signedHeaders = String(parsed.searchParams.get('X-Amz-SignedHeaders') || '').toLowerCase();
  assert.equal(signedHeaders.includes('content-type'), false);
  assert.equal(signed.url.includes('multiframe-partner-data'), false);
  await assert.rejects(() => signMaterialUpload('platform-v2.json'), /Некорректный ключ/);
  await assert.rejects(() => signMaterialUpload('materials/mat_ok/extra'), /Некорректный ключ/);
  await assert.rejects(() => signMaterialUpload('docs/org/file.pdf'), /Некорректный ключ/);
});

test('файл не для просмотра получает ссылку на скачивание', async () => {
  const url = await signedMaterialGetUrl({
    storageKey: 'materials/mat_sheet',
    bucket: 'materials',
    name: 'Прайс.docx',
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  const parsed = new URL(url);
  assert.match(parsed.searchParams.get('response-content-disposition') || '', /^attachment/i);
});
