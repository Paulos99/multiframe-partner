#!/usr/bin/env node
/**
 * Замена обучающего ролика роли одной командой:
 *   npm run video:swap -- <роль> <путь к новому mp4> [--poster-at=сек]
 * Роли: owner, sales, measurer, crew, stp_manager (см. src/partner/roleVideos.ts).
 * Скрипт сжимает ролик (16:9, 1280×720, быстрый старт), снимает афишу, обновляет «duration»
 * и поднимает «version» в roleVideos.ts. Нужен ffmpeg в PATH. Затем: проверить на экране и закоммитить.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const configPath = path.join(root, 'src/partner/roleVideos.ts');
const videosDir = path.join(root, 'public/videos');

const args = process.argv.slice(2);
const posterAtArg = args.find((a) => a.startsWith('--poster-at='));
const posterAt = posterAtArg ? Number(posterAtArg.split('=')[1]) : 1;
const [role, source] = args.filter((a) => !a.startsWith('--'));

function fail(text) {
  console.error(text);
  process.exit(1);
}

if (!role || !source) fail('Использование: npm run video:swap -- <роль> <путь к новому mp4> [--poster-at=сек]');
if (!fs.existsSync(source)) fail(`Файл не найден: ${source}`);
if (!Number.isFinite(posterAt) || posterAt < 0) fail('--poster-at: число секунд, не меньше 0');

const config = fs.readFileSync(configPath, 'utf8');
const lineRe = new RegExp(`^(\\s*${role}: \\{ file: ')([^']+)(',.*?duration: ')([^']*)(',.*?version: ')([^']*)(' \\},?)$`, 'm');
const m = config.match(lineRe);
if (!m) fail(`Для роли «${role}» нет записи в src/partner/roleVideos.ts`);
const file = m[2];

function ff(bin, list) {
  try {
    return execFileSync(bin, list, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
  } catch (e) {
    fail(`${bin} не сработал (${e.code === 'ENOENT' ? 'не установлен' : 'ошибка'}). ${String(e.stderr ?? '').slice(-400)}`);
  }
}

const probe = JSON.parse(ff('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,width,height:format=duration', '-of', 'json', source]));
const video = probe.streams.find((s) => s.codec_type === 'video');
if (!video) fail('В файле нет видео');
if (Math.abs(video.width / video.height - 16 / 9) > 0.02) fail(`Нужен формат 16:9, а у файла ${video.width}×${video.height}`);
const seconds = Math.round(Number(probe.format.duration));
if (!(seconds > 0)) fail('Не удалось определить длительность');
const duration = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

const mp4 = path.join(videosDir, `${file}.mp4`);
const jpg = path.join(videosDir, `${file}.jpg`);
fs.mkdirSync(videosDir, { recursive: true });
ff('ffmpeg', ['-y', '-i', source, '-vf', 'scale=1280:720', '-c:v', 'libx264', '-crf', '30', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'aac', '-b:a', '64k', '-movflags', '+faststart', mp4]);
ff('ffmpeg', ['-y', '-ss', String(posterAt), '-i', mp4, '-frames:v', '1', '-q:v', '4', jpg]);

const nextVersion = String((Number.parseInt(m[6], 10) || 0) + 1);
fs.writeFileSync(configPath, config.replace(lineRe, `$1$2$3${duration}$5${nextVersion}$7`));

const mb = (fs.statSync(mp4).size / 1048576).toFixed(1);
console.log(`Готово: ${role} → ${file}.mp4 (${mb} МБ, ${duration}), афиша ${file}.jpg, версия ${nextVersion}.`);
if (fs.statSync(mp4).size > 6_000_000) console.warn('Внимание: ролик тяжелее 6 МБ, тест на размер не пройдёт.');
