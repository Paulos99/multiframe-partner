/**
 * Методические материалы: дерево папок и файлов.
 * Байты файла живут в Object Storage, здесь только метаданные.
 * Новые файлы помечаются bucket: "materials". Узел без bucket — старый ключ в бакете кабинета.
 */

export const MATERIAL_BUCKET_MARKER = 'materials';

export const MATERIAL_STUBS = [
  'video-install',
  'deck-product',
  'deck-client',
  'deck-designer',
  'instruction-install',
];

const DEMO_AT = '2026-03-01T09:00:00.000Z';

/** Демо-набор. В бакет не пишется, пока админ сам не изменит библиотеку. */
export function demoMaterialNodes() {
  return [
    folder('mat_fld_mount', null, 'Монтаж'),
    folder('mat_fld_decks', null, 'Презентации'),
    file('mat_file_video', 'mat_fld_mount', 'Видео монтажа', 'video/mp4', 'video-install'),
    file(
      'mat_file_manual',
      'mat_fld_mount',
      'Инструкция по монтажу',
      'application/pdf',
      'instruction-install',
    ),
    file(
      'mat_file_product',
      'mat_fld_decks',
      'Презентация о продукте',
      'application/pdf',
      'deck-product',
    ),
    file(
      'mat_file_client',
      'mat_fld_decks',
      'Презентация для клиента',
      'application/pdf',
      'deck-client',
    ),
    file(
      'mat_file_designer',
      'mat_fld_decks',
      'Презентация для дизайнера',
      'application/pdf',
      'deck-designer',
    ),
  ];
}

function folder(id, parentId, name) {
  return {
    id,
    parentId,
    kind: 'folder',
    name,
    mime: null,
    size: null,
    stub: null,
    storageKey: null,
    contentBase64: null,
    updatedAt: DEMO_AT,
  };
}

function file(id, parentId, name, mime, stub) {
  return {
    id,
    parentId,
    kind: 'file',
    name,
    mime,
    size: null,
    stub,
    storageKey: null,
    contentBase64: null,
    updatedAt: DEMO_AT,
  };
}

export function materialBase(stored) {
  if (!Array.isArray(stored)) return demoMaterialNodes();
  return stored.map((node) => ({ ...node }));
}

export function toPublicMaterial(node) {
  return {
    id: node.id,
    parentId: node.parentId ?? null,
    kind: node.kind,
    name: node.name,
    mime: node.mime || null,
    size: node.size ?? null,
    stub: node.stub || null,
    hasFile: Boolean(node.storageKey || node.contentBase64),
    updatedAt: node.updatedAt || DEMO_AT,
  };
}

export function publicMaterials(stored) {
  return materialBase(stored).map(toPublicMaterial);
}

function cleanName(value, max) {
  return String(value ?? '')
    .replace(/[\\/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function sameFolderName(nodes, parentId, name, exceptId) {
  const key = name.toLocaleLowerCase('ru-RU');
  return nodes.some(
    (node) =>
      node.id !== exceptId &&
      (node.parentId ?? null) === (parentId ?? null) &&
      String(node.name).toLocaleLowerCase('ru-RU') === key,
  );
}

function fail(message) {
  return { ok: false, message };
}

export function createFolder(stored, { name, parentId, id, now }) {
  const nodes = materialBase(stored);
  const title = cleanName(name, 80);
  if (!title) return fail('Укажите название папки');
  const parent = parentId ? nodes.find((node) => node.id === parentId) : null;
  if (parentId && (!parent || parent.kind !== 'folder')) return fail('Папка не найдена');
  if (sameFolderName(nodes, parentId ?? null, title)) {
    return fail('Такое имя в этой папке уже есть');
  }
  nodes.push({
    id,
    parentId: parentId ?? null,
    kind: 'folder',
    name: title,
    mime: null,
    size: null,
    stub: null,
    storageKey: null,
    contentBase64: null,
    updatedAt: now,
  });
  return { ok: true, nodes };
}

export function addFile(
  stored,
  { name, parentId, id, mime, size, storageKey, contentBase64, bucket, now },
) {
  const nodes = materialBase(stored);
  const title = cleanName(name, 120);
  if (!title) return fail('Укажите имя файла');
  const parent = parentId ? nodes.find((node) => node.id === parentId) : null;
  if (parentId && (!parent || parent.kind !== 'folder')) return fail('Папка не найдена');
  if (sameFolderName(nodes, parentId ?? null, title)) return fail('Такое имя в этой папке уже есть');
  nodes.push({
    id,
    parentId: parentId ?? null,
    kind: 'file',
    name: title,
    mime: mime || 'application/octet-stream',
    size: size ?? null,
    stub: null,
    storageKey: storageKey || null,
    bucket: storageKey ? bucket || null : null,
    contentBase64: contentBase64 || null,
    updatedAt: now,
  });
  return { ok: true, nodes };
}

export function renameMaterial(stored, { id, name, now }) {
  const nodes = materialBase(stored);
  const idx = nodes.findIndex((node) => node.id === id);
  if (idx < 0) return fail('Материал не найден');
  const current = nodes[idx];
  const title = cleanName(name, current.kind === 'folder' ? 80 : 120);
  if (!title) return fail('Укажите название');
  if (sameFolderName(nodes, current.parentId ?? null, title, id)) {
    return fail('Такое имя в этой папке уже есть');
  }
  nodes[idx] = { ...current, name: title, updatedAt: now };
  return { ok: true, nodes };
}

export function replaceFile(
  stored,
  { id, mime, size, storageKey, contentBase64, name, bucket, now },
) {
  const nodes = materialBase(stored);
  const idx = nodes.findIndex((node) => node.id === id);
  if (idx < 0) return fail('Файл не найден');
  const current = nodes[idx];
  if (current.kind !== 'file') return fail('Заменить можно только файл');
  const title = name ? cleanName(name, 120) : current.name;
  if (!title) return fail('Укажите имя файла');
  if (title !== current.name && sameFolderName(nodes, current.parentId ?? null, title, id)) {
    return fail('Такое имя в этой папке уже есть');
  }
  const previousKey = current.storageKey || null;
  const previousBucket = current.bucket || null;
  nodes[idx] = {
    ...current,
    name: title,
    mime: mime || current.mime || 'application/octet-stream',
    size: size ?? current.size ?? null,
    stub: null,
    storageKey: storageKey || null,
    bucket: storageKey ? bucket || null : null,
    contentBase64: contentBase64 || null,
    updatedAt: now,
  };
  return {
    ok: true,
    nodes,
    previousKey: previousKey && previousKey !== storageKey ? previousKey : null,
    previousBucket,
  };
}

function descendantIds(nodes, rootId) {
  const ids = new Set([rootId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const node of nodes) {
      if (node.parentId && ids.has(node.parentId) && !ids.has(node.id)) {
        ids.add(node.id);
        grew = true;
      }
    }
  }
  return ids;
}

export function deleteMaterial(stored, { id }) {
  const nodes = materialBase(stored);
  if (!nodes.some((node) => node.id === id)) return fail('Материал не найден');
  const ids = descendantIds(nodes, id);
  const removed = nodes.filter((node) => ids.has(node.id) && node.storageKey);
  return {
    ok: true,
    nodes: nodes.filter((node) => !ids.has(node.id)),
    storageKeys: removed.map((node) => node.storageKey),
    storageObjects: removed.map((node) => ({
      key: node.storageKey,
      bucket: node.bucket || null,
    })),
  };
}

export function findMaterial(stored, id) {
  return materialBase(stored).find((node) => node.id === id) || null;
}
