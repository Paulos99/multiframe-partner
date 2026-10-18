import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  OBJECT_NAME,
  assertReportSafe,
  buildEstimate,
  calculatorModuleBase,
  priceHits,
  readConfig,
  runCrewTest,
} from './crew-test-object-lib.mjs';

const ESTIMATE_PDF = Buffer.from('%PDF-1.4 estimate priced').toString('base64');
const SPEC_PDF = Buffer.from('%PDF-1.4 specification').toString('base64');

function samplePdf() {
  return {
    estimatePdfBase64: ESTIMATE_PDF,
    specPdfBase64: SPEC_PDF,
    estimateFilename: 'ТЕСТ доступ монтажника — смета — 2026-10-18.pdf',
    specFilename: 'ТЕСТ доступ монтажника — спецификация — 2026-10-18.pdf',
    panels: 42,
    dowels: 97,
    panelsCost: 100632,
    areaM2: 14,
  };
}

function staffConfig(extra = {}) {
  return {
    dryRun: false,
    outDir: '',
    apiBase: 'http://api.test',
    login: 'partner1',
    password: 'secret-owner',
    crewLogin: 'crew1',
    crewPassword: 'secret-crew',
    calcUrl: '',
    chromePath: '',
    length: 4,
    width: 3.5,
    ...extra,
  };
}

function createMockApi({ ownerSeesSpec = true, objects = [] } = {}) {
  const state = {
    objects: objects.map((obj) => ({ documents: [], ...obj })),
    seq: 1,
  };
  const calls = [];
  const owner = {
    id: 'u_partner1',
    login: 'partner1',
    role: 'owner',
    orgId: 'org_demo',
    org: {
      companyName: 'Потолки Столицы',
      city: 'Москва',
      installPricePerM2: 1500,
      dowelPriceRub: 25,
      panelPriceRub: 2396,
      pricePerM2: 5990,
    },
  };
  const crew = {
    id: 'u_crew1',
    login: 'crew1',
    role: 'crew',
    orgId: 'org_demo',
    org: { companyName: 'Потолки Столицы', city: 'Москва' },
  };

  function visibleDocs(docs, role) {
    const list = [...(docs || [])];
    const estimates = list.filter((doc) => doc.kind === 'estimate');
    const specs = list.filter((doc) => doc.kind === 'spec');
    const picked = role === 'crew' ? specs : ownerSeesSpec ? [...estimates, ...specs] : estimates.length ? estimates : specs;
    return picked.map(({ storageKey, pdfBase64, ...rest }) => rest);
  }

  function publicObject(obj, role) {
    const copy = {
      ...obj,
      documents: visibleDocs(obj.documents, role),
    };
    delete copy.storageDump;
    if (role === 'crew' && copy.estimate) {
      copy.estimate = {
        panels: copy.estimate.panels || 0,
        dowels: copy.estimate.dowels || 0,
        panelsCost: null,
        installCost: null,
        dowelsCost: null,
        totalCost: null,
      };
    }
    return copy;
  }

  function visibleTo(obj, role) {
    if (role === 'owner') return true;
    return obj.assignedTo === crew.id;
  }

  async function fetchImpl(url, init = {}) {
    const u = new URL(url);
    const method = init.method || 'GET';
    const pathname = u.pathname;
    calls.push({ method, pathname, body: init.body ? JSON.parse(init.body) : null });
    const auth = init.headers?.Authorization || '';
    const role = auth.includes('crew-token') ? 'crew' : auth.includes('staff-token') ? 'owner' : null;
    const json = (status, data) => ({
      status,
      async text() {
        return JSON.stringify(data);
      },
    });

    if (method === 'POST' && pathname === '/auth/login') {
      const body = JSON.parse(init.body);
      if (body.login === owner.login && body.password === 'secret-owner') {
        return json(200, { token: 'staff-token', user: owner });
      }
      if (body.login === crew.login && body.password === 'secret-crew') {
        return json(200, { token: 'crew-token', user: crew });
      }
      return json(401, { message: 'Неверный логин или пароль' });
    }
    if (!role) return json(401, { message: 'Нет сессии' });
    if (method === 'GET' && pathname === '/org/staff') {
      return json(200, {
        staff: [{ id: crew.id, login: crew.login, role: 'crew', displayName: 'Монтажник' }],
      });
    }
    if (method === 'GET' && pathname === '/objects') {
      const list = state.objects.filter((obj) => visibleTo(obj, role)).map((obj) => publicObject(obj, role));
      return json(200, { objects: list });
    }
    if (method === 'POST' && pathname === '/objects') {
      const body = JSON.parse(init.body);
      const obj = {
        id: `obj_${state.seq++}`,
        orgId: 'org_demo',
        ...body,
        documents: [],
      };
      state.objects.unshift(obj);
      return json(200, { object: publicObject(obj, role) });
    }
    const docPost = pathname.match(/^\/objects\/([^/]+)\/documents$/);
    if (method === 'POST' && docPost) {
      const obj = state.objects.find((item) => item.id === decodeURIComponent(docPost[1]));
      if (!obj) return json(404, { message: 'Объект не найден' });
      const body = JSON.parse(init.body);
      const added = [];
      for (const raw of body.documents || []) {
        const bytes = Buffer.from(String(raw.pdfBase64 || ''), 'base64');
        if (!bytes.subarray(0, 4).equals(Buffer.from('%PDF'))) {
          return json(400, { message: 'Файл не похож на PDF' });
        }
        const id = `doc_${state.seq++}`;
        const doc = {
          id,
          versionId: body.versionId,
          kind: raw.kind,
          filename: raw.filename,
          hasScheme: raw.hasScheme,
          panels: raw.panels,
          areaM2: raw.areaM2,
          storageKey: `docs/org_demo/${obj.id}/${id}.pdf`,
          pdfBase64: raw.pdfBase64,
        };
        added.push(doc);
      }
      obj.documents = [...added, ...(obj.documents || [])];
      return json(200, { object: publicObject(obj, role) });
    }
    const docGet = pathname.match(/^\/objects\/([^/]+)\/documents\/([^/]+)$/);
    if (method === 'GET' && docGet) {
      const obj = state.objects.find((item) => item.id === decodeURIComponent(docGet[1]));
      if (!obj || !visibleTo(obj, role)) return json(404, { message: 'Объект не найден' });
      const docId = decodeURIComponent(docGet[2]);
      const meta = visibleDocs(obj.documents, role).find((doc) => doc.id === docId);
      if (!meta) return json(404, { message: 'Документ не найден' });
      const stored = obj.documents.find((doc) => doc.id === meta.id);
      return json(200, { ...meta, pdfBase64: stored.pdfBase64 });
    }
    const patch = pathname.match(/^\/objects\/([^/]+)$/);
    if (method === 'PATCH' && patch) {
      const obj = state.objects.find((item) => item.id === decodeURIComponent(patch[1]));
      if (!obj) return json(404, { message: 'Объект не найден' });
      const body = JSON.parse(init.body);
      if (body.assignedTo !== undefined) obj.assignedTo = body.assignedTo;
      return json(200, { object: publicObject(obj, role) });
    }
    if (method === 'DELETE') return json(200, { ok: true });
    return json(404, { message: 'Нет маршрута' });
  }

  return { fetchImpl, calls, state };
}

test('readConfig понимает dry-run и не подставляет пароли', () => {
  const config = readConfig({ API_BASE: 'https://example.test/' }, ['--dry-run', '--out', 'out']);
  assert.equal(config.dryRun, true);
  assert.equal(config.outDir, 'out');
  assert.equal(config.apiBase, 'https://example.test');
  assert.equal(config.login, '');
  assert.equal(config.password, '');
  assert.throws(() => readConfig({}, ['--apply']), /Неизвестный аргумент/);
});

test('calculatorModuleBase оставляет каталог калькулятора', () => {
  assert.equal(
    calculatorModuleBase('http://127.0.0.1:9/calculator/index.html'),
    'http://127.0.0.1:9/calculator/',
  );
  assert.equal(
    calculatorModuleBase('https://paulos99.github.io/multiframe-partner/calculator'),
    'https://paulos99.github.io/multiframe-partner/calculator/',
  );
});

test('в ответе монтажника цены и storageKey считаются утечкой', () => {
  assert.deepEqual(priceHits({ estimate: { panels: 1, panelsCost: null, totalCost: 0 } }), []);
  assert.deepEqual(priceHits({ estimate: { panelsCost: 10 } }), ['panelsCost']);
  assert.deepEqual(priceHits({ documents: [{ storageKey: 'docs/a' }] }), ['storageKey']);
});

test('смета объекта складывается как в калькуляторе кабинета', () => {
  const estimate = buildEstimate(samplePdf(), { installPricePerM2: 1500, dowelPriceRub: 25 });
  assert.equal(estimate.panels, 42);
  assert.equal(estimate.installCost, 21000);
  assert.equal(estimate.dowelsCost, 2425);
  assert.equal(estimate.totalCost, 100632 + 21000 + 2425);
});

test('без учётных данных скрипт не открывает калькулятор и не ходит в API', async () => {
  let rendered = false;
  let fetched = false;
  await assert.rejects(
    () =>
      runCrewTest({
        config: staffConfig({ login: '', password: '' }),
        renderPdfs: async () => {
          rendered = true;
          return samplePdf();
        },
        fetchImpl: async () => {
          fetched = true;
          throw new Error('fetch');
        },
      }),
    /MF_STAFF_LOGIN/,
  );
  assert.equal(rendered, false);
  assert.equal(fetched, false);
});

test('dry-run пишет оба PDF и не вызывает API даже с паролями в env', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'crew-test-'));
  let fetched = false;
  try {
    const report = await runCrewTest({
      config: staffConfig({ dryRun: true, outDir: dir }),
      renderPdfs: async () => samplePdf(),
      fetchImpl: async () => {
        fetched = true;
        throw new Error('fetch');
      },
      writeFiles: async (out, pdf) => {
        const { mkdir, writeFile } = await import('node:fs/promises');
        await mkdir(out, { recursive: true });
        const estimatePath = path.join(out, 'estimate.pdf');
        const specPath = path.join(out, 'spec.pdf');
        await writeFile(estimatePath, Buffer.from(pdf.estimatePdfBase64, 'base64'));
        await writeFile(specPath, Buffer.from(pdf.specPdfBase64, 'base64'));
        return [estimatePath, specPath];
      },
    });
    assert.equal(report.ok, true);
    assert.equal(report.dryRun, true);
    assert.equal(fetched, false);
    assert.equal(report.requests.length, 0);
    const estimate = await readFile(report.pdf.files[0]);
    const spec = await readFile(report.pdf.files[1]);
    assert.equal(estimate.subarray(0, 4).toString(), '%PDF');
    assert.equal(spec.subarray(0, 4).toString(), '%PDF');
    assert.notEqual(estimate.toString(), spec.toString());
    assertReportSafe(report, ['secret-owner', 'secret-crew', 'staff-token', 'crew-token']);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('ошибка PDF не доходит до API', async () => {
  let fetched = false;
  await assert.rejects(
    () =>
      runCrewTest({
        config: staffConfig(),
        renderPdfs: async () => {
          throw new Error('pdf failed');
        },
        fetchImpl: async () => {
          fetched = true;
          throw new Error('fetch');
        },
      }),
    /pdf failed/,
  );
  assert.equal(fetched, false);
});

test('чужая компания останавливает скрипт до создания объекта', async () => {
  const mock = createMockApi();
  const original = mock.fetchImpl;
  const fetchImpl = async (url, init) => {
    if (String(url).endsWith('/auth/login') && init?.body?.includes('partner1')) {
      return {
        status: 200,
        async text() {
          return JSON.stringify({
            token: 'staff-token',
            user: {
              id: 'u_other',
              login: 'partner2',
              role: 'owner',
              orgId: 'org_other',
              org: { companyName: 'Северный Потолок', city: 'Санкт-Петербург' },
            },
          });
        },
      };
    }
    return original(url, init);
  };
  await assert.rejects(
    () =>
      runCrewTest({
        config: staffConfig(),
        renderPdfs: async () => samplePdf(),
        fetchImpl,
      }),
    /Потолки Столицы/,
  );
  assert.equal(
    mock.calls.some((call) => call.method === 'POST' && call.pathname === '/objects'),
    false,
  );
});

test('создаёт объект, назначает crew1 и проверяет доступ', async () => {
  const mock = createMockApi({ ownerSeesSpec: true });
  const report = await runCrewTest({
    config: staffConfig(),
    renderPdfs: async () => samplePdf(),
    fetchImpl: mock.fetchImpl,
  });
  assert.equal(report.ok, true);
  assert.equal(report.created, true);
  assert.equal(report.uploaded, true);
  assert.equal(report.objectName, OBJECT_NAME);
  assert.equal(report.crew.specStatus, 200);
  assert.equal(report.crew.estimateStatus, 404);
  assert.equal(report.crew.storageKeyStatus, 404);
  assert.deepEqual(report.crew.prices, []);
  assert.equal(report.crew.estimateListed, false);
  assert.equal(report.owner.estimateStatus, 200);
  assert.equal(report.owner.specStatus, 200);
  assert.equal(mock.state.objects.length, 1);
  assert.equal(mock.state.objects[0].clientName, OBJECT_NAME);
  assert.equal(mock.state.objects[0].assignedTo, 'u_crew1');
  assert.equal(mock.state.objects[0].estimate.panelsCost, 100632);
  const upload = mock.calls.find((call) => call.pathname.endsWith('/documents') && call.method === 'POST');
  assert.deepEqual(
    upload.body.documents.map((doc) => doc.kind),
    ['estimate', 'spec'],
  );
  assert.equal(
    mock.calls.some((call) => call.method === 'DELETE'),
    false,
  );
  assertReportSafe(report, ['secret-owner', 'secret-crew', 'staff-token', 'crew-token']);
});

test('повторный запуск не создаёт второй объект и не заливает PDF заново', async () => {
  const mock = createMockApi({ ownerSeesSpec: true });
  await runCrewTest({
    config: staffConfig(),
    renderPdfs: async () => samplePdf(),
    fetchImpl: mock.fetchImpl,
  });
  mock.calls.length = 0;
  const second = await runCrewTest({
    config: staffConfig(),
    renderPdfs: async () => samplePdf(),
    fetchImpl: mock.fetchImpl,
  });
  assert.equal(second.ok, true);
  assert.equal(second.created, false);
  assert.equal(second.uploaded, false);
  assert.equal(mock.state.objects.length, 1);
  assert.equal(
    mock.calls.some((call) => call.method === 'POST' && call.pathname === '/objects'),
    false,
  );
  assert.equal(
    mock.calls.some((call) => call.method === 'POST' && call.pathname.endsWith('/documents')),
    false,
  );
  assert.equal(
    mock.calls.some((call) => call.method === 'DELETE'),
    false,
  );
});

test('существующий объект другого сотрудника не меняется', async () => {
  const mock = createMockApi({
    objects: [
      {
        id: 'obj_foreign',
        clientName: OBJECT_NAME,
        assignedTo: 'u_other',
        documents: [],
        estimate: null,
      },
    ],
  });
  await assert.rejects(
    () =>
      runCrewTest({
        config: staffConfig(),
        renderPdfs: async () => samplePdf(),
        fetchImpl: mock.fetchImpl,
      }),
    /другому сотруднику/,
  );
  assert.equal(mock.state.objects.length, 1);
  assert.equal(mock.state.objects[0].assignedTo, 'u_other');
  assert.equal(
    mock.calls.some((call) => call.method === 'PATCH' || call.method === 'DELETE'),
    false,
  );
});

test('если API прячет спецификацию от владельца, проверка это показывает и ничего не удаляет', async () => {
  const mock = createMockApi({ ownerSeesSpec: false });
  const report = await runCrewTest({
    config: staffConfig(),
    renderPdfs: async () => samplePdf(),
    fetchImpl: mock.fetchImpl,
  });
  assert.equal(report.ok, false);
  assert.deepEqual(report.failed, ['owner.spec']);
  assert.equal(report.owner.estimateStatus, 200);
  assert.equal(report.owner.specStatus, 404);
  assert.equal(report.crew.specStatus, 200);
  assert.equal(report.crew.estimateStatus, 404);
  assert.equal(
    mock.calls.some((call) => call.method === 'DELETE'),
    false,
  );
});
