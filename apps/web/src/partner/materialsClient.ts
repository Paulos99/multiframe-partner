import type { MaterialNode, PublicMaterial } from '../../../api/materialsLib.js';
import {
  MATERIAL_DIRECT_MAX_BYTES,
  addFile,
  createFolder,
  deleteMaterial,
  findMaterial,
  publicMaterials,
  renameMaterial,
  replaceFile,
} from '../../../api/materialsLib.js';
import {
  apiCreateMaterialFolder,
  apiDeleteMaterial,
  apiListMaterials,
  apiMaterialContent,
  apiMaterialMultipartAbort,
  apiMaterialMultipartComplete,
  apiMaterialMultipartParts,
  apiMaterialMultipartStart,
  apiMaterialPreview,
  apiRenameMaterial,
  apiReplaceMaterial,
  apiUploadMaterial,
  hasRemoteApi,
} from './apiClient';
import { loadDb, loadToken, saveDb } from './localStore';

export type { PublicMaterial };

const MAX_FILE_BYTES = 2_000_000;

export function materialKindLabel(item: PublicMaterial): string {
  if (item.kind === 'folder') return 'Папка';
  if (item.stub === 'video-install' || item.mime?.startsWith('video/')) return 'Видео';
  if (item.stub?.startsWith('deck-') || item.mime?.includes('presentation')) return 'Презентация';
  if (item.stub === 'instruction-install') return 'Инструкция';
  if (item.mime === 'application/pdf') return 'PDF';
  if (item.mime?.startsWith('image/')) return 'Изображение';
  if (item.mime?.includes('wordprocessingml') || item.mime === 'application/msword') return 'Документ';
  return 'Файл';
}

function persistLocal(nodes: MaterialNode[]) {
  const db = loadDb();
  try {
    saveDb({ ...db, materials: nodes });
  } catch {
    throw new Error('Не хватает места в браузере для этого файла');
  }
}

function base64ToBlob(b64: string, mime: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function localList(): PublicMaterial[] {
  return publicMaterials(loadDb().materials);
}

/** Материалы идут через API (а не localStorage) — тогда есть миниатюры и их загрузка. */
export function materialsUseApi(): boolean {
  return remoteEnabled();
}

function remoteEnabled(): boolean {
  return hasRemoteApi() && Boolean(loadToken());
}

function missingApi(error: unknown): boolean {
  const message = error instanceof Error ? error.message : '';
  return /not found|404/i.test(message);
}

export async function listMaterials(): Promise<PublicMaterial[]> {
  if (remoteEnabled()) {
    try {
      return await apiListMaterials();
    } catch (error) {
      if (missingApi(error)) return publicMaterials(undefined);
      throw error;
    }
  }
  return localList();
}

export async function createMaterialFolder(
  name: string,
  parentId: string | null,
): Promise<PublicMaterial[]> {
  if (remoteEnabled()) return apiCreateMaterialFolder(name, parentId);
  const result = createFolder(loadDb().materials, {
    name,
    parentId,
    id: `mat_${Math.random().toString(36).slice(2, 10)}`,
    now: new Date().toISOString(),
  });
  if (!result.ok) throw new Error(result.message);
  persistLocal(result.nodes);
  return localList();
}

async function filePayload(file: File): Promise<{ mime: string; contentBase64: string }> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error('Файл больше 2 МБ. Крупнее текущий шлюз API не примет.');
  }
  const contentBase64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const raw = String(reader.result || '');
      const comma = raw.indexOf(',');
      resolve(comma >= 0 ? raw.slice(comma + 1) : raw);
    };
    reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
    reader.readAsDataURL(file);
  });
  return { mime: file.type || 'application/octet-stream', contentBase64 };
}

export type UploadProgress = (loaded: number, total: number) => void;

const PART_CONCURRENCY = 4;
const PART_RETRIES = 4;

/** PUT одной части по подписанной ссылке с прогрессом. Резолвится при 2xx. */
function putPart(url: string, blob: Blob, onBytes: (loaded: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.upload.onprogress = (event) => onBytes(event.loaded);
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Хранилище ответило ${xhr.status}`));
    xhr.onerror = () => reject(new Error('Сеть оборвалась при загрузке части'));
    xhr.send(blob);
  });
}

/**
 * Загрузка любого файла любого размера (до 5 ТБ) напрямую в приватный бакет
 * материалов: multipart, части по 8–100 МБ, 4 параллельно, каждая с повторами.
 * Ссылки подписывает API только для админа StP; метаданные пишет complete.
 */
async function uploadMaterialMultipart(
  file: File,
  parentId: string | null,
  onProgress?: UploadProgress,
): Promise<PublicMaterial[]> {
  if (file.size > MATERIAL_DIRECT_MAX_BYTES) throw new Error('Файл больше 5 ТБ');
  const ticket = await apiMaterialMultipartStart({
    name: file.name,
    size: file.size,
    mime: file.type || undefined,
  });
  const loaded = new Map<number, number>();
  const report = () => {
    let sum = 0;
    loaded.forEach((value) => (sum += value));
    onProgress?.(Math.min(sum, file.size), file.size);
  };
  const queue = Array.from({ length: ticket.partCount }, (_, i) => i + 1);
  const sendPart = async (n: number) => {
    const start = (n - 1) * ticket.partSize;
    const blob = file.slice(start, Math.min(start + ticket.partSize, file.size));
    let lastError: unknown;
    for (let attempt = 0; attempt < PART_RETRIES; attempt += 1) {
      try {
        // Свежая подпись на каждую попытку: долгие загрузки переживают истечение ссылки.
        const { urls } = await apiMaterialMultipartParts({
          storageKey: ticket.storageKey,
          uploadId: ticket.uploadId,
          partNumbers: [n],
        });
        await putPart(urls[n], blob, (bytes) => {
          loaded.set(n, bytes);
          report();
        });
        loaded.set(n, blob.size);
        report();
        return;
      } catch (error) {
        lastError = error;
        loaded.set(n, 0);
        report();
        await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      }
    }
    throw lastError instanceof Error ? lastError : new Error('Не удалось загрузить часть файла');
  };
  try {
    await Promise.all(
      Array.from({ length: Math.min(PART_CONCURRENCY, queue.length) }, async () => {
        for (let n = queue.shift(); n !== undefined; n = queue.shift()) await sendPart(n);
      }),
    );
    return await apiMaterialMultipartComplete({
      storageKey: ticket.storageKey,
      uploadId: ticket.uploadId,
      partCount: ticket.partCount,
      name: file.name,
      parentId,
    });
  } catch (error) {
    await apiMaterialMultipartAbort({ storageKey: ticket.storageKey, uploadId: ticket.uploadId }).catch(
      () => undefined,
    );
    throw error;
  }
}

export async function uploadMaterialFile(
  file: File,
  parentId: string | null,
  onProgress?: UploadProgress,
): Promise<PublicMaterial[]> {
  if (remoteEnabled() && file.size > MAX_FILE_BYTES) {
    return uploadMaterialMultipart(file, parentId, onProgress);
  }
  const payload = await filePayload(file);
  if (remoteEnabled()) {
    return apiUploadMaterial({
      name: file.name,
      parentId,
      mime: payload.mime,
      contentBase64: payload.contentBase64,
    });
  }
  const result = addFile(loadDb().materials, {
    name: file.name,
    parentId,
    id: `mat_${Math.random().toString(36).slice(2, 10)}`,
    mime: payload.mime,
    size: file.size,
    contentBase64: payload.contentBase64,
    now: new Date().toISOString(),
  });
  if (!result.ok) throw new Error(result.message);
  persistLocal(result.nodes);
  return localList();
}

export async function renameMaterialItem(id: string, name: string): Promise<PublicMaterial[]> {
  if (remoteEnabled()) return apiRenameMaterial(id, name);
  const result = renameMaterial(loadDb().materials, {
    id,
    name,
    now: new Date().toISOString(),
  });
  if (!result.ok) throw new Error(result.message);
  persistLocal(result.nodes);
  return localList();
}

export async function replaceMaterialFile(id: string, file: File): Promise<PublicMaterial[]> {
  const payload = await filePayload(file);
  if (remoteEnabled()) {
    return apiReplaceMaterial(id, {
      name: file.name,
      mime: payload.mime,
      contentBase64: payload.contentBase64,
    });
  }
  const result = replaceFile(loadDb().materials, {
    id,
    name: file.name,
    mime: payload.mime,
    size: file.size,
    contentBase64: payload.contentBase64,
    now: new Date().toISOString(),
  });
  if (!result.ok) throw new Error(result.message);
  persistLocal(result.nodes);
  return localList();
}

export async function deleteMaterialItem(id: string): Promise<PublicMaterial[]> {
  if (remoteEnabled()) return apiDeleteMaterial(id);
  const result = deleteMaterial(loadDb().materials, { id });
  if (!result.ok) throw new Error(result.message);
  persistLocal(result.nodes);
  return localList();
}

export type MaterialContent =
  | { kind: 'stub'; stub: string; name: string }
  | { kind: 'file'; name: string; mime: string; blob: Blob }
  | { kind: 'remote'; name: string; mime: string; url: string };

type MaterialPayload = {
  name?: string;
  mime?: string | null;
  base64?: string;
  stub?: string;
  url?: string;
};

export async function openMaterial(item: PublicMaterial): Promise<MaterialContent> {
  if (!item.hasFile && item.stub) {
    return { kind: 'stub', stub: item.stub, name: item.name };
  }
  if (remoteEnabled()) {
    const data: MaterialPayload = await apiMaterialContent(item.id);
    if (data.url) {
      return {
        kind: 'remote',
        name: data.name || item.name,
        mime: data.mime || item.mime || 'application/octet-stream',
        url: data.url,
      };
    }
    if (data.stub && !data.base64) {
      return { kind: 'stub', stub: data.stub, name: data.name || item.name };
    }
    if (!data.base64) throw new Error('У файла нет содержимого');
    const mime = data.mime || item.mime || 'application/octet-stream';
    return {
      kind: 'file',
      name: data.name || item.name,
      mime,
      blob: base64ToBlob(data.base64, mime),
    };
  }
  const node = findMaterial(loadDb().materials, item.id);
  if (node?.contentBase64) {
    const mime = node.mime || 'application/octet-stream';
    return {
      kind: 'file',
      name: node.name,
      mime,
      blob: base64ToBlob(node.contentBase64, mime),
    };
  }
  if (node?.stub) return { kind: 'stub', stub: node.stub, name: node.name };
  throw new Error('У файла нет содержимого');
}

/**
 * PDF-копия для предпросмотра (есть только у файлов с hasPreview, обычно у .doc).
 * null — копии нет или её не удалось получить: окно тогда покажет оригинал или «Скачать».
 */
export async function openMaterialPdfCopy(
  item: PublicMaterial,
): Promise<{ url: string } | { blob: Blob } | null> {
  if (!item.hasPreview || !remoteEnabled()) return null;
  try {
    const data = await apiMaterialPreview(item.id);
    if (data.url) return { url: data.url };
    if (data.base64) return { blob: base64ToBlob(data.base64, 'application/pdf') };
  } catch {
    // Копия — дополнение: без неё окно всё равно откроется.
  }
  return null;
}
