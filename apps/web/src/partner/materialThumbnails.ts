import type { PublicMaterial } from '../../../../packages/shared/materialsLib.js';
import { detectFileKind, type FileKind } from '../ui/filePreview/fileKind';
import { loadPdfJs, pdfDocumentOptions } from '../ui/filePreview/pdfjsLoader';
import { apiMaterialThumbnailConfirm, apiMaterialThumbnailTicket } from './apiClient';

/** Ширина миниатюры. Высота — по пропорциям файла, но не больше THUMB_MAX_HEIGHT (обрезка снизу). */
export const THUMB_WIDTH = 480;
export const THUMB_MAX_HEIGHT = 640;
const THUMB_TIMEOUT_MS = 20_000;

/** Размер холста миниатюры для исходника w×h. */
export function thumbSize(w: number, h: number): { width: number; height: number; scale: number } {
  if (!(w > 0) || !(h > 0)) return { width: THUMB_WIDTH, height: THUMB_WIDTH, scale: 1 };
  const scale = Math.min(1, THUMB_WIDTH / w);
  const width = Math.max(1, Math.round(w * scale));
  const height = Math.max(1, Math.min(THUMB_MAX_HEIGHT, Math.round(h * scale)));
  return { width, height, scale };
}

/** Каким способом строим миниатюру в браузере (docx и прочее — значок типа). */
export function thumbnailSource(kind: FileKind): 'image' | 'video' | 'pdf' | null {
  return kind === 'image' || kind === 'video' || kind === 'pdf' ? kind : null;
}

function withTimeout<T>(promise: Promise<T>, ms = THUMB_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = window.setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (v) => {
        window.clearTimeout(t);
        resolve(v);
      },
      (e) => {
        window.clearTimeout(t);
        reject(e);
      },
    );
  });
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(
      (webp) => {
        if (webp && webp.type === 'image/webp') return resolve(webp);
        // Safari не умеет webp в toBlob — тогда jpeg.
        canvas.toBlob((jpeg) => resolve(jpeg), 'image/jpeg', 0.82);
      },
      'image/webp',
      0.8,
    );
  });
}

function drawScaled(source: CanvasImageSource, w: number, h: number): HTMLCanvasElement {
  const { width, height, scale } = thumbSize(w, h);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, w * scale, h * scale);
  return canvas;
}

async function imageThumb(file: Blob): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file);
  try {
    return drawScaled(bitmap, bitmap.width, bitmap.height);
  } finally {
    bitmap.close();
  }
}

/** Почти одноцветный кадр (затемнение, заставка)? Считаем разброс яркости по уменьшенной копии. */
export function isFlatFrame(canvas: HTMLCanvasElement): boolean {
  const probe = document.createElement('canvas');
  probe.width = 32;
  probe.height = 24;
  const ctx = probe.getContext('2d');
  if (!ctx) return false;
  ctx.drawImage(canvas, 0, 0, 32, 24);
  const { data } = ctx.getImageData(0, 0, 32, 24);
  let sum = 0;
  let sq = 0;
  const n = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    const y = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    sum += y;
    sq += y * y;
  }
  const mean = sum / n;
  return Math.sqrt(Math.max(0, sq / n - mean * mean)) < 6;
}

function videoThumb(file: Blob): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    const done = (fn: () => void) => {
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(url);
      fn();
    };
    // Кадр на 1-й секунде, затем дальше, если кадр одноцветный (затемнение в начале ролика).
    let stops: number[] = [];
    let best: HTMLCanvasElement | null = null;
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.onloadedmetadata = () => {
      const d = Number.isFinite(video.duration) ? video.duration : 0;
      stops = d > 0 ? [1, 3, 8].filter((t) => t < d * 0.9) : [];
      if (!stops.length) stops = [d * 0.1 || 0];
      video.currentTime = stops.shift()!;
    };
    video.onseeked = () => {
      if (!video.videoWidth || !video.videoHeight) return done(() => reject(new Error('no frame')));
      const canvas = drawScaled(video, video.videoWidth, video.videoHeight);
      best = best ?? canvas;
      if (!isFlatFrame(canvas)) return done(() => resolve(canvas));
      const next = stops.shift();
      if (next === undefined) return done(() => resolve(best!));
      video.currentTime = next;
    };
    video.onerror = () => done(() => reject(new Error('video')));
    video.src = url;
  });
}

async function pdfThumb(file: Blob): Promise<HTMLCanvasElement> {
  const pdfjs = await loadPdfJs();
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), ...pdfDocumentOptions() });
  try {
    const pdf = await task.promise;
    const page = await pdf.getPage(1);
    const base = page.getViewport({ scale: 1 });
    // Первая страница всегда шириной THUMB_WIDTH (маленькие страницы — крупнее, без мыла).
    const scale = THUMB_WIDTH / base.width;
    const viewport = page.getViewport({ scale });
    const width = THUMB_WIDTH;
    const height = Math.max(1, Math.min(THUMB_MAX_HEIGHT, Math.round(base.height * scale)));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    await page.render({ canvas, viewport }).promise;
    return canvas;
  } finally {
    void task.destroy();
  }
}

/** Миниатюра файла в браузере: картинка, кадр видео или первая страница PDF. null — не умеем. */
export async function makeThumbnail(file: Blob, kind: FileKind): Promise<Blob | null> {
  const source = thumbnailSource(kind);
  if (!source || typeof document === 'undefined') return null;
  try {
    const canvas = await withTimeout(source === 'image' ? imageThumb(file) : source === 'video' ? videoThumb(file) : pdfThumb(file));
    return await canvasBlob(canvas);
  } catch {
    return null;
  }
}

/** Имя файла так же, как его чистит API (cleanName в materialsLib.js). */
export function materialName(name: string): string {
  return String(name ?? '').replace(/[\\/]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
}

/** Загрузить готовую миниатюру (админ): подписанный PUT → подтверждение. Возвращает свежий список. */
export async function uploadMaterialThumbnail(id: string, blob: Blob): Promise<PublicMaterial[]> {
  const type = blob.type === 'image/webp' || blob.type === 'image/png' ? blob.type : 'image/jpeg';
  const ticket = await apiMaterialThumbnailTicket(id, type);
  const response = await fetch(ticket.url, {
    method: 'PUT',
    headers: { 'Content-Type': ticket.headers?.['Content-Type'] || type },
    body: blob,
    credentials: 'omit',
  });
  if (!response.ok) throw new Error(`Хранилище ответило ${response.status}`);
  return apiMaterialThumbnailConfirm(id, ticket.storageKey);
}

/**
 * После загрузки файла админом: строим миниатюру из локального файла и отправляем.
 * Ошибки молча глотаем — без миниатюры список покажет значок типа.
 */
export async function thumbnailAfterUpload(
  file: File,
  materials: PublicMaterial[],
  match: { id?: string | null; parentId: string | null },
): Promise<PublicMaterial[] | null> {
  const item = match.id
    ? materials.find((m) => m.id === match.id)
    : materials.find((m) => m.kind === 'file' && (m.parentId ?? null) === match.parentId && m.name === materialName(file.name));
  if (!item || item.hasThumbnail) return null;
  const blob = await makeThumbnail(file, detectFileKind(file.type || item.mime, file.name));
  if (!blob) return null;
  try {
    return await uploadMaterialThumbnail(item.id, blob);
  } catch {
    return null;
  }
}
