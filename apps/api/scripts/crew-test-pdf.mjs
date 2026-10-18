/**
 * PDF сметы и спецификации — тот же механизм, что при сохранении объекта из калькулятора.
 * Страница калькулятора открывается в headless Chrome. Дальше вызываются существующие модули:
 * Room + PolygonPanelCalculator, buildBOM, buildPdfSchemeImages и два exportCalculationPDF
 * (hidePrices false / true). Новый генератор здесь не рисуется.
 */
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { OBJECT_NAME, calculatorModuleBase } from './crew-test-object-lib.mjs';

const PUBLIC_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web/public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};

function fileUnderRoot(root, urlPath) {
  let rel = decodeURIComponent(urlPath.split('?')[0]);
  if (rel.endsWith('/')) rel += 'index.html';
  rel = rel.replace(/^\/+/, '');
  const full = path.resolve(root, rel);
  if (full !== root && !full.startsWith(root + path.sep)) return null;
  return full;
}

export function startPublicServer(root = PUBLIC_ROOT) {
  const server = createServer(async (req, res) => {
    try {
      const full = fileUnderRoot(root, req.url || '/');
      if (!full) {
        res.writeHead(403);
        res.end();
        return;
      }
      const data = await readFile(full);
      const type = MIME[path.extname(full).toLowerCase()] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        server,
        url: `http://127.0.0.1:${port}/calculator/index.html`,
      });
    });
  });
}

function chromeExecutable(explicit) {
  const candidates = [
    explicit,
    process.env.CHROME_PATH,
    '/usr/local/bin/google-chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate)) || '';
}

async function buildPdfsInPage({ moduleBase, length, width, fileLabel }) {
  const [geom, roomMod, calcMod, bomMod, schemeMod, pdfMod] = await Promise.all([
    import(new URL('src/core/polygon-geometry.js', moduleBase).href),
    import(new URL('src/core/room-model.js', moduleBase).href),
    import(new URL('src/calculators/polygon-ceiling-calculator.js', moduleBase).href),
    import(new URL('src/calculators/materials-bom.js', moduleBase).href),
    import(new URL('src/export/pdf-scheme-render.js', moduleBase).href),
    import(new URL('src/export/pdf-export.js', moduleBase).href),
  ]);
  const room = new roomMod.Room({
    vertices: geom.createRectangleVertices(length, width),
    wallHeight: 2.7,
  });
  const ceilingCalc = new calcMod.PolygonPanelCalculator(room.vertices);
  const ceilingResult = ceilingCalc.calculateBestScheme({ fast: true });
  const options = {
    calcCeiling: true,
    calcWalls: false,
    ceilingMounting: 'ceiling_frameless',
    wallMounting: 'wall_frameless',
  };
  const bom = bomMod.buildBOM({
    room,
    ceilingResult,
    wallResult: null,
    options,
  });
  const images = schemeMod.buildPdfSchemeImages({
    room,
    ceilingCalc,
    ceilingResult,
    wallResults: [],
    options,
    showNumbers: true,
    showFrame: false,
  });
  const fileDate = new Date().toISOString();
  const shared = {
    bom,
    room,
    ceilingImage: images.ceilingImage,
    wallSurfaces: images.wallSurfaces,
    planImage: images.planImage,
    areaEstimate: false,
    download: false,
    fileLabel,
    fileDate,
  };
  const priced = await pdfMod.exportCalculationPDF({ ...shared, hidePrices: false });
  const spec = await pdfMod.exportCalculationPDF({ ...shared, hidePrices: true });

  async function toBase64(blob) {
    const buf = blob instanceof Blob ? await blob.arrayBuffer() : blob;
    const bytes = new Uint8Array(buf);
    let binary = '';
    const size = 0x8000;
    for (let i = 0; i < bytes.length; i += size) {
      binary += String.fromCharCode(...bytes.subarray(i, i + size));
    }
    return btoa(binary);
  }

  return {
    estimatePdfBase64: await toBase64(priced.blob),
    specPdfBase64: await toBase64(spec.blob),
    estimateFilename: priced.filename,
    specFilename: spec.filename,
    panels: bom.total?.panelsWithReserve ?? 0,
    dowels: bom.total?.dowelsWithReserve ?? 0,
    panelsCost: bom.total?.totalCost ?? null,
    areaM2: Math.round(room.getTotalArea() * 10) / 10,
  };
}

export async function renderCalculatorPdfs(config) {
  const log = config.log || (() => {});
  const chromePath = chromeExecutable(config.chromePath);
  if (!chromePath) {
    throw new Error('Не найден Chrome. Задайте CHROME_PATH');
  }
  let server = null;
  let pageUrl = config.calcUrl;
  if (!pageUrl) {
    if (!existsSync(path.join(PUBLIC_ROOT, 'calculator', 'index.html'))) {
      throw new Error('Не найден apps/web/public/calculator/index.html');
    }
    const started = await startPublicServer();
    server = started.server;
    pageUrl = started.url;
  }
  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
  try {
    log(`Калькулятор ${pageUrl}`);
    const context = await browser.newContext({ locale: 'ru-RU' });
    const page = await context.newPage();
    page.setDefaultTimeout(180000);
    await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('#entryDimsBtn', { timeout: 30000 });
    const moduleBase = calculatorModuleBase(page.url());
    const result = await page.evaluate(buildPdfsInPage, {
      moduleBase,
      length: config.length,
      width: config.width,
      fileLabel: OBJECT_NAME,
    });
    log('PDF собраны калькулятором');
    return result;
  } finally {
    await browser.close();
    if (server) await new Promise((resolve) => server.close(resolve));
  }
}
