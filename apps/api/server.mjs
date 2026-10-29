// Самостоятельный HTTP-сервер для API: тот же обработчик, что и в облачной функции Яндекса.
// Запуск: node server.mjs   (порт — PORT, по умолчанию 8080; адрес — HOST, по умолчанию 127.0.0.1)
// Ставьте за обратным прокси (nginx/Caddy): сервер сам TLS не терминирует.
// За прокси укажите TRUST_PROXY=1 — тогда адрес клиента берётся из X-Forwarded-For, который прокси перезаписывает.
import http from 'node:http';
import { isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { handler } from './index.js';
import { setDocumentStore } from './objectStore.js';

// Своя база для документов платформы: DOCUMENT_STORE_MODULE=/путь/к/adapter.mjs (см. docs/handover/DATA_LAYER.md).
// Модуль экспортирует по умолчанию объект хранилища или функцию create(), которая его возвращает.
if (process.env.DOCUMENT_STORE_MODULE) {
  const file = process.env.DOCUMENT_STORE_MODULE;
  const mod = await import(pathToFileURL(isAbsolute(file) ? file : resolve(process.cwd(), file)).href);
  const exported = mod.default ?? mod;
  setDocumentStore(typeof exported.create === 'function' ? await exported.create() : exported);
  console.log('Документы платформы: подключено собственное хранилище');
}

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '127.0.0.1';
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
const MAX_BYTES = Number(process.env.MAX_BODY_BYTES || 6_000_000) * 1.5;

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BYTES) {
        reject(Object.assign(new Error('too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function sourceIp(req) {
  if (TRUST_PROXY) {
    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (forwarded) return forwarded;
  }
  return req.socket.remoteAddress || '';
}

const server = http.createServer(async (req, res) => {
  try {
    const body = ['GET', 'HEAD', 'OPTIONS'].includes(req.method) ? Buffer.alloc(0) : await readBody(req);
    const url = new URL(req.url, 'http://localhost');
    const event = {
      httpMethod: req.method,
      path: url.pathname,
      url: url.pathname,
      headers: req.headers,
      queryStringParameters: Object.fromEntries(url.searchParams.entries()),
      requestContext: { identity: { sourceIp: sourceIp(req) } },
      body: body.length ? body.toString('base64') : '',
      isBase64Encoded: body.length > 0,
    };
    const out = await handler(event);
    const headers = { ...(out.headers || {}) };
    const payload = out.body
      ? out.isBase64Encoded
        ? Buffer.from(out.body, 'base64')
        : Buffer.from(String(out.body), 'utf8')
      : Buffer.alloc(0);
    headers['Content-Length'] = payload.length;
    res.writeHead(out.statusCode || 200, headers);
    res.end(req.method === 'HEAD' ? undefined : payload);
  } catch (error) {
    const status = error?.status === 413 ? 413 : 500;
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: status === 413 ? 'Запрос слишком большой' : 'Внутренняя ошибка' }));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`API слушает ${HOST}:${PORT}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
