/**
 * Дописывает демо-показатели компании «Потолки Столицы» до round(«Северный Потолок» × 1.3).
 * Ничего не удаляет и не меняет другие компании, объекты и уже существующих пользователей.
 *
 * Локальная копия:
 *   node scripts/boost-capital-analytics.mjs --dry-run --platform ./platform-v2.json --events ./analytics-events.json
 *   node scripts/boost-capital-analytics.mjs --platform ./platform-v2.json --events ./analytics-events.json
 *
 * Боевой бакет — только вручную, после проверки dry-run. Этот файл сам по себе туда не ходит.
 *   node scripts/boost-capital-analytics.mjs --s3 --dry-run
 *   node scripts/boost-capital-analytics.mjs --s3 --confirm-bucket
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { sealDisabledDemoUsers } from '../apps/api/sealDemoUsers.js';
import {
  applyCapitalDemoBoost,
  assertBoostIsAdditive,
  boostSummary,
} from '../packages/shared/demoAnalyticsBoost.js';

const args = new Set(process.argv.slice(2));

function option(name) {
  const index = process.argv.indexOf(name);
  if (index < 0) return '';
  return process.argv[index + 1] || '';
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function eventsOf(raw) {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.events)) return raw.events;
  throw new Error('Файл аналитики должен быть массивом или объектом { events }');
}

function packEvents(raw, events) {
  if (Array.isArray(raw)) return events;
  return { ...raw, events };
}

function printSummary(rows, addedUsers, addedEvents, dryRun) {
  const header = ['Показатель', 'Северный Потолок', 'было', 'цель', 'станет', 'добавить'];
  const widths = header.map((cell) => cell.length);
  const body = rows.map((row) => [
    row.label,
    String(row.north),
    String(row.before),
    String(row.target),
    String(row.after),
    String(row.added),
  ]);
  for (const line of body) {
    line.forEach((cell, index) => {
      widths[index] = Math.max(widths[index], cell.length);
    });
  }
  const format = (line) => line.map((cell, index) => cell.padEnd(widths[index])).join('  ');
  console.log('Потолки Столицы относительно Северного Потолка, цель ×1.3 с округлением до целого');
  console.log(format(header));
  for (const line of body) console.log(format(line));
  console.log(`Событий добавить: ${addedEvents.length}`);
  console.log(`Сотрудников добавить: ${addedUsers.length}`);
  for (const user of addedUsers) {
    console.log(
      `Демо-сотрудник ${user.login}, роль ${user.role}, вход отключён, известного пароля нет`,
    );
  }
  console.log('Объекты, другие компании и существующие пользователи не меняются');
  if (dryRun) console.log('Режим: dry-run, файлы не записаны');
  else if (!addedUsers.length && !addedEvents.length) {
    console.log('Режим: добавлять нечего, файлы не записаны');
  } else console.log('Режим: запись выполнена');
}

function boostLoaded(platform, rawEvents) {
  const events = eventsOf(rawEvents);
  const beforePlatform = platform;
  const beforeEvents = events;
  const boosted = applyCapitalDemoBoost(beforePlatform, beforeEvents);
  const sealed = sealDisabledDemoUsers(boosted.platform);
  assertBoostIsAdditive(beforePlatform, beforeEvents, sealed, boosted.events);
  return {
    platform: sealed,
    events: packEvents(rawEvents, boosted.events),
    rows: boostSummary(beforePlatform, beforeEvents, sealed, boosted.events),
    addedUsers: (sealed.users || []).filter(
      (user) => !(beforePlatform.users || []).some((item) => item.id === user.id),
    ),
    addedEvents: boosted.addedEvents,
  };
}

function loadS3Creds() {
  const path = join(homedir(), '.yc', 'partner-storage.json');
  try {
    const saved = JSON.parse(readFileSync(path, 'utf8'));
    return {
      bucket: process.env.PARTNERS_BUCKET || saved.PARTNERS_BUCKET,
      accessKeyId: process.env.YC_ACCESS_KEY_ID || saved.YC_ACCESS_KEY_ID,
      secretAccessKey: process.env.YC_SECRET_ACCESS_KEY || saved.YC_SECRET_ACCESS_KEY,
      region: process.env.YC_REGION || saved.YC_REGION || 'ru-central1',
    };
  } catch {
    return {
      bucket: process.env.PARTNERS_BUCKET,
      accessKeyId: process.env.YC_ACCESS_KEY_ID,
      secretAccessKey: process.env.YC_SECRET_ACCESS_KEY,
      region: process.env.YC_REGION || 'ru-central1',
    };
  }
}

async function loadS3() {
  const requireFromApi = createRequire(new URL('../apps/api/package.json', import.meta.url));
  const entry = requireFromApi.resolve('@aws-sdk/client-s3');
  return import(pathToFileURL(entry).href);
}

async function runS3(dryRun, confirm) {
  if (!dryRun && !confirm) {
    throw new Error('Запись в бакет требует --confirm-bucket. Сначала посмотрите --s3 --dry-run');
  }
  const creds = loadS3Creds();
  if (!creds.bucket || !creds.accessKeyId || !creds.secretAccessKey) {
    throw new Error('Нет ключей бакета (partner-storage.json или env). Запись не начата');
  }
  const { S3Client, GetObjectCommand, PutObjectCommand } = await loadS3();
  const client = new S3Client({
    region: creds.region,
    endpoint: 'https://storage.yandexcloud.net',
    credentials: {
      accessKeyId: creds.accessKeyId,
      secretAccessKey: creds.secretAccessKey,
    },
  });
  const platformKey = process.env.PLATFORM_KEY || 'platform-v2.json';
  const eventsKey = process.env.ANALYTICS_KEY || 'analytics-events.json';
  const platformRaw = await client.send(new GetObjectCommand({ Bucket: creds.bucket, Key: platformKey }));
  const eventsRaw = await client.send(new GetObjectCommand({ Bucket: creds.bucket, Key: eventsKey }));
  const platform = JSON.parse(await platformRaw.Body.transformToString());
  const events = JSON.parse(await eventsRaw.Body.transformToString());
  const result = boostLoaded(platform, events);
  printSummary(result.rows, result.addedUsers, result.addedEvents, dryRun);
  if (dryRun || (!result.addedUsers.length && !result.addedEvents.length)) return;
  await client.send(
    new PutObjectCommand({
      Bucket: creds.bucket,
      Key: platformKey,
      Body: JSON.stringify(result.platform, null, 2),
      ContentType: 'application/json',
    }),
  );
  await client.send(
    new PutObjectCommand({
      Bucket: creds.bucket,
      Key: eventsKey,
      Body: JSON.stringify(result.events),
      ContentType: 'application/json',
    }),
  );
}

function runFiles(dryRun) {
  const platformPath = option('--platform');
  const eventsPath = option('--events');
  if (!platformPath || !eventsPath) {
    throw new Error('Нужны --platform и --events, либо --s3');
  }
  const platformFile = resolve(platformPath);
  const eventsFile = resolve(eventsPath);
  const platform = readJson(platformFile);
  const events = readJson(eventsFile);
  const result = boostLoaded(platform, events);
  printSummary(result.rows, result.addedUsers, result.addedEvents, dryRun);
  if (dryRun || (!result.addedUsers.length && !result.addedEvents.length)) return;
  writeFileSync(platformFile, JSON.stringify(result.platform, null, 2));
  writeFileSync(eventsFile, JSON.stringify(result.events));
}

const dryRun = args.has('--dry-run');
const useS3 = args.has('--s3');

try {
  if (useS3) await runS3(dryRun, args.has('--confirm-bucket'));
  else runFiles(dryRun);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
