/**
 * Методические материалы: дерево папок и файлов.
 * Байты файла живут в Object Storage, здесь только метаданные.
 * Новые файлы помечаются bucket: "materials". Узел без bucket — старый ключ в бакете кабинета.
 */

import { MATERIAL_DIRECT_MAX_BYTES, MATERIAL_MAX_PARTS, MATERIAL_ROLES, parseMaterialRoles } from './schemas.js';

/** Предел одного объекта в S3 (5 ТБ) и число частей multipart: общие с проверкой запросов (packages/shared/schemas.js). */
export { MATERIAL_DIRECT_MAX_BYTES, MATERIAL_MAX_PARTS, MATERIAL_ROLES, parseMaterialRoles };

/** Подписи ролей в окне «Кто видит». Совпадают с ROLE_LABELS кабинета. */
export const MATERIAL_ROLE_LABELS = {
  owner: 'Владелец',
  sales: 'Менеджер',
  measurer: 'Замерщик',
  crew: 'Монтажник',
  stp_manager: 'Менеджер StP',
};

/**
 * Встроенные обучающие видео ролей. Файлы лежат в apps/web/public/videos (role-<key>.mp4),
 * длительность и версия — в apps/web/src/partner/roleVideos.ts.
 * Раньше ролик был жёстко связан с ролью и не удалялся. Теперь это обычный узел раздела «Видео»
 * с ролями видимости: при первом чтении библиотеки (флаг platform.materialVideosSeeded не стоит)
 * ролики добавляются с ролью, за которой были закреплены. Дальше админ StP меняет роли и удаляет их сам.
 */
export const BUILTIN_TRAINING_VIDEOS = [
  { key: 'owner', title: 'Владелец компании', description: 'Что это за сервис и как им пользоваться владельцу.' },
  { key: 'sales', title: 'Менеджер по продажам', description: 'Как вести клиентов, считать потолок и собирать предложение.' },
  {
    key: 'measurer',
    title: 'Замерщик',
    description: 'Калькулятор со схемой потолка, раскладка панелей для монтажника и Проблемомер на объекте.',
  },
  { key: 'crew', title: 'Монтажник', description: 'Обучение, схема монтажа по комнате и фотоотчёт до, во время и после монтажа.' },
];
export const MATERIAL_BUCKET_MARKER = 'materials';
/** Прямой PUT в бакет. Шлюз API по-прежнему принимает только до 2 МБ base64. Одиночный PUT — до 5 ГБ, крупнее только multipart. */
export const MATERIAL_SINGLE_PUT_MAX_BYTES = 5 * 1024 * 1024 * 1024;
export const MATERIAL_PART_MIN_BYTES = 8 * 1024 * 1024;
export const MATERIAL_PART_MAX_BYTES = 100 * 1024 * 1024;

/** Размер части: от 8 до 100 МБ (последние — до лимита S3 в 5 ГБ), не больше 10 000 частей. */
export function materialPartSize(size) {
  const total = Math.max(0, Number(size) || 0);
  let part = MATERIAL_PART_MIN_BYTES;
  while (Math.ceil(total / part) > MATERIAL_MAX_PARTS) {
    part = part < MATERIAL_PART_MAX_BYTES ? Math.min(part * 2, MATERIAL_PART_MAX_BYTES) : part * 2;
  }
  return part;
}

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

/** Узлы встроенных видео ролей: каждое видно только своей роли, как было до появления ролей видимости. */
export function builtinVideoNodes(now = DEMO_AT) {
  return BUILTIN_TRAINING_VIDEOS.map((video) => ({
    id: `mat_video_${video.key}`,
    parentId: null,
    kind: 'file',
    section: 'video',
    builtin: video.key,
    name: video.title,
    description: video.description,
    roles: [video.key],
    mime: 'video/mp4',
    size: null,
    stub: null,
    storageKey: null,
    contentBase64: null,
    updatedAt: now,
  }));
}

/**
 * Переход на роли видимости. Библиотека, где ещё нет флага materialVideosSeeded, получает
 * встроенные видео ролей. Ничего не пишет: документ сохранится вместе с первой правкой админа.
 * Меняет переданный документ платформы (копию текущего запроса).
 */
export function ensureMaterialVideos(platform) {
  if (!platform || platform.materialVideosSeeded) return platform;
  const nodes = materialBase(platform.materials);
  const have = new Set(nodes.map((node) => node.id));
  platform.materials = [...nodes, ...builtinVideoNodes().filter((node) => !have.has(node.id))];
  platform.materialVideosSeeded = true;
  return platform;
}

function cleanRoles(value) {
  if (!Array.isArray(value)) return null;
  const roles = MATERIAL_ROLES.filter((role) => value.includes(role));
  return roles.length === MATERIAL_ROLES.length ? null : roles;
}

function intersect(a, b) {
  if (a === null) return b;
  if (b === null) return a;
  return a.filter((role) => b.includes(role));
}

/**
 * Кому на деле виден узел: пересечение его ролей и ролей всех папок над ним.
 * null — всем ролям. Пустой массив — никому, кроме админа StP.
 */
export function effectiveRoles(nodes, node) {
  let roles = cleanRoles(node?.roles);
  const guard = new Set();
  let parentId = node?.parentId ?? null;
  while (parentId && !guard.has(parentId)) {
    guard.add(parentId);
    const parent = nodes.find((item) => item.id === parentId);
    if (!parent) break;
    roles = intersect(roles, cleanRoles(parent.roles));
    parentId = parent.parentId ?? null;
  }
  return roles;
}

/** Видит ли роль узел. Админ StP видит всё. */
export function materialVisibleTo(nodes, node, role) {
  if (role === 'admin') return true;
  const roles = effectiveRoles(nodes, node);
  return roles === null || roles.includes(role);
}

/** Узлы, видимые роли. Скрытая папка скрывает всё, что внутри. */
export function visibleMaterialNodes(stored, role) {
  const nodes = materialBase(stored);
  if (role === 'admin') return nodes;
  return nodes.filter((node) => materialVisibleTo(nodes, node, role));
}

/** null у материала в папке — «как у папки»: шире папки он не станет. */
function rolesProblem(nodes, parentId, roles) {
  if (!parentId || roles === null) return null;
  const parent = nodes.find((node) => node.id === parentId);
  const allowed = parent ? effectiveRoles(nodes, parent) : null;
  if (allowed === null) return null;
  const extra = roles.filter((role) => !allowed.includes(role));
  if (!extra.length) return null;
  const list = allowed.length ? allowed.map((role) => MATERIAL_ROLE_LABELS[role]).join(', ') : 'никому, кроме админа StP';
  return `Папка «${parent.name}» видна только: ${list}. Материал внутри не может быть виден шире папки`;
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
    /** Есть PDF-копия для предпросмотра (GET /materials/:id/preview). */
    hasPreview: Boolean(node.previewKey),
    /** Есть миниатюра для списка (подписанная ссылка — thumbnailUrl в ответе API). */
    hasThumbnail: Boolean(node.thumbKey),
    /** Есть лёгкая копия видео для просмотра онлайн (H.264, moov в начале). */
    hasStream: Boolean(node.streamKey),
    streamSize: node.streamKey ? (node.streamSize ?? null) : null,
    section: node.section === 'video' ? 'video' : null,
    builtin: node.builtin || null,
    description: node.description || null,
    updatedAt: node.updatedAt || DEMO_AT,
  };
}

/**
 * Список для роли: только видимые узлы. Админ StP получает всё, а у каждого узла —
 * его роли (roles) и роли с учётом папок (effectiveRoles), чтобы показать отметки.
 */
export function publicMaterialsFor(stored, role) {
  const nodes = materialBase(stored);
  return visibleMaterialNodes(nodes, role).map((node) => publicMaterialFor(nodes, node, role));
}

export function publicMaterialFor(nodes, node, role) {
  const item = toPublicMaterial(node);
  if (role !== 'admin') return item;
  return { ...item, roles: cleanRoles(node.roles), effectiveRoles: effectiveRoles(nodes, node) };
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

/** Имена не повторяются внутри папки. Видео — отдельный раздел со своими именами. */
function sameFolderName(nodes, parentId, name, exceptId, section = null) {
  const key = name.toLocaleLowerCase('ru-RU');
  return nodes.some(
    (node) =>
      node.id !== exceptId &&
      (node.section === 'video' ? 'video' : null) === (section === 'video' ? 'video' : null) &&
      (node.parentId ?? null) === (parentId ?? null) &&
      String(node.name).toLocaleLowerCase('ru-RU') === key,
  );
}

function fail(message) {
  return { ok: false, message };
}

export function createFolder(stored, { name, parentId, id, now, roles }) {
  const nodes = materialBase(stored);
  const title = cleanName(name, 80);
  if (!title) return fail('Укажите название папки');
  const parent = parentId ? nodes.find((node) => node.id === parentId) : null;
  if (parentId && (!parent || parent.kind !== 'folder')) return fail('Папка не найдена');
  if (sameFolderName(nodes, parentId ?? null, title)) {
    return fail('Такое имя в этой папке уже есть');
  }
  const access = cleanRoles(roles);
  const problem = rolesProblem(nodes, parentId, access);
  if (problem) return fail(problem);
  nodes.push({
    id,
    parentId: parentId ?? null,
    kind: 'folder',
    roles: access,
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
  { name, parentId, id, mime, size, storageKey, contentBase64, bucket, now, roles, section },
) {
  const nodes = materialBase(stored);
  const title = cleanName(name, 120);
  if (!title) return fail('Укажите имя файла');
  const video = section === 'video';
  if (video && parentId) return fail('Обучающее видео лежит вне папок');
  if (video && !String(mime || '').startsWith('video/')) return fail('В раздел видео можно загрузить только видеофайл');
  const parent = parentId ? nodes.find((node) => node.id === parentId) : null;
  if (parentId && (!parent || parent.kind !== 'folder')) return fail('Папка не найдена');
  if (sameFolderName(nodes, parentId ?? null, title, undefined, video ? 'video' : null)) {
    return fail(video ? 'Видео с таким названием уже есть' : 'Такое имя в этой папке уже есть');
  }
  const access = cleanRoles(roles);
  const problem = rolesProblem(nodes, parentId, access);
  if (problem) return fail(problem);
  nodes.push({
    id,
    parentId: parentId ?? null,
    kind: 'file',
    ...(video ? { section: 'video' } : {}),
    roles: access,
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
  if (sameFolderName(nodes, current.parentId ?? null, title, id, current.section)) {
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
  if (title !== current.name && sameFolderName(nodes, current.parentId ?? null, title, id, current.section)) {
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
    // Встроенное видео после замены — обычный загруженный файл.
    builtin: null,
    storageKey: storageKey || null,
    bucket: storageKey ? bucket || null : null,
    contentBase64: contentBase64 || null,
    // Новое содержимое — старая PDF-копия больше не соответствует файлу.
    previewKey: null,
    previewSize: null,
    previewUpdatedAt: null,
    // И миниатюра тоже — новую строит кабинет после загрузки.
    thumbKey: null,
    thumbSize: null,
    thumbType: null,
    thumbUpdatedAt: null,
    // И копия видео для просмотра онлайн.
    streamKey: null,
    streamSize: null,
    streamUpdatedAt: null,
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
    storageObjects: [
      ...removed.map((node) => ({
        key: node.storageKey,
        bucket: node.bucket || null,
      })),
      // PDF-копии для предпросмотра всегда лежат в бакете материалов.
      ...nodes
        .filter((node) => ids.has(node.id) && node.previewKey)
        .map((node) => ({ key: node.previewKey, bucket: MATERIAL_BUCKET_MARKER })),
      // Миниатюры — тоже только в бакете материалов.
      ...nodes
        .filter((node) => ids.has(node.id) && node.thumbKey)
        .map((node) => ({ key: node.thumbKey, bucket: MATERIAL_BUCKET_MARKER })),
      // Копии видео для просмотра онлайн — тоже в бакете материалов.
      ...nodes
        .filter((node) => ids.has(node.id) && node.streamKey)
        .map((node) => ({ key: node.streamKey, bucket: MATERIAL_BUCKET_MARKER })),
    ],
  };
}

/** Кто видит узел. roles: null — все роли (в папке — как у папки). */
export function setMaterialRoles(stored, { id, roles, now }) {
  const nodes = materialBase(stored);
  const idx = nodes.findIndex((node) => node.id === id);
  if (idx < 0) return fail('Материал не найден');
  const access = cleanRoles(roles);
  const problem = rolesProblem(nodes, nodes[idx].parentId ?? null, access);
  if (problem) return fail(problem);
  nodes[idx] = { ...nodes[idx], roles: access, updatedAt: now };
  return { ok: true, nodes };
}

export function findMaterial(stored, id) {
  return materialBase(stored).find((node) => node.id === id) || null;
}
