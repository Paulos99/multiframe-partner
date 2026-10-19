import assert from 'node:assert/strict';
import test from 'node:test';
import { applyStreamResults, ffmpegArgs, isFaststart, planStreamJobs, topLevelAtoms } from './materials-video-stream-lib.mjs';

const T = '2026-10-18T20:10:59.692Z';
const nodes = [
  { id: 'mat_f', kind: 'folder', name: 'Видео' },
  { id: 'mat_a', kind: 'file', name: '2.Как продавать.mp4', mime: 'video/mp4', storageKey: 'materials/mat_a', bucket: 'materials', size: 10, updatedAt: T },
  { id: 'mat_b', kind: 'file', name: 'Готово.mp4', mime: 'video/mp4', storageKey: 'materials/mat_b', bucket: 'materials', updatedAt: T, streamKey: 'materials/mat_b_stream', streamUpdatedAt: '2026-10-19T00:00:00.000Z' },
  { id: 'mat_c', kind: 'file', name: 'Схема.pdf', mime: 'application/pdf', storageKey: 'materials/mat_c', bucket: 'materials', updatedAt: T },
  { id: 'mat_d', kind: 'file', name: 'Старое.mp4', mime: 'video/mp4', storageKey: 'materials/mat_d', updatedAt: T },
  { id: 'mat_e', kind: 'file', name: 'Заглушка', mime: 'video/mp4', stub: 'video-install', storageKey: null, updatedAt: T },
];

test('план: только видео в бакете материалов без свежей копии', () => {
  assert.deepEqual(planStreamJobs(nodes).map((j) => j.id), ['mat_a']);
  assert.equal(planStreamJobs(nodes)[0].streamKey, 'materials/mat_a_stream');
  assert.deepEqual(planStreamJobs(nodes, { force: true }).map((j) => j.id), ['mat_a', 'mat_b']);
  const replaced = nodes.map((n) => (n.id === 'mat_b' ? { ...n, updatedAt: '2026-10-20T00:00:00.000Z' } : n));
  assert.deepEqual(planStreamJobs(replaced).map((j) => j.id), ['mat_a', 'mat_b']);
});

test('запись меняет только три поля и пропускает заменённые файлы', () => {
  const [job] = planStreamJobs(nodes);
  const platform = { version: 2, objects: [{ id: 'o1' }], materials: nodes };
  const { platform: next, applied, skipped } = applyStreamResults(platform, [{ ...job, streamSize: 5 }], 'NOW');
  assert.deepEqual(applied, ['mat_a']);
  assert.deepEqual(skipped, []);
  assert.deepEqual(next.objects, platform.objects);
  const a = next.materials.find((n) => n.id === 'mat_a');
  assert.deepEqual(a, { ...nodes[1], streamKey: 'materials/mat_a_stream', streamSize: 5, streamUpdatedAt: 'NOW' });
  for (const n of next.materials) if (n.id !== 'mat_a') assert.equal(n, nodes.find((x) => x.id === n.id));

  const moved = { ...platform, materials: nodes.map((n) => (n.id === 'mat_a' ? { ...n, updatedAt: 'later' } : n)) };
  const r2 = applyStreamResults(moved, [{ ...job, streamSize: 5 }], 'NOW');
  assert.deepEqual(r2.applied, []);
  assert.deepEqual(r2.skipped, ['mat_a']);
  const gone = applyStreamResults({ ...platform, materials: [] }, [{ ...job, streamSize: 5 }], 'NOW');
  assert.deepEqual(gone.skipped, ['mat_a']);
});

function atom(type, size) {
  const b = Buffer.alloc(size);
  b.writeUInt32BE(size, 0);
  b.write(type, 4, 'latin1');
  return b;
}

test('атомы: moov в конце — не faststart, moov в начале — faststart', async () => {
  const tail = Buffer.concat([atom('ftyp', 24), atom('free', 8), atom('mdat', 100), atom('moov', 40)]);
  const head = Buffer.concat([atom('ftyp', 24), atom('moov', 40), atom('mdat', 100)]);
  const reader = (buf) => async (off, len) => buf.subarray(off, off + len);
  const a = await topLevelAtoms(reader(tail), tail.length);
  assert.deepEqual(a.map((x) => x.type), ['ftyp', 'free', 'mdat', 'moov']);
  assert.equal(isFaststart(a), false);
  assert.equal(isFaststart(await topLevelAtoms(reader(head), head.length)), true);
});

test('ffmpeg: H.264, faststart, до 1080p, ключевые кадры', () => {
  const args = ffmpegArgs('in.mp4', 'out.mp4').join(' ');
  assert.match(args, /-c:v libx264/);
  assert.match(args, /-movflags \+faststart/);
  assert.match(args, /min\(1080,ih\)/);
  assert.match(args, /n_forced\*2/);
});
