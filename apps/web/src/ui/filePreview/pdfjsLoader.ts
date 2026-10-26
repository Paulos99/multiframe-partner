/**
 * pdf.js (pdfjs-dist, сборка legacy — работает и в старых мобильных браузерах).
 * Загружается лениво: только когда открывают PDF или строят миниатюру.
 * Шрифты, CMap и wasm-декодеры лежат рядом с сайтом в /pdfjs/ (копирует vite.config.ts).
 */
type PdfJs = typeof import('pdfjs-dist/legacy/build/pdf.mjs');

let pending: Promise<PdfJs> | null = null;

export function loadPdfJs(): Promise<PdfJs> {
  if (!pending) {
    pending = Promise.all([
      import('pdfjs-dist/legacy/build/pdf.mjs'),
      // Обычный чанк приложения, не Worker: модульный воркер в Chromium падает
      // на blob:-адресе (ERR_FILE_NOT_FOUND) и предпросмотр пишет «Не удалось открыть PDF».
      import('pdfjs-dist/legacy/build/pdf.worker.min.mjs'),
    ])
      .then(([lib, worker]) => {
        const host = globalThis as typeof globalThis & {
          pdfjsWorker?: { WorkerMessageHandler?: unknown };
        };
        host.pdfjsWorker = worker;
        // Адрес воркера больше не используется: страницы считаются на этой вкладке.
        lib.GlobalWorkerOptions.workerSrc = 'main-thread';
        return lib;
      })
      .catch((error: unknown) => {
        // Сеть пропала посреди загрузки чанка — следующая попытка начнёт заново.
        pending = null;
        throw error;
      });
  }
  return pending;
}

/** Общие параметры getDocument: без eval, без XFA, ресурсы со своего сайта. */
export function pdfDocumentOptions() {
  const base = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');
  return {
    cMapUrl: `${base}pdfjs/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${base}pdfjs/standard_fonts/`,
    wasmUrl: `${base}pdfjs/wasm/`,
    iccUrl: `${base}pdfjs/iccs/`,
    isEvalSupported: false,
    enableXfa: false,
    withCredentials: false,
  } as const;
}

export { canvasPixelRatio } from './viewerMath';
