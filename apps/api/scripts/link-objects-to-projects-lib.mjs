/**
 * Привязка старых объектов к проектам через HTTP API.
 * Каждому объекту без projectId — свой проект в его компании.
 * Уже привязанные объекты и проект prj_f20um0dq5eqq не меняются.
 * После каждой записи результат перечитывается: если кэш экземпляра стёр запись, попытка повторяется.
 * Повторный запуск доделывает только то, чего ещё нет.
 */

export const PROTECTED_PROJECT_ID = 'prj_f20um0dq5eqq';

export function stableProjectId(objectId) {
  const clean = String(objectId || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  if (!clean) throw new Error('У объекта нет id');
  const id = `prj_${clean}`.slice(0, 40);
  if (!/^prj_[a-z0-9]+$/.test(id)) throw new Error('Не удалось собрать id проекта');
  if (id === PROTECTED_PROJECT_ID) throw new Error('Служебный id проекта занят');
  return id;
}

export function projectBodyForObject(object) {
  const clientName = String(object?.clientName || '').trim().slice(0, 250);
  const address = String(object?.address || '').trim().slice(0, 250);
  const roomName = String(object?.roomName || '').trim().slice(0, 120);
  return {
    id: stableProjectId(object.id),
    name: (clientName || address || roomName || 'Проект').slice(0, 250),
    clientName,
    clientPhone: String(object?.clientPhone || '').trim().slice(0, 80),
    address,
    city: String(object?.city || '').trim().slice(0, 120),
  };
}

export function planMigration(objects, projects, orgId) {
  const known = new Map((Array.isArray(projects) ? projects : []).map((project) => [project.id, project]));
  return (Array.isArray(objects) ? objects : []).map((object) => {
    if (orgId && object.orgId && object.orgId !== orgId) {
      return { action: 'skip-other-org', objectId: object.id, orgId: object.orgId };
    }
    if (object.projectId) {
      return {
        action: object.projectId === PROTECTED_PROJECT_ID ? 'skip-protected' : 'skip-linked',
        objectId: object.id,
        projectId: object.projectId,
      };
    }
    const projectId = stableProjectId(object.id);
    const existing = known.get(projectId);
    if (existing && existing.orgId && object.orgId && existing.orgId !== object.orgId) {
      return { action: 'conflict', objectId: object.id, projectId };
    }
    return {
      action: existing ? 'link' : 'create-and-link',
      objectId: object.id,
      projectId,
      body: existing ? null : projectBodyForObject(object),
    };
  });
}

function count(actions, action) {
  return actions.filter((item) => item.action === action).length;
}

export function summarizeMigration(actions, dryRun) {
  return {
    ok: count(actions, 'conflict') === 0,
    dryRun: Boolean(dryRun),
    objects: actions.length,
    alreadyLinked: count(actions, 'skip-linked'),
    protectedSkipped: count(actions, 'skip-protected'),
    otherOrgSkipped: count(actions, 'skip-other-org'),
    conflicts: count(actions, 'conflict'),
    willCreate: count(actions, 'create-and-link'),
    willLink: count(actions, 'link'),
    protectedProjectId: PROTECTED_PROJECT_ID,
  };
}

async function readLists(request, token) {
  const objectsRes = await request('GET', '/objects', { token });
  const projectsRes = await request('GET', '/projects', { token });
  if (objectsRes.status !== 200) throw new Error(`Список объектов: ${objectsRes.status}`);
  if (projectsRes.status !== 200) throw new Error(`Список проектов: ${projectsRes.status}`);
  return {
    objects: objectsRes.data?.objects || [],
    projects: projectsRes.data?.projects || [],
  };
}

function messageOf(res, fallback) {
  return res.data?.message || fallback;
}

async function settleObject({ request, token, objectId, orgId, attempts, sleep }) {
  let last = 'Запись не подтвердилась повторным чтением';
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const { objects, projects } = await readLists(request, token);
    const object = objects.find((item) => item.id === objectId);
    if (!object) throw new Error('Объект не найден');
    if (orgId && object.orgId && object.orgId !== orgId) throw new Error('Чужая компания');
    if (object.projectId) {
      if (object.projectId === PROTECTED_PROJECT_ID) return;
      if (projects.some((project) => project.id === object.projectId)) return;
      return;
    }
    const projectId = stableProjectId(object.id);
    let project = projects.find((item) => item.id === projectId);
    if (project && project.orgId && object.orgId && project.orgId !== object.orgId) {
      throw new Error('Проект принадлежит другой компании');
    }
    if (!project) {
      const created = await request('POST', '/projects', { token, body: projectBodyForObject(object) });
      if (created.status >= 500 || created.status === 0) {
        last = messageOf(created, `Проект не создан (${created.status})`);
        await sleep(attempt);
        continue;
      }
      if (created.status !== 200) throw new Error(messageOf(created, `Проект не создан (${created.status})`));
      const check = await readLists(request, token);
      project = check.projects.find((item) => item.id === projectId);
      if (!project) {
        last = 'Проект не виден при повторном чтении';
        await sleep(attempt);
        continue;
      }
    }
    const patched = await request('PATCH', `/objects/${encodeURIComponent(object.id)}`, {
      token,
      body: { projectId },
    });
    if (patched.status >= 500 || patched.status === 0) {
      last = messageOf(patched, `Объект не обновлён (${patched.status})`);
      await sleep(attempt);
      continue;
    }
    if (patched.status !== 200) throw new Error(messageOf(patched, `Объект не обновлён (${patched.status})`));
    const after = await readLists(request, token);
    const saved = after.objects.find((item) => item.id === object.id);
    const savedProject = after.projects.find((item) => item.id === projectId);
    if (saved?.projectId === projectId && savedProject && savedProject.id !== PROTECTED_PROJECT_ID) return;
    last = 'Привязка не видна при повторном чтении';
    await sleep(attempt);
  }
  throw new Error(last);
}

export async function runMigration({ request, token, orgId, dryRun, attempts = 3, sleep = async () => {} }) {
  const first = await readLists(request, token);
  const actions = planMigration(first.objects, first.projects, orgId);
  const summary = summarizeMigration(actions, dryRun);
  if (dryRun) return { ...summary, created: 0, linked: 0, failures: [] };
  const failures = [];
  let created = 0;
  let linked = 0;
  for (const action of actions) {
    if (action.action !== 'create-and-link' && action.action !== 'link') continue;
    try {
      await settleObject({ request, token, objectId: action.objectId, orgId, attempts, sleep });
      if (action.action === 'create-and-link') created += 1;
      linked += 1;
    } catch (error) {
      failures.push({ objectId: action.objectId, message: error instanceof Error ? error.message : 'Ошибка' });
    }
  }
  return { ...summary, dryRun: false, created, linked, failures, ok: failures.length === 0 && summary.ok };
}

export function readConfig(env, argv) {
  let dryRun = false;
  for (const arg of argv) {
    if (arg === '--dry-run') dryRun = true;
    else throw new Error(`Неизвестный аргумент ${arg}`);
  }
  return {
    dryRun,
    apiBase: String(env.API_BASE || env.VITE_API_URL || '').replace(/\/$/, ''),
    login: env.MF_STAFF_LOGIN || '',
    password: env.MF_STAFF_PASSWORD || '',
  };
}

export function assertCredentials(config) {
  const missing = [];
  if (!config.apiBase) missing.push('API_BASE');
  if (!config.login) missing.push('MF_STAFF_LOGIN');
  if (!config.password) missing.push('MF_STAFF_PASSWORD');
  if (missing.length) throw new Error(`Нужны переменные ${missing.join(', ')}`);
}

export function createApiClient(fetchImpl, apiBase) {
  const requests = [];
  async function request(method, pathname, { token, body } = {}) {
    if (method === 'DELETE') throw new Error('Скрипт ничего не удаляет');
    requests.push(`${method} ${pathname}`);
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetchImpl(`${apiBase}${pathname}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data = {};
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { message: text.slice(0, 180) };
      }
    }
    return { status: res.status, data };
  }
  return { request, requests };
}

export async function runFromConfig({ config, fetchImpl, attempts, sleep }) {
  assertCredentials(config);
  const http = createApiClient(fetchImpl, config.apiBase);
  const loginRes = await http.request('POST', '/auth/login', {
    body: { login: config.login, password: config.password },
  });
  if (loginRes.status !== 200 || !loginRes.data?.token || !loginRes.data?.user) {
    throw new Error(`Вход не выполнен (${loginRes.status})`);
  }
  const user = loginRes.data.user;
  if (!['owner', 'sales'].includes(user.role) || !user.orgId) {
    throw new Error('Нужен владелец или менеджер компании');
  }
  const report = await runMigration({
    request: http.request,
    token: loginRes.data.token,
    orgId: user.orgId,
    dryRun: config.dryRun,
    attempts,
    sleep,
  });
  return { report, requests: http.requests };
}
