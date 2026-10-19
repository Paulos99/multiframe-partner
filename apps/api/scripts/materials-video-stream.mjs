#!/usr/bin/env node
/**
 * Лёгкие копии видео «Обучения» для просмотра онлайн.
 *
 * Оригиналы с камеры/монтажки — H.265 (HEVC), ~7 Мбит/с, индекс (moov) в конце файла.
 * Такой файл браузер не может начать показывать сразу, а Chrome/Firefox без аппаратного
 * HEVC не показывают картинку вовсе. Скрипт делает рядом копию materials/<id>_stream:
 * H.264 до 1080p + AAC, moov в начале (faststart), ключевой кадр каждые 2 с.
 * Оригинал не трогается и по-прежнему отдаётся кнопкой «Скачать».
 *
 * По умолчанию — только план (ничего не пишет).
 * Запись (только с согласия владельца данных):
 *   node scripts/materials-video-stream.mjs --write --confirm-bucket multiframe-partner-materials \
 *     [--work /tmp/mf-stream] [--only mat_a,mat_b] [--force]
 * Порядок записи: копии в бакет материалов (новые ключи *_stream, оригиналы не меняются) →
 * свежее чтение platform-v2.json → резервная копия на диск → PUT с If-Match на прочитанный ETag.
 * Токен берётся из `yc iam create-token` и не печатается.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { applyStreamResults, ffmpegArgs, isFaststart, planStreamJobs, topLevelAtoms } from './materials-video-stream-lib.mjs';

const DATA_BUCKET = process.env.PARTNERS_BUCKET || 'multiframe-partner-data';
const MEDIA_BUCKET = process.env.MATERIALS_BUCKET || 'multiframe-partner-materials';
const PLATFORM_KEY = 'platform-v2.json';
const YC = process.env.YC_BIN || '/home/box/yandex-cloud/bin/yc';
const args = process.argv.slice(2);
const has = (k) => args.includes(k);
const arg = (k) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : undefined;
};
const objUrl = (bucket, key) => `https://storage.yandexcloud.net/${bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;
const mb = (n) => `${(Number(n || 0) / 1048576).toFixed(1)} МБ`;

let token = '';
const auth = () => ({ 'X-YaCloud-SubjectToken': token });

async function readPlatform() {
  const res = await fetch(objUrl(DATA_BUCKET, PLATFORM_KEY), { headers: { ...auth(), 'Cache-Control': 'no-cache', 'Accept-Encoding': 'identity' } });
  if (!res.ok) throw new Error(`GET ${PLATFORM_KEY}: ${res.status}`);
  return { raw: await res.text(), etag: res.headers.get('etag') };
}

function probe(file) {
  const out = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,codec_name', '-of', 'json', file], { encoding: 'utf8' });
  if (out.status) throw new Error(`ffprobe ${file}: ${out.stderr}`);
  return JSON.parse(out.stdout);
}

async function localAtoms(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const total = fs.fstatSync(fd).size;
    return await topLevelAtoms(async (off, len) => {
      const b = Buffer.alloc(len);
      const n = fs.readSync(fd, b, 0, len, off);
      return b.subarray(0, n);
    }, total);
  } finally {
    fs.closeSync(fd);
  }
}

async function makeCopy(job, work) {
  const original = path.join(work, `${job.id}.orig`);
  const copy = path.join(work, `${job.id}_stream.mp4`);
  if (!fs.existsSync(copy)) {
    if (!fs.existsSync(original) || fs.statSync(original).size !== job.size) {
      const res = await fetch(objUrl(MEDIA_BUCKET, job.storageKey), { headers: auth() });
      if (!res.ok) throw new Error(`GET ${job.storageKey}: ${res.status}`);
      await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(`${original}.part`));
      fs.renameSync(`${original}.part`, original);
    }
    const run = spawnSync('ffmpeg', ffmpegArgs(original, `${copy}.part`), { stdio: 'inherit' });
    if (run.status) throw new Error(`ffmpeg ${job.id}: код ${run.status}`);
    fs.renameSync(`${copy}.part`, copy);
  }
  // Проверка копии: H.264, длительность как у оригинала, moov в начале.
  const p = probe(copy);
  const video = p.streams.find((s) => s.codec_type === 'video');
  if (video?.codec_name !== 'h264') throw new Error(`${job.id}: в копии не H.264`);
  if (!isFaststart(await localAtoms(copy))) throw new Error(`${job.id}: в копии moov не в начале`);
  if (fs.existsSync(original)) {
    const d0 = Number(probe(original).format.duration);
    const d1 = Number(p.format.duration);
    if (Math.abs(d0 - d1) > 1) throw new Error(`${job.id}: длительность ${d1} ≠ ${d0}`);
  }
  return { file: copy, size: fs.statSync(copy).size };
}

async function upload(job, file, size) {
  const body = await fs.openAsBlob(file, { type: 'video/mp4' });
  const res = await fetch(objUrl(MEDIA_BUCKET, job.streamKey), { method: 'PUT', headers: { ...auth(), 'Content-Type': 'video/mp4' }, body });
  if (!res.ok) throw new Error(`PUT ${job.streamKey}: ${res.status} ${await res.text()}`);
  const head = await fetch(objUrl(MEDIA_BUCKET, job.streamKey), { method: 'HEAD', headers: auth() });
  if (Number(head.headers.get('content-length')) !== size) throw new Error(`${job.streamKey}: размер в бакете не совпал`);
}

async function main() {
  const write = has('--write');
  if (write && arg('--confirm-bucket') !== MEDIA_BUCKET) {
    console.error(`Для записи нужны --write --confirm-bucket ${MEDIA_BUCKET}`);
    process.exit(1);
  }
  token = execFileSync(YC, ['iam', 'create-token'], { encoding: 'utf8' }).trim();
  const { raw } = await readPlatform();
  const only = new Set(String(arg('--only') || '').split(',').filter(Boolean));
  const jobs = planStreamJobs(JSON.parse(raw).materials, { force: has('--force') }).filter((j) => !only.size || only.has(j.id));
  console.log(`Видео без копии для просмотра: ${jobs.length}`);
  for (const j of jobs) console.log(`  ${j.id}  ${mb(j.size)}  ${j.name}`);
  if (!write) {
    console.log('План (dry-run). Ничего не записано.');
    return;
  }
  const work = arg('--work') || '/tmp/mf-stream';
  fs.mkdirSync(work, { recursive: true });
  const results = [];
  for (const job of jobs) {
    const { file, size } = await makeCopy(job, work);
    await upload(job, file, size);
    console.log(`  загружено ${job.streamKey}: ${mb(size)} (оригинал ${mb(job.size)})`);
    results.push({ ...job, streamSize: size });
  }
  if (!results.length) return;
  const fresh = await readPlatform();
  const backup = path.join(work, `platform-v2.before-stream-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(backup, fresh.raw, { mode: 0o600 });
  const { platform, applied, skipped } = applyStreamResults(JSON.parse(fresh.raw), results, new Date().toISOString());
  if (!applied.length) {
    console.log('Нечего записывать в базу: все файлы успели измениться.', skipped);
    return;
  }
  const res = await fetch(objUrl(DATA_BUCKET, PLATFORM_KEY), {
    method: 'PUT',
    headers: { ...auth(), 'Content-Type': 'application/json', 'If-Match': fresh.etag },
    body: JSON.stringify(platform, null, 2),
  });
  if (!res.ok) throw new Error(`PUT ${PLATFORM_KEY}: ${res.status} (база изменилась — перезапустите, копии уже в бакете)`);
  console.log(`База обновлена: ${applied.length} видео. Резервная копия: ${backup}. Пропущено: ${skipped.join(', ') || 'нет'}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
