// Isolated local API. Never loads production files, tokens, or cloud credentials.
import { createServer } from 'node:http';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import bcrypt from '../../api/node_modules/bcryptjs/index.js';
const dir = mkdtempSync(path.join(tmpdir(), 'mf-ui-e2e-'));
process.env.PLATFORM_FILE = path.join(dir, 'platform.json');
process.env.JWT_SECRET = 'ui-e2e-isolated-signing-only';
process.env.PARTNERS_BUCKET = '';
process.env.MATERIALS_BUCKET = 'e2e-private-materials';
process.env.CORS_ORIGIN = 'http://127.0.0.1:4180';
const now = new Date().toISOString();
const settings = {
  companyName: 'UI test company',
  city: 'Москва',
  panelPriceRub: 2396,
  pricePerM2: 5990,
  installPricePerM2: 1500,
  dowelsPerPanel: 2,
  dowelPriceRub: 25,
};
const base = {
  users: ['owner', 'crew', 'admin'].map((role) => ({
    id: `ui_${role}`,
    login: `ui.${role}`,
    displayName: `UI ${role}`,
    role,
    orgId: role === 'admin' ? null : 'ui_org',
    passwordHash: bcrypt.hashSync('ui-fixture-password-only', 4),
    createdAt: now,
  })),
  orgs: [{ id: 'ui_org', settings, createdAt: now }],
  projects: [
    {
      id: 'ui_project',
      orgId: 'ui_org',
      name: 'Тестовая квартира',
      clientName: 'UI Client',
      clientPhone: '',
      address: 'Тестовый адрес',
      city: 'Москва',
      createdAt: now,
      updatedAt: now,
      createdBy: 'ui_owner',
    },
  ],
  objects: [
    {
      id: 'ui_room',
      orgId: 'ui_org',
      projectId: 'ui_project',
      roomName: 'Спальня',
      clientName: 'UI Client',
      clientPhone: '',
      address: 'Тестовый адрес',
      city: 'Москва',
      status: 'draft',
      assignedTo: 'ui_crew',
      createdBy: 'ui_owner',
      room: { areaM2: 24 },
      createdAt: now,
      updatedAt: now,
      history: [],
      documents: [],
    },
  ],
  materials: [],
  activity: [],
  toolUsage: {},
};
// Роли продажника и замерщика — для проверок вёрстки по ролям.
for (const role of ['sales', 'measurer']) {
  base.users.push({ ...base.users[0], id: `ui_${role}`, login: `ui.${role}`, displayName: `UI ${role}`, role });
}
base.objects.push({
  ...base.objects[0],
  id: 'ui_crew_room',
  roomName: 'Гостиная',
  status: 'install',
});
base.objects.push({...base.objects[0], id:'ui_measured', roomName:'Кухня', status:'measured', stageOrder:100});
writeFileSync(process.env.PLATFORM_FILE, JSON.stringify(base));
const { setObjectStoreTransportForTests } =
  await import('../../api/objectStore.js');
const avatars = new Map();
setObjectStoreTransportForTests(async (op) => {
  if (op.action === 'put') {
    avatars.set(op.key, op.body);
    return {};
  }
  if (op.action === 'sign-get')
    return `http://127.0.0.1:4181/test-avatar/${encodeURIComponent(op.key)}`;
  throw new Error('Unexpected storage operation in isolated test');
});
const { handler } = await import('../../api/index.js');
const { resetStoredDocumentsForTests } =
  await import('../../api/platformStore.js');
const server = createServer(async (req, res) => {
  try {
    if (req.url === '/__reset' && req.method === 'POST') {
      resetStoredDocumentsForTests();
      writeFileSync(process.env.PLATFORM_FILE, JSON.stringify(base));
      avatars.clear();
      res.writeHead(200);
      res.end('{}');
      return;
    }
    if (req.url.startsWith('/test-avatar/')) {
      const b = avatars.get(decodeURIComponent(req.url.slice(13)));
      res.writeHead(b ? 200 : 404, {
        'Content-Type': 'image/webp',
        'Access-Control-Allow-Origin': 'http://127.0.0.1:4180',
      });
      res.end(b);
      return;
    }
    let body = '';
    for await (const c of req) body += c;
    const url = new URL(req.url, 'http://127.0.0.1:4181');
    const out = await handler({
      httpMethod: req.method,
      path: url.pathname,
      headers: req.headers,
      queryStringParameters: Object.fromEntries(url.searchParams),
      body,
    });
    res.writeHead(out.statusCode, out.headers);
    res.end(out.body);
  } catch {
    res.writeHead(500);
    res.end('{}');
  }
});
server.listen(4181, '127.0.0.1');
function close() {
  server.close(() => {
    rmSync(dir, { recursive: true, force: true });
    process.exit();
  });
}
process.on('SIGTERM', close);
process.on('SIGINT', close);
