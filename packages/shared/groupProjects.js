/**
 * Комнаты без проекта собираются в проекты по компании, клиенту и адресу.
 * Уже привязанная комната остаётся на месте. Повторный вызов ничего не меняет.
 * Пустые клиент и адрес не склеивают разные комнаты.
 * @returns {boolean} документ изменился
 */
export function groupOrphanRooms(doc) {
  if (!doc || typeof doc !== 'object' || !Array.isArray(doc.objects)) return false;
  const orphans = doc.objects.filter(isOrphan).sort(byAge);
  if (!orphans.length) return false;
  const hadList = Array.isArray(doc.projects);
  if (!hadList) doc.projects = [];
  const projects = doc.projects;
  /** @type {Map<string, { id: string }>} */
  const byKey = new Map();
  for (const project of projects) {
    const key = groupKey(project?.orgId, project?.clientName, project?.address);
    if (key && !byKey.has(key)) byKey.set(key, project);
  }
  const used = new Set(projects.map((project) => project && project.id).filter(Boolean));
  let changed = false;
  for (const room of orphans) {
    if (!room.orgId) continue;
    const key = groupKey(room.orgId, room.clientName, room.address) || `room:${room.id}`;
    let project = byKey.get(key);
    if (!project) {
      const client = clip(room.clientName, 250);
      const address = clip(room.address, 250);
      project = {
        id: nextId(key, used, projects),
        orgId: room.orgId,
        name: clip(client || address || 'Проект', 250),
        clientName: client,
        clientPhone: clip(room.clientPhone, 80),
        address,
        city: clip(room.city, 120),
        createdAt: room.createdAt || room.updatedAt || '1970-01-01T00:00:00.000Z',
        updatedAt: room.updatedAt || room.createdAt || '1970-01-01T00:00:00.000Z',
        createdBy: room.createdBy || '',
      };
      projects.unshift(project);
      byKey.set(key, project);
      changed = true;
    }
    if (room.projectId !== project.id) {
      room.projectId = project.id;
      changed = true;
    }
  }
  if (!changed && !hadList) delete doc.projects;
  return changed;
}

function isOrphan(room) {
  if (!room || typeof room !== 'object') return false;
  return String(room.projectId ?? '').trim() === '';
}

function byAge(a, b) {
  const at = String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
  if (at) return at;
  return String(a.id || '').localeCompare(String(b.id || ''));
}

function norm(value) {
  return String(value || '')
    .trim()
    .toLocaleLowerCase('ru')
    .replace(/\s+/g, ' ');
}

function groupKey(orgId, client, address) {
  const left = norm(client);
  const right = norm(address);
  if (!left && !right) return '';
  return `${orgId || ''}\0${left}\0${right}`;
}

function clip(value, max) {
  return String(value || '').trim().slice(0, max);
}

function fnv(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function stableProjectId(key) {
  const body = `${fnv(key).toString(36)}${fnv(`#${key}`).toString(36)}`;
  return `prj_${body.slice(0, 12)}`;
}

function nextId(key, used, projects) {
  let salt = 0;
  let id = stableProjectId(key);
  while (used.has(id)) {
    const holder = projects.find((project) => project && project.id === id);
    const holderKey = holder ? groupKey(holder.orgId, holder.clientName, holder.address) || '' : '';
    if (holderKey === key) return id;
    salt += 1;
    id = stableProjectId(`${key}#${salt}`);
  }
  used.add(id);
  return id;
}
