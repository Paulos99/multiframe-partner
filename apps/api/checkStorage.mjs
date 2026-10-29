#!/usr/bin/env node
/**
 * Проверка хранилища перед первым запуском на своём сервере (и после смены хранилища).
 * Запуск (из корня репозитория, на сервере):
 *   docker compose --env-file deploy/.env -f deploy/docker-compose.yml run --rm --no-deps api node checkStorage.mjs
 * Читает те же переменные, что и API (S3_ENDPOINT, S3_*, PARTNERS_BUCKET, MATERIALS_BUCKET).
 * Для каждого бакета проверяет: запись, условную запись (If-None-Match / If-Match — на ней держатся
 * документы платформы), чтение, подписанные ссылки на чтение и запись, удаление.
 * Пишет и удаляет только объекты с ключом `_check/…`. Ключи и пароли не печатает.
 * Код выхода 0 — всё хорошо, 1 — есть ошибки.
 */
import { randomBytes } from 'node:crypto';
import {
  deleteObject,
  headObject,
  isStorageConflict,
  materialsBucket,
  materialsConfigError,
  partnerBucket,
  putObject,
  readObjectText,
  signGetObject,
  signPutObject,
} from './objectStore.js';

let failed = 0;

function ok(text) {
  console.log(`  ✓ ${text}`);
}
function bad(text, error) {
  failed += 1;
  const why = error ? `: ${String(error?.name || '')} ${String(error?.message || error)}`.replace(/\s+/g, ' ') : '';
  console.log(`  ✗ ${text}${why}`);
}

async function step(text, fn) {
  try {
    await fn();
    ok(text);
    return true;
  } catch (error) {
    bad(text, error);
    return false;
  }
}

async function expectConflict(text, fn) {
  try {
    await fn();
    bad(`${text} — хранилище НЕ отклонило запись (условная запись не поддерживается)`);
  } catch (error) {
    if (isStorageConflict(error)) ok(text);
    else bad(text, error);
  }
}

async function checkBucket(label, bucket) {
  console.log(`\nБакет «${label}»`);
  const key = `_check/${Date.now()}-${randomBytes(4).toString('hex')}.txt`;
  let etag = '';
  const made = await step('создание объекта (If-None-Match: *)', async () => {
    const out = await putObject({ bucket, key, body: 'one', contentType: 'text/plain', ifNoneMatch: '*' });
    etag = out.etag;
    if (!etag) throw new Error('хранилище не вернуло ETag');
  });
  if (!made) return;
  await expectConflict('повторное создание отклонено (If-None-Match: *)', () =>
    putObject({ bucket, key, body: 'two', contentType: 'text/plain', ifNoneMatch: '*' }),
  );
  await expectConflict('запись с чужим ETag отклонена (If-Match)', () =>
    putObject({ bucket, key, body: 'two', contentType: 'text/plain', ifMatch: '"00000000000000000000000000000000"' }),
  );
  await step('запись со своим ETag принята (If-Match)', async () => {
    const out = await putObject({ bucket, key, body: 'three', contentType: 'text/plain', ifMatch: etag });
    if (!out.etag) throw new Error('хранилище не вернуло ETag');
  });
  await step('чтение возвращает последнюю запись', async () => {
    const got = await readObjectText({ bucket, key });
    if (got.missing || got.body !== 'three') throw new Error('прочитано не то, что записано');
  });
  await step('подписанная ссылка на чтение работает (с сервера API)', async () => {
    const url = await signGetObject({ bucket, key, expiresIn: 120 });
    const res = await fetch(url);
    if (!res.ok || (await res.text()) !== 'three') throw new Error(`ответ ${res.status}`);
  });
  await step('подписанная ссылка на запись работает (с сервера API)', async () => {
    const url = await signPutObject({ bucket, key: `${key}.put`, expiresIn: 120 });
    const res = await fetch(url, { method: 'PUT', body: 'four' });
    if (!res.ok) throw new Error(`ответ ${res.status}`);
    const head = await headObject({ bucket, key: `${key}.put` });
    if (head.missing) throw new Error('объект не появился');
    await deleteObject({ bucket, key: `${key}.put` });
  });
  await step('удаление', async () => {
    await deleteObject({ bucket, key });
    const head = await headObject({ bucket, key });
    if (!head.missing) throw new Error('объект остался');
  });
}

async function main() {
  const endpoint = String(process.env.S3_ENDPOINT || '').trim() || 'https://storage.yandexcloud.net (по умолчанию)';
  console.log(`Хранилище: ${endpoint}`);
  const partners = partnerBucket();
  const materials = materialsBucket();
  const haveKeys =
    Boolean(process.env.S3_ACCESS_KEY_ID || process.env.YC_ACCESS_KEY_ID) &&
    Boolean(process.env.S3_SECRET_ACCESS_KEY || process.env.YC_SECRET_ACCESS_KEY);
  if (!haveKeys) bad('не заданы S3_ACCESS_KEY_ID и S3_SECRET_ACCESS_KEY');
  if (!partners) bad('не задан PARTNERS_BUCKET');
  const cfg = materialsConfigError();
  if (cfg) bad(cfg);
  if (failed) {
    console.log('\nНастройки неполные: проверьте deploy/.env.');
    process.exit(1);
  }
  await checkBucket('PARTNERS_BUCKET (документы, фото, PDF)', partners);
  await checkBucket('MATERIALS_BUCKET (материалы)', materials);
  console.log(
    failed
      ? `\nОШИБОК: ${failed}. Запускать кабинет рано: исправьте хранилище и повторите проверку.`
      : '\nВсё в порядке. Осталось проверить из браузера: CORS бакета материалов (docs/handover/DATA_LAYER.md).',
  );
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.log(`Проверка прервана: ${String(error?.message || error)}`);
  process.exit(1);
});
