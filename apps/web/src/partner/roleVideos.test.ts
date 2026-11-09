import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { BUILTIN_TRAINING_VIDEOS } from '../../../../packages/shared/materialsLib.js';
import { roleVideoFor, roleVideoSrc } from './roleVideos.ts';

const PUBLIC = path.resolve(import.meta.dirname, '../../public');

test('у каждой рабочей роли свой ролик, у admin его нет', () => {
  const roles = ['owner', 'sales', 'measurer', 'crew'] as const;
  const files = new Set<string>();
  for (const r of roles) {
    const v = roleVideoFor(r);
    assert.ok(v, `нет ролика для ${r}`);
    assert.match(v.duration, /^\d:\d\d$/);
    assert.match(v.version, /^\d+$/, `у ролика ${r} нет версии`);
    files.add(v.file);
  }
  assert.equal(files.size, roles.length, 'ролики ролей не должны совпадать');
  assert.equal(roleVideoFor('admin'), null);
  assert.equal(roleVideoFor('stp_manager'), null, 'у менеджера StP ролика нет');
});

test('файлы роликов и афиш лежат в public/videos и не пустые', () => {
  for (const r of ['owner', 'sales', 'measurer', 'crew'] as const) {
    const v = roleVideoFor(r)!;
    for (const ext of ['mp4', 'jpg']) {
      const f = path.join(PUBLIC, 'videos', `${v.file}.${ext}`);
      assert.ok(fs.existsSync(f), `нет файла ${f}`);
      assert.ok(fs.statSync(f).size > 10_000, `файл слишком мал: ${f}`);
    }
    assert.ok(fs.statSync(path.join(PUBLIC, 'videos', `${v.file}.mp4`)).size < 55_000_000, 'ролик тяжелее 55 МБ');
  }
});

test('встроенные видео на сервере совпадают с роликами кабинета: те же ключи, названия и описания', () => {
  assert.deepEqual(BUILTIN_TRAINING_VIDEOS.map((v) => v.key), ['owner', 'sales', 'measurer', 'crew']);
  for (const v of BUILTIN_TRAINING_VIDEOS) {
    const local = roleVideoFor(v.key)!;
    assert.equal(local.title, v.title, `название ролика ${v.key}`);
    assert.equal(local.description, v.description, `описание ролика ${v.key}`);
  }
});

test('ролик менеджера StP убран: файлов и записи нет', () => {
  assert.equal(fs.existsSync(path.join(PUBLIC, 'videos', 'role-stp.mp4')), false);
  assert.equal(fs.existsSync(path.join(PUBLIC, 'videos', 'role-stp.jpg')), false);
  assert.doesNotMatch(fs.readFileSync(path.resolve(import.meta.dirname, 'roleVideos.ts'), 'utf8'), /stp_manager: \{/);
});

test('версии роликов подняты после замены (не меньше 3)', () => {
  for (const r of ['owner', 'sales', 'measurer', 'crew'] as const) {
    assert.ok(Number(roleVideoFor(r)!.version) >= 3, `версия ролика ${r} не поднята`);
  }
});

test('сервер не работает с файлами встроенных роликов: удаление видео убирает только запись', () => {
  const api = path.resolve(import.meta.dirname, '../../../api/src');
  if (fs.existsSync(api)) {
    const hits = fs.readdirSync(api, { recursive: true, encoding: 'utf8' })
      .filter((f) => f.endsWith('.js') || f.endsWith('.ts'))
      .filter((f) => /videos\/role-/.test(fs.readFileSync(path.join(api, f), 'utf8')));
    assert.deepEqual(hits, [], 'сервер не должен работать с файлами роликов');
  }
});

test('адреса учитывают базовый путь', () => {
  const v = roleVideoFor('owner')!;
  assert.deepEqual(roleVideoSrc({ ...v, version: '3' }), { video: '/videos/role-owner.mp4?v=3', poster: '/videos/role-owner.jpg?v=3' });
  assert.equal(roleVideoSrc({ ...v, version: '3' }, '/app').video, '/app/videos/role-owner.mp4?v=3');
});

test('ролики 16:9 и с быстрым стартом: начало файла содержит описание (moov до данных)', () => {
  for (const r of ['owner', 'sales', 'measurer', 'crew'] as const) {
    const v = roleVideoFor(r)!;
    const head = fs.readFileSync(path.join(PUBLIC, 'videos', `${v.file}.mp4`)).subarray(0, 200_000);
    const moov = head.indexOf('moov');
    assert.ok(moov > 0, `у ${v.file}.mp4 описание не в начале файла: запустите замену через npm run video:swap`);
  }
});

test('скрипт замены знает каждую роль из настроек', () => {
  const script = fs.readFileSync(path.resolve(import.meta.dirname, '../../scripts/swap-role-video.mjs'), 'utf8');
  assert.match(script, /roleVideos\.ts/);
  const config = fs.readFileSync(path.resolve(import.meta.dirname, 'roleVideos.ts'), 'utf8');
  for (const r of ['owner', 'sales', 'measurer', 'crew']) {
    assert.match(config, new RegExp(`^  ${r}: \\{ file: '[^']+', title: '[^']+', duration: '[^']+', description: '[^']+', version: '[^']+' \\},$`, 'm'), `строка роли ${r} не подходит для скрипта замены`);
  }
});
