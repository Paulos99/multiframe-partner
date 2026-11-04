import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { roleVideoFor, roleVideoSrc } from './roleVideos.ts';

const PUBLIC = path.resolve(import.meta.dirname, '../../public');

test('у каждой рабочей роли свой ролик, у admin его нет', () => {
  const roles = ['owner', 'sales', 'measurer', 'crew', 'stp_manager'] as const;
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
});

test('файлы роликов и афиш лежат в public/videos и не пустые', () => {
  for (const r of ['owner', 'sales', 'measurer', 'crew', 'stp_manager'] as const) {
    const v = roleVideoFor(r)!;
    for (const ext of ['mp4', 'jpg']) {
      const f = path.join(PUBLIC, 'videos', `${v.file}.${ext}`);
      assert.ok(fs.existsSync(f), `нет файла ${f}`);
      assert.ok(fs.statSync(f).size > 10_000, `файл слишком мал: ${f}`);
    }
    assert.ok(fs.statSync(path.join(PUBLIC, 'videos', `${v.file}.mp4`)).size < 6_000_000, 'ролик тяжелее 6 МБ');
  }
});

test('адреса учитывают базовый путь', () => {
  const v = roleVideoFor('owner')!;
  assert.deepEqual(roleVideoSrc({ ...v, version: '3' }), { video: '/videos/role-owner.mp4?v=3', poster: '/videos/role-owner.jpg?v=3' });
  assert.equal(roleVideoSrc({ ...v, version: '3' }, '/app').video, '/app/videos/role-owner.mp4?v=3');
});

test('ролики 16:9 и с быстрым стартом: начало файла содержит описание (moov до данных)', () => {
  for (const r of ['owner', 'sales', 'measurer', 'crew', 'stp_manager'] as const) {
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
  for (const r of ['owner', 'sales', 'measurer', 'crew', 'stp_manager']) {
    assert.match(config, new RegExp(`^  ${r}: \\{ file: '[^']+', title: '[^']+', duration: '[^']+', description: '[^']+', version: '[^']+' \\},$`, 'm'), `строка роли ${r} не подходит для скрипта замены`);
  }
});
