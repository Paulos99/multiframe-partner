export type MaterialNode = {
  id: string;
  parentId: string | null;
  kind: 'folder' | 'file';
  name: string;
  mime: string | null;
  size: number | null;
  stub: string | null;
  storageKey: string | null;
  contentBase64: string | null;
  updatedAt: string;
};

export type PublicMaterial = {
  id: string;
  parentId: string | null;
  kind: 'folder' | 'file';
  name: string;
  mime: string | null;
  size: number | null;
  stub: string | null;
  hasFile: boolean;
  updatedAt: string;
};

export function demoMaterialNodes(): MaterialNode[];
export function materialBase(stored: unknown): MaterialNode[];
export function toPublicMaterial(node: MaterialNode): PublicMaterial;
export function publicMaterials(stored: unknown): PublicMaterial[];
export function createFolder(
  stored: unknown,
  input: { name: string; parentId?: string | null; id: string; now: string },
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
    contentBase64?: string | null;
    now: string;
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
    contentBase64?: string | null;
    name?: string | null;
    now: string;
  },
):
  | { ok: true; nodes: MaterialNode[]; previousKey: string | null }
  | { ok: false; message: string };
export function deleteMaterial(
  stored: unknown,
  input: { id: string },
):
  | { ok: true; nodes: MaterialNode[]; storageKeys: string[] }
  | { ok: false; message: string };
export function findMaterial(stored: unknown, id: string): MaterialNode | null;
