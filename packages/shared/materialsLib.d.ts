import type { MaterialRole } from './schemas.js';
export type { MaterialRole };

export type MaterialNode = {
  id: string;
  parentId: string | null;
  kind: 'folder' | 'file';
  /** Кто видит: null или нет поля — все роли (в папке — как у папки). Админ StP видит всё. */
  roles?: MaterialRole[] | null;
  /** "video" — обучающее видео (вне папок, над списком). */
  section?: 'video' | null;
  /** Встроенный ролик роли из apps/web/public/videos: owner, sales, measurer, crew. */
  builtin?: string | null;
  description?: string | null;
  name: string;
  mime: string | null;
  size: number | null;
  stub: string | null;
  storageKey: string | null;
  /** "materials" — новый бакет. Нет поля или null — старый ключ в бакете кабинета. */
  bucket?: string | null;
  contentBase64: string | null;
  /** PDF-копия для предпросмотра: materials/<id>_pdfpreview в бакете материалов. */
  previewKey?: string | null;
  previewSize?: number | null;
  previewUpdatedAt?: string | null;
  /** Миниатюра для списка: materials/<id>_thumb в бакете материалов. */
  thumbKey?: string | null;
  thumbSize?: number | null;
  thumbType?: string | null;
  thumbUpdatedAt?: string | null;
  /** Копия видео для просмотра онлайн: materials/<id>_stream (H.264 до 1080p, faststart). */
  streamKey?: string | null;
  streamSize?: number | null;
  streamUpdatedAt?: string | null;
  updatedAt: string;
};

export const MATERIAL_BUCKET_MARKER: 'materials';
export const MATERIAL_DIRECT_MAX_BYTES: number;
export const MATERIAL_SINGLE_PUT_MAX_BYTES: number;
export const MATERIAL_PART_MIN_BYTES: number;
export const MATERIAL_PART_MAX_BYTES: number;
export const MATERIAL_MAX_PARTS: number;
export function materialPartSize(size: number): number;

export type PublicMaterial = {
  id: string;
  parentId: string | null;
  kind: 'folder' | 'file';
  name: string;
  mime: string | null;
  size: number | null;
  stub: string | null;
  hasFile: boolean;
  /** Есть PDF-копия для предпросмотра (GET /materials/:id/preview). */
  hasPreview?: boolean;
  /** Есть миниатюра (GET /materials/:id/thumbnail). */
  hasThumbnail?: boolean;
  /** Подписанная ссылка на миниатюру (~6 ч) — только в ответах API. */
  thumbnailUrl?: string | null;
  /** Есть лёгкая копия видео для просмотра онлайн. */
  hasStream?: boolean;
  streamSize?: number | null;
  section?: 'video' | null;
  builtin?: string | null;
  description?: string | null;
  /** Только у админа StP: роли самого узла (null — все). */
  roles?: MaterialRole[] | null;
  /** Только у админа StP: кому узел виден с учётом папок (null — всем). */
  effectiveRoles?: MaterialRole[] | null;
  updatedAt: string;
};

export const MATERIAL_ROLES: MaterialRole[];
export const MATERIAL_ROLE_LABELS: Record<MaterialRole, string>;
export function parseMaterialRoles(
  value: unknown,
): { ok: true; roles: MaterialRole[] | null | undefined } | { ok: false; message: string };
export const BUILTIN_TRAINING_VIDEOS: { key: string; title: string; description: string }[];
export function builtinVideoNodes(now?: string): MaterialNode[];
export function ensureMaterialVideos<T extends { materials?: unknown; materialVideosSeeded?: boolean }>(platform: T): T;
export function effectiveRoles(nodes: MaterialNode[], node: MaterialNode | null | undefined): MaterialRole[] | null;
export function materialVisibleTo(nodes: MaterialNode[], node: MaterialNode, role: string): boolean;
export function visibleMaterialNodes(stored: unknown, role: string): MaterialNode[];
export function publicMaterialsFor(stored: unknown, role: string): PublicMaterial[];
export function publicMaterialFor(nodes: MaterialNode[], node: MaterialNode, role: string): PublicMaterial;
export function setMaterialRoles(
  stored: unknown,
  input: { id: string; roles: MaterialRole[] | null; now: string },
): { ok: true; nodes: MaterialNode[] } | { ok: false; message: string };

export function demoMaterialNodes(): MaterialNode[];
export function materialBase(stored: unknown): MaterialNode[];
export function toPublicMaterial(node: MaterialNode): PublicMaterial;
export function publicMaterials(stored: unknown): PublicMaterial[];
export function createFolder(
  stored: unknown,
  input: { name: string; parentId?: string | null; id: string; now: string; roles?: MaterialRole[] | null },
): { ok: true; nodes: MaterialNode[] } | { ok: false; message: string };
export function addFile(
  stored: unknown,
  input: {
    name: string;
    parentId?: string | null;
    id: string;
    mime?: string | null;
    size?: number | null;
    storageKey?: string | null;
    bucket?: string | null;
    contentBase64?: string | null;
    now: string;
    roles?: MaterialRole[] | null;
    section?: 'video' | null;
  },
): { ok: true; nodes: MaterialNode[] } | { ok: false; message: string };
export function renameMaterial(
  stored: unknown,
  input: { id: string; name: string; now: string },
): { ok: true; nodes: MaterialNode[] } | { ok: false; message: string };
export function replaceFile(
  stored: unknown,
  input: {
    id: string;
    mime?: string | null;
    size?: number | null;
    storageKey?: string | null;
    bucket?: string | null;
    contentBase64?: string | null;
    name?: string | null;
    now: string;
  },
):
  | { ok: true; nodes: MaterialNode[]; previousKey: string | null; previousBucket: string | null }
  | { ok: false; message: string };
export function deleteMaterial(
  stored: unknown,
  input: { id: string },
):
  | {
      ok: true;
      nodes: MaterialNode[];
      storageKeys: string[];
      storageObjects: { key: string; bucket: string | null }[];
    }
  | { ok: false; message: string };
export function findMaterial(stored: unknown, id: string): MaterialNode | null;
