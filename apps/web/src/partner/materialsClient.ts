import type { MaterialNode, PublicMaterial } from '../../../api/materialsLib.js';
import {
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

function useRemote(): boolean {
  return hasRemoteApi() && Boolean(loadToken());
}

function missingApi(error: unknown): boolean {
  const message = error instanceof Error ? error.message : '';
  return /not found|404/i.test(message);
}

export async function listMaterials(): Promise<PublicMaterial[]> {
  if (useRemote()) {
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
  if (useRemote()) return apiCreateMaterialFolder(name, parentId);
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

export async function uploadMaterialFile(
  file: File,
  parentId: string | null,
): Promise<PublicMaterial[]> {
  const payload = await filePayload(file);
  if (useRemote()) {
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
  if (useRemote()) return apiRenameMaterial(id, name);
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
  if (useRemote()) {
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
  if (useRemote()) return apiDeleteMaterial(id);
  const result = deleteMaterial(loadDb().materials, { id });
  if (!result.ok) throw new Error(result.message);
  persistLocal(result.nodes);
  return localList();
}

export type MaterialContent =
  | { kind: 'stub'; stub: string; name: string }
  | { kind: 'file'; name: string; mime: string; blob: Blob };

export async function openMaterial(item: PublicMaterial): Promise<MaterialContent> {
  if (!item.hasFile && item.stub) {
    return { kind: 'stub', stub: item.stub, name: item.name };
  }
  if (useRemote()) {
    const data = await apiMaterialContent(item.id);
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
