import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createFolder,
  deleteMaterial,
  demoMaterialNodes,
  publicMaterials,
  renameMaterial,
} from '../../packages/shared/materialsLib.js';

test('демо разложено по папкам и содержит нужные файлы', () => {
  const nodes = demoMaterialNodes();
  const names = nodes.map((node) => node.name);
  for (const title of [
    'Видео монтажа',
    'Презентация о продукте',
    'Презентация для клиента',
    'Презентация для дизайнера',
    'Инструкция по монтажу',
  ]) {
    assert.ok(names.includes(title), title);
  }
  const video = nodes.find((node) => node.name === 'Видео монтажа');
  const mount = nodes.find((node) => node.name === 'Монтаж');
  assert.equal(video?.parentId, mount?.id);
  assert.equal(video?.stub, 'video-install');
  const pub = publicMaterials(undefined);
  assert.equal(pub.find((node) => node.name === 'Видео монтажа')?.hasFile, false);
});

test('админ создаёт, переименовывает и удаляет папку вместе с файлами', () => {
  const created = createFolder(undefined, {
    name: 'Для шоурума',
    parentId: null,
    id: 'mat_test',
    now: '2026-04-01T00:00:00.000Z',
  });
  assert.equal(created.ok, true);
  const renamed = renameMaterial(created.nodes, {
    id: 'mat_test',
    name: 'Шоурум',
    now: '2026-04-02T00:00:00.000Z',
  });
  assert.equal(renamed.ok, true);
  assert.equal(renamed.nodes.find((node) => node.id === 'mat_test')?.name, 'Шоурум');
  const removed = deleteMaterial(renamed.nodes, { id: 'mat_fld_mount' });
  assert.equal(removed.ok, true);
  assert.equal(
    removed.nodes.some((node) => node.name === 'Видео монтажа' || node.name === 'Монтаж'),
    false,
  );
  assert.ok(removed.nodes.some((node) => node.name === 'Презентация о продукте'));
});
