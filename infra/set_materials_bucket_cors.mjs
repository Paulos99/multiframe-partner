#!/usr/bin/env node
/**
 * Идемпотентно разрешает браузеру читать бакет материалов.
 *
 * Правило: GET, HEAD и PUT с origin https://paulos99.github.io.
 * HEAD нужен проигрывателю видео. PUT — только по подписанной ссылке,
 * которую API выдаёт админу StP (прямая и multipart-загрузка). ETag
 * открыт, чтобы браузер видел ответ на загрузку части. Бакет остаётся
 * приватным: без подписи ни чтение, ни запись не работают.
 *
 * Запускается из infra/deploy_yc.py при каждом деплое API или вручную:
 *   MATERIALS_BUCKET=multiframe-partner-materials \
 *   YC_ACCESS_KEY_ID=... YC_SECRET_ACCESS_KEY=... \
 *   node infra/set_materials_bucket_cors.mjs
 *
 * Бакет по умолчанию не выбирается. PARTNERS_BUCKET и multiframe-partner-data
 * этот скрипт не меняет. Повторный запуск не переписывает уже подходящее правило.
 */
import { createRequire } from 'node:module';

const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const {
  S3Client,
  GetBucketCorsCommand,
  PutBucketCorsCommand,
} = require('@aws-sdk/client-s3');

const ORIGIN = 'https://paulos99.github.io';
const METHODS = ['GET', 'HEAD', 'PUT'];
const EXPOSE = ['Accept-Ranges', 'Content-Disposition', 'Content-Length', 'Content-Type', 'ETag'];

function fail(message) {
  console.error(message);
  process.exit(1);
}

const bucket = String(process.env.MATERIALS_BUCKET || '').trim();
const partners = String(process.env.PARTNERS_BUCKET || '').trim();
const accessKeyId = String(process.env.YC_ACCESS_KEY_ID || '').trim();
const secretAccessKey = String(process.env.YC_SECRET_ACCESS_KEY || '').trim();

if (!bucket) {
  fail('Задайте MATERIALS_BUCKET. Скрипт не выбирает бакет по умолчанию.');
}
if (bucket === 'multiframe-partner-data' || (partners && bucket === partners)) {
  fail('Отказ: CORS бакета кабинета не меняю. MATERIALS_BUCKET должен быть отдельным бакетом материалов.');
}
if (!accessKeyId || !secretAccessKey) {
  fail('Нужны YC_ACCESS_KEY_ID и YC_SECRET_ACCESS_KEY.');
}

function originsOf(rule) {
  return rule.AllowedOrigins || rule.allowedOrigins || [];
}

function methodsOf(rule) {
  return (rule.AllowedMethods || rule.allowedMethods || []).map((item) => String(item).toUpperCase());
}

function ruleAllowsRead(rule) {
  return originsOf(rule).includes(ORIGIN) && METHODS.every((method) => methodsOf(rule).includes(method));
}

const client = new S3Client({
  region: process.env.YC_REGION || 'ru-central1',
  endpoint: 'https://storage.yandexcloud.net',
  credentials: { accessKeyId, secretAccessKey },
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
});

let existing = [];
try {
  const current = await client.send(new GetBucketCorsCommand({ Bucket: bucket }));
  existing = current.CORSRules || current.CORSConfiguration?.CORSRules || [];
} catch (error) {
  const name = error?.name || '';
  const code = error?.Code || error?.code || '';
  if (name !== 'NoSuchCORSConfiguration' && code !== 'NoSuchCORSConfiguration') {
    fail(`Не удалось прочитать CORS бакета ${bucket}: ${error?.message || error}`);
  }
}

if (existing.some(ruleAllowsRead) && existing.some((rule) => (rule.ExposeHeaders || []).includes('ETag'))) {
  console.log(`CORS уже разрешает ${METHODS.join(',')} с ${ORIGIN} для ${bucket}. Изменений нет.`);
  process.exit(0);
}

// Старое правило нашего origin (только чтение) заменяем, чужие правила не трогаем.
const next = [
  ...existing.filter((rule) => !(originsOf(rule).length === 1 && originsOf(rule)[0] === ORIGIN)),
  {
    AllowedOrigins: [ORIGIN],
    AllowedMethods: METHODS,
    AllowedHeaders: ['*'],
    ExposeHeaders: EXPOSE,
    MaxAgeSeconds: 3600,
  },
];

await client.send(
  new PutBucketCorsCommand({
    Bucket: bucket,
    CORSConfiguration: { CORSRules: next },
  }),
);
console.log(`CORS бакета ${bucket}: разрешены ${METHODS.join(',')} с ${ORIGIN}. Правил теперь ${next.length}.`);
