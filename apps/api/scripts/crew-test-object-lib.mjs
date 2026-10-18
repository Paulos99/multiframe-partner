/**
 * HTTP-часть тестового объекта монтажника.
 * Пароли и токены сюда не записываются: их передают в env на время запуска.
 * PDF этот модуль не рисует — байты приходят из калькулятора (crew-test-pdf.mjs).
 */

export const OBJECT_NAME = 'ТЕСТ доступ монтажника';
export const COMPANY = 'Потолки Столицы';
export const ROOM_LENGTH_M = 4;
export const ROOM_WIDTH_M = 3.5;
export const DEFAULT_API_BASE = 'https://d5dff69141o8r1ehqm09.l5v6loqa.apigw.yandexcloud.net';

const MONEY_KEYS = new Set([
  'panelsCost',
  'installCost',
  'dowelsCost',
  'totalCost',
  'grandTotal',
  'panelPriceRub',
  'pricePerM2',
  'installPricePerM2',
  'dowelPriceRub',
]);

export function readConfig(env, argv) {
  let dryRun = false;
  let outDir = '';
  let calcUrl = env.CALC_URL || '';
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--out') {
      outDir = argv[i + 1] || '';
      i += 1;
      if (!outDir || outDir.startsWith('--')) throw new Error('У --out нужен путь к папке');
    } else if (arg === '--calc-url') {
      calcUrl = argv[i + 1] || '';
      i += 1;
      if (!calcUrl || calcUrl.startsWith('--')) {
        throw new Error('У --calc-url нужен адрес страницы калькулятора');
      }
    } else {
      throw new Error(`Неизвестный аргумент ${arg}`);
    }
  }
  return {
    dryRun,
    outDir,
    apiBase: String(env.API_BASE || env.VITE_API_URL || DEFAULT_API_BASE).replace(/\/$/, ''),
    login: env.MF_STAFF_LOGIN || '',
    password: env.MF_STAFF_PASSWORD || '',
    crewLogin: env.MF_CREW_LOGIN || '',
    crewPassword: env.MF_CREW_PASSWORD || '',
    calcUrl,
    chromePath: env.CHROME_PATH || '',
    length: ROOM_LENGTH_M,
    width: ROOM_WIDTH_M,
  };
}

export function calculatorModuleBase(pageUrl) {
  const url = new URL(pageUrl);
  if (url.pathname.endsWith('.html')) {
    url.pathname = url.pathname.slice(0, url.pathname.lastIndexOf('/') + 1);
  } else if (!url.pathname.endsWith('/')) {
    url.pathname += '/';
  }
  url.search = '';
  url.hash = '';
  return url.href;
}

export function assertCredentials(config) {
  const missing = [];
  if (!config.login) missing.push('MF_STAFF_LOGIN');
  if (!config.password) missing.push('MF_STAFF_PASSWORD');
  if (!config.crewLogin) missing.push('MF_CREW_LOGIN');
  if (!config.crewPassword) missing.push('MF_CREW_PASSWORD');
  if (missing.length) {
    throw new Error(`Нужны переменные ${missing.join(', ')}`);
  }
}

export function priceHits(value) {
  const hits = [];
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    for (const [key, item] of Object.entries(node)) {
      if (MONEY_KEYS.has(key) && item != null && item !== 0) hits.push(key);
      if (key === 'storageKey' && item) hits.push('storageKey');
      if (typeof item === 'string' && /₽|руб/i.test(item)) hits.push('text');
      else if (item && typeof item === 'object') walk(item);
    }
  };
  walk(value);
  return hits;
}

export function isPdfBase64(value) {
  const raw = String(value || '').replace(/^data:application\/pdf;base64,/, '');
  if (raw.length < 8) return false;
  try {
    return Buffer.from(raw.slice(0, 24), 'base64').toString('utf8').startsWith('%PDF');
  } catch {
    return false;
  }
}

export function assertReportSafe(report, secrets) {
  const text = JSON.stringify(report);
  for (const secret of secrets) {
    if (secret && text.includes(secret)) {
      throw new Error('Отчёт содержит секрет, печать остановлена');
    }
  }
  if (/bearer\s+[a-z0-9._~+/-]+=*/i.test(text)) {
    throw new Error('Отчёт содержит секрет, печать остановлена');
  }
}

function pdfBytes(base64) {
  return Buffer.from(String(base64 || ''), 'base64').length;
}

function pdfSummary(pdf, files) {
  return {
    areaM2: pdf.areaM2,
    panels: pdf.panels,
    dowels: pdf.dowels,
    estimateFilename: pdf.estimateFilename,
    specFilename: pdf.specFilename,
    estimateBytes: pdfBytes(pdf.estimatePdfBase64),
    specBytes: pdfBytes(pdf.specPdfBase64),
    ...(files ? { files } : {}),
  };
}

function requirePdfPair(pdf) {
  if (!pdf || !isPdfBase64(pdf.estimatePdfBase64) || !isPdfBase64(pdf.specPdfBase64)) {
    throw new Error('Калькулятор не вернул два PDF');
  }
  if (pdf.estimatePdfBase64 === pdf.specPdfBase64) {
    throw new Error('Смета и спецификация совпали побайтно');
  }
}

export function buildEstimate(pdf, org) {
  const panels = Math.max(0, Math.round(Number(pdf.panels) || 0));
  const dowels = Math.max(0, Math.round(Number(pdf.dowels) || 0));
  const area = Number(pdf.areaM2);
  const panelsCost = pdf.panelsCost != null && Number.isFinite(Number(pdf.panelsCost))
    ? Math.round(Number(pdf.panelsCost))
    : null;
  const installCost =
    org?.installPricePerM2 != null && Number.isFinite(Number(org.installPricePerM2)) && area > 0
      ? Math.round(area * Number(org.installPricePerM2))
      : null;
  const dowelsCost =
    org?.dowelPriceRub != null && Number.isFinite(Number(org.dowelPriceRub)) && dowels > 0
      ? Math.round(dowels * Number(org.dowelPriceRub))
      : null;
  const parts = [panelsCost, installCost, dowelsCost].filter((v) => v != null);
  return {
    panels,
    dowels,
    panelsCost,
    installCost,
    dowelsCost,
    totalCost: parts.length ? parts.reduce((sum, n) => sum + n, 0) : null,
  };
}

function createClient(fetchImpl, apiBase) {
  const requests = [];
  async function request(method, pathname, { token, body } = {}) {
    if (method === 'DELETE') {
      throw new Error('Скрипт ничего не удаляет');
    }
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

async function login(http, loginName, password, who) {
  const res = await http.request('POST', '/auth/login', {
    body: { login: loginName, password },
  });
  if (res.status !== 200 || !res.data?.token || !res.data?.user) {
    throw new Error(`${who}: вход не выполнен (${res.status})`);
  }
  return res.data;
}

function assertCompanyUser(user, roles, who) {
  if (!roles.includes(user.role)) {
    throw new Error(`${who}: ожидалась роль ${roles.join(' или ')}`);
  }
  if (user.org?.companyName !== COMPANY) {
    throw new Error(`${who}: нужна компания «${COMPANY}»`);
  }
}

export async function runCrewTest({ config, fetchImpl, renderPdfs, writeFiles, log = () => {} }) {
  if (!config.dryRun) assertCredentials(config);

  log(config.dryRun ? 'dry-run: калькулятор, без API' : `API ${config.apiBase}`);
  const pdf = await renderPdfs(config);
  requirePdfPair(pdf);
  const files = config.outDir && writeFiles ? await writeFiles(config.outDir, pdf) : undefined;
  if (config.dryRun) {
    return {
      ok: true,
      dryRun: true,
      objectName: OBJECT_NAME,
      pdf: pdfSummary(pdf, files),
      requests: [],
    };
  }

  const http = createClient(fetchImpl, config.apiBase);
  const staffSession = await login(http, config.login, config.password, 'Владелец или менеджер');
  assertCompanyUser(staffSession.user, ['owner', 'sales'], 'Владелец или менеджер');
  const staffToken = staffSession.token;
  const org = staffSession.user.org || {};

  const staffList = await http.request('GET', '/org/staff', { token: staffToken });
  if (staffList.status !== 200) {
    throw new Error(`Список сотрудников: ${staffList.status}`);
  }
  const crewStaff = (staffList.data.staff || []).find(
    (person) => person.login === config.crewLogin && person.role === 'crew',
  );
  if (!crewStaff?.id) {
    throw new Error('Монтажник с таким логином не найден в компании');
  }

  const crewSession = await login(http, config.crewLogin, config.crewPassword, 'Монтажник');
  assertCompanyUser(crewSession.user, ['crew'], 'Монтажник');
  if (crewSession.user.id !== crewStaff.id) {
    throw new Error('Логин монтажника не совпал с карточкой сотрудника');
  }
  const crewToken = crewSession.token;

  const ownerList = await http.request('GET', '/objects', { token: staffToken });
  if (ownerList.status !== 200) throw new Error(`Список объектов: ${ownerList.status}`);
  const matches = (ownerList.data.objects || []).filter((obj) => obj.clientName === OBJECT_NAME);
  if (matches.length > 1) {
    throw new Error('Уже несколько объектов с этим именем, новый не создаю');
  }

  let created = false;
  let assigned = false;
  let uploaded = false;
  let obj = matches[0] || null;

  if (!obj) {
    const estimate = buildEstimate(pdf, org);
    const createdRes = await http.request('POST', '/objects', {
      token: staffToken,
      body: {
        clientName: OBJECT_NAME,
        clientPhone: '',
        address: 'Проверка доступа монтажника',
        city: org.city || 'Москва',
        status: 'install',
        assignedTo: crewStaff.id,
        room: { areaM2: pdf.areaM2 },
        estimate,
        clientSummary: `Калькулятор · ${pdf.areaM2} м² · ${estimate.panels} пан. · ${estimate.dowels} дюб.`,
        updatedAt: new Date().toISOString(),
      },
    });
    if (createdRes.status !== 200 || !createdRes.data?.object?.id) {
      throw new Error(`Создание объекта: ${createdRes.status}`);
    }
    obj = createdRes.data.object;
    created = true;
  } else if (obj.assignedTo && obj.assignedTo !== crewStaff.id) {
    throw new Error('Объект с этим именем назначен другому сотруднику, не меняю его');
  } else if (obj.assignedTo !== crewStaff.id) {
    const patched = await http.request('PATCH', `/objects/${encodeURIComponent(obj.id)}`, {
      token: staffToken,
      body: { assignedTo: crewStaff.id, updatedAt: new Date().toISOString() },
    });
    if (patched.status !== 200 || !patched.data?.object) {
      throw new Error(`Назначение монтажника: ${patched.status}`);
    }
    obj = patched.data.object;
    assigned = true;
  }

  let crewObjects = await http.request('GET', '/objects', { token: crewToken });
  if (crewObjects.status !== 200) throw new Error(`Объекты монтажника: ${crewObjects.status}`);
  let crewObj = (crewObjects.data.objects || []).find((item) => item.id === obj.id) || null;
  if (!crewObj) throw new Error('Монтажник не видит объект');

  const ownerHasEstimate = (obj.documents || []).some((doc) => doc.kind === 'estimate');
  const crewHasSpec = (crewObj.documents || []).some((doc) => doc.kind === 'spec');
  if (!ownerHasEstimate || !crewHasSpec) {
    const documents = [];
    if (!ownerHasEstimate) {
      documents.push({
        kind: 'estimate',
        filename: pdf.estimateFilename,
        pdfBase64: pdf.estimatePdfBase64,
        hasScheme: true,
        panels: pdf.panels,
        areaM2: pdf.areaM2,
      });
    }
    if (!crewHasSpec) {
      documents.push({
        kind: 'spec',
        filename: pdf.specFilename,
        pdfBase64: pdf.specPdfBase64,
        hasScheme: true,
        panels: pdf.panels,
        areaM2: pdf.areaM2,
      });
    }
    const uploadedRes = await http.request('POST', `/objects/${encodeURIComponent(obj.id)}/documents`, {
      token: staffToken,
      body: { versionId: `ver_${Date.now().toString(36)}`, documents },
    });
    if (uploadedRes.status !== 200) {
      throw new Error(`Загрузка PDF: ${uploadedRes.status}`);
    }
    uploaded = true;
    obj = uploadedRes.data.object || obj;
    crewObjects = await http.request('GET', '/objects', { token: crewToken });
    crewObj = (crewObjects.data.objects || []).find((item) => item.id === obj.id) || null;
    if (!crewObj) throw new Error('Монтажник не видит объект после загрузки PDF');
  }

  const freshOwner = await http.request('GET', '/objects', { token: staffToken });
  obj = (freshOwner.data.objects || []).find((item) => item.id === obj.id) || obj;
  const estimateDoc = (obj.documents || []).find((doc) => doc.kind === 'estimate');
  const specDoc = (crewObj.documents || []).find((doc) => doc.kind === 'spec');
  const orgId = staffSession.user.orgId;

  async function download(token, docId) {
    if (!docId) return { status: 0, pdf: false };
    const res = await http.request(
      'GET',
      `/objects/${encodeURIComponent(obj.id)}/documents/${encodeURIComponent(docId)}`,
      { token },
    );
    return { status: res.status, pdf: res.status === 200 && isPdfBase64(res.data?.pdfBase64) };
  }

  const crewSpec = await download(crewToken, specDoc?.id);
  const crewEstimate = await download(crewToken, estimateDoc?.id);
  const storageKey = orgId && estimateDoc?.id ? `docs/${orgId}/${obj.id}/${estimateDoc.id}.pdf` : '';
  const storageRes = storageKey
    ? await http.request(
        'GET',
        `/objects/${encodeURIComponent(obj.id)}/documents/${encodeURIComponent(storageKey)}`,
        { token: crewToken },
      )
    : { status: 0 };
  const ownerEstimate = await download(staffToken, estimateDoc?.id);
  const ownerSpec = await download(staffToken, specDoc?.id);

  const hits = priceHits(crewObj);
  const estimateListed = (crewObj.documents || []).some((doc) => doc.kind === 'estimate');
  const failed = [];
  if (crewSpec.status !== 200 || !crewSpec.pdf) failed.push('crew.spec');
  if (!estimateDoc?.id || crewEstimate.status !== 404) failed.push('crew.estimate');
  if (storageRes.status !== 404) failed.push('crew.storageKey');
  if (hits.length || estimateListed) failed.push('crew.prices');
  if (ownerEstimate.status !== 200 || !ownerEstimate.pdf) failed.push('owner.estimate');
  if (ownerSpec.status !== 200 || !ownerSpec.pdf) failed.push('owner.spec');

  return {
    ok: failed.length === 0,
    dryRun: false,
    objectName: OBJECT_NAME,
    objectId: obj.id,
    created,
    assigned,
    uploaded,
    failed,
    pdf: pdfSummary(pdf, files),
    crew: {
      objectVisible: true,
      specStatus: crewSpec.status,
      estimateStatus: crewEstimate.status,
      storageKeyStatus: storageRes.status,
      prices: hits,
      estimateListed,
    },
    owner: {
      estimateStatus: ownerEstimate.status,
      specStatus: ownerSpec.status,
    },
    requests: http.requests,
  };
}
