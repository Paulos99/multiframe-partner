import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addFile,
  builtinVideoNodes,
  createFolder,
  deleteMaterial,
  effectiveRoles,
  ensureMaterialVideos,
  publicMaterialsFor,
  setMaterialRoles,
  type MaterialNode,
} from '../../../../packages/shared/materialsLib.js';
import { folderLimit, rolesFromChoice, rolesLabel } from './materialRoles.ts';

const now = '2026-11-09T09:00:00.000Z';

function tree(): MaterialNode[] {
  let nodes: MaterialNode[] = [];
  const step = (r: { ok: true; nodes: MaterialNode[] } | { ok: false; message: string }) => {
    assert.ok(r.ok, r.ok ? '' : r.message);
    nodes = r.nodes;
  };
  step(createFolder([], { id: 'mat_a', name: 'Продажи', now, roles: ['owner', 'sales'] }));
  step(addFile(nodes, { id: 'mat_f', name: 'скрипт.pdf', parentId: 'mat_a', mime: 'application/pdf', now }));
  step(addFile(nodes, { id: 'mat_g', name: 'общий.pdf', mime: 'application/pdf', now }));
  return nodes;
}

test('по умолчанию новый материал виден всем ролям', () => {
  const nodes = tree();
  assert.equal(effectiveRoles(nodes, nodes.find((n) => n.id === 'mat_g')), null);
  for (const role of ['owner', 'sales', 'measurer', 'crew', 'stp_manager']) {
    assert.ok(publicMaterialsFor(nodes, role).some((n) => n.id === 'mat_g'), role);
  }
});

test('папка ограничивает всё, что внутри, и скрытое не попадает в список роли', () => {
  const nodes = tree();
  assert.deepEqual(effectiveRoles(nodes, nodes.find((n) => n.id === 'mat_f')), ['owner', 'sales']);
  const crew = publicMaterialsFor(nodes, 'crew').map((n) => n.id);
  assert.deepEqual(crew, ['mat_g']);
  assert.deepEqual(publicMaterialsFor(nodes, 'sales').map((n) => n.id), ['mat_a', 'mat_f', 'mat_g']);
  // Роли видны только админу.
  assert.equal(publicMaterialsFor(nodes, 'sales').some((n) => 'roles' in n), false);
  assert.deepEqual(publicMaterialsFor(nodes, 'admin').find((n) => n.id === 'mat_f')?.effectiveRoles, ['owner', 'sales']);
});

test('файл не может быть виден шире папки', () => {
  const nodes = tree();
  const wide = setMaterialRoles(nodes, { id: 'mat_f', roles: ['crew'], now });
  assert.equal(wide.ok, false);
  assert.match(wide.ok ? '' : wide.message, /Папка «Продажи» видна только: Владелец, Менеджер/);
  assert.equal(addFile(nodes, { id: 'mat_x', name: 'x.pdf', parentId: 'mat_a', roles: ['owner', 'crew'], now }).ok, false);
  assert.equal(setMaterialRoles(nodes, { id: 'mat_f', roles: ['owner'], now }).ok, true);
});

test('встроенные видео: по одному на роль, добавляются один раз, удалённое не возвращается', () => {
  const platform: { materials?: MaterialNode[]; materialVideosSeeded?: boolean } = { materials: [] };
  ensureMaterialVideos(platform);
  assert.equal(platform.materialVideosSeeded, true);
  assert.deepEqual(platform.materials!.map((n) => [n.builtin, n.roles]), [
    ['owner', ['owner']],
    ['sales', ['sales']],
    ['measurer', ['measurer']],
    ['crew', ['crew']],
  ]);
  const removed = deleteMaterial(platform.materials, { id: 'mat_video_crew' });
  assert.ok(removed.ok);
  const again = { materials: removed.ok ? removed.nodes : [], materialVideosSeeded: true };
  ensureMaterialVideos(again);
  assert.equal(again.materials.some((n) => n.id === 'mat_video_crew'), false);
  assert.equal(builtinVideoNodes().every((n) => n.section === 'video' && n.parentId === null), true);
});

test('подписи и выбор в окне «Кто видит»', () => {
  assert.equal(rolesLabel(null), 'Все роли');
  assert.equal(rolesLabel(undefined), 'Все роли');
  assert.equal(rolesLabel([]), 'Только админ StP');
  assert.equal(rolesLabel(['owner', 'crew']), 'Владелец, Монтажник');
  assert.equal(rolesFromChoice(true, ['owner']), null);
  assert.deepEqual(rolesFromChoice(false, ['crew', 'owner']), ['owner', 'crew']);
  assert.equal(rolesFromChoice(false, ['owner', 'sales', 'measurer', 'crew', 'stp_manager']), null);
  const items = publicMaterialsFor(tree(), 'admin');
  assert.deepEqual(folderLimit(items, 'mat_a'), { folderName: 'Продажи', roles: ['owner', 'sales'] });
  assert.equal(folderLimit(items, null), null);
});
