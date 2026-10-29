/**
 * PDF «Фотоотчёт» комнаты. Собирается в браузере тем же способом, что «Профиль» Проблемомера:
 * страницы HTML → картинки → jsPDF. Снимки берутся с API по подписанным ссылкам (pdfUrl, у них есть CORS),
 * новых файлов и хранилищ нет: PDF не сохраняется на сервере, а собирается из фото, которые уже лежат в бакете партнёров.
 */
import {
  PAGE_H,
  PAGE_W,
  loadIframeDocument,
  triggerDownload,
  waitFrames,
} from '../../state/reportPdf';
import { buildPhotoReportHtml, type ReportPhoto } from './photoReportHtml';
import type { PhotoStage } from '../../../../../packages/shared/roomPhotos.js';
import { resolvePhotoUrl } from '../apiClient';

export type PdfSourcePhoto = { stage: PhotoStage; createdAt: string; pdfUrl?: string; thumbUrl: string };

export class PhotoPdfError extends Error {}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new PhotoPdfError('Не удалось прочитать фото'));
    reader.readAsDataURL(blob);
  });
}

async function loadPhoto(photo: PdfSourcePhoto): Promise<ReportPhoto> {
  const url = resolvePhotoUrl(photo.pdfUrl || photo.thumbUrl);
  let response: Response;
  try {
    response = await fetch(url, { credentials: 'omit' });
  } catch {
    throw new PhotoPdfError('Не удалось загрузить фото для PDF. Проверьте связь и повторите.');
  }
  if (!response.ok) throw new PhotoPdfError('Ссылка на фото устарела. Обновите страницу и повторите.');
  return { stage: photo.stage, createdAt: photo.createdAt, dataUrl: await blobToDataUrl(await response.blob()) };
}

/** Снимки по четыре, чтобы не открывать десятки соединений сразу. */
async function loadPhotos(photos: readonly PdfSourcePhoto[]): Promise<ReportPhoto[]> {
  const out: ReportPhoto[] = [];
  for (let i = 0; i < photos.length; i += 4) {
    out.push(...(await Promise.all(photos.slice(i, i + 4).map(loadPhoto))));
  }
  return out;
}

export function photoReportFilename(roomName: string): string {
  const safe = roomName.trim().replace(/[^\wа-яА-ЯёЁ\-]+/gi, '_').slice(0, 24) || 'комната';
  return `MultiFrame_фотоотчёт_${safe}.pdf`;
}

export async function renderPhotoReportPdf(input: {
  roomName: string;
  photos: readonly PdfSourcePhoto[];
}): Promise<{ blob: Blob; filename: string }> {
  if (!input.photos.length) throw new PhotoPdfError('В комнате пока нет фото для отчёта.');
  const loaded = await loadPhotos(input.photos);
  const html = buildPhotoReportHtml({ roomName: input.roomName, photos: loaded });

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.setAttribute('title', 'PDF');
  iframe.style.cssText = [
    'position:fixed',
    'left:0',
    'top:0',
    `width:${PAGE_W}px`,
    `height:${PAGE_H}px`,
    'border:0',
    'opacity:0.01',
    'pointer-events:none',
    'z-index:2147483646',
    'background:#f4f7f6',
  ].join(';');
  document.body.appendChild(iframe);
  try {
    const idoc = await loadIframeDocument(iframe, html);
    const pages = Array.from(idoc.querySelectorAll('.page')) as HTMLElement[];
    if (!pages.length) throw new PhotoPdfError('Не удалось собрать отчёт');
    await Promise.all(
      Array.from(idoc.images).map((img) =>
        img.complete
          ? Promise.resolve()
          : new Promise<void>((done) => {
              img.onload = () => done();
              img.onerror = () => done();
            }),
      ),
    );
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    for (let i = 0; i < pages.length; i++) {
      pages.forEach((page, j) => {
        page.style.display = j === i ? 'block' : 'none';
      });
      await waitFrames(2);
      const canvas = await html2canvas(pages[i]!, {
        scale: 1.6,
        backgroundColor: '#f4f7f6',
        useCORS: true,
        logging: false,
        foreignObjectRendering: false,
        windowWidth: PAGE_W,
        windowHeight: PAGE_H,
      });
      if (i > 0) pdf.addPage();
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.85), 'JPEG', 0, 0, pageW, pageH, undefined, 'FAST');
    }
    return { blob: pdf.output('blob'), filename: photoReportFilename(input.roomName) };
  } finally {
    iframe.remove();
  }
}

/** «Открыть PDF»: во вкладке; если браузер не дал открыть вкладку, файл скачивается. */
export function openPdfBlob(blob: Blob, filename: string, target: Window | null): void {
  const url = URL.createObjectURL(blob);
  if (target && !target.closed) {
    target.location.href = url;
  } else {
    triggerDownload(blob, filename);
  }
  // Адрес не отзываем: вкладка с PDF может понадобиться позже (скачать, поделиться).
}
