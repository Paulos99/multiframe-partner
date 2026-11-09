import {
  MATERIAL_ROLES,
  MATERIAL_ROLE_LABELS,
  type MaterialRole,
  type PublicMaterial,
} from '../../../../packages/shared/materialsLib.js';

/** Кто видит: null — все роли (в папке — как у папки). Пустой список — никто, кроме админа StP. */
export type MaterialRoles = MaterialRole[] | null;

export const ROLE_OPTIONS: Array<{ role: MaterialRole; label: string }> = MATERIAL_ROLES.map((role) => ({
  role,
  label: MATERIAL_ROLE_LABELS[role],
}));

/** Подпись для отметки: «Все роли», «Только админ StP» или список ролей. */
export function rolesLabel(roles: MaterialRoles | undefined): string {
  if (roles == null) return 'Все роли';
  if (!roles.length) return 'Только админ StP';
  return roles.map((role) => MATERIAL_ROLE_LABELS[role]).join(', ');
}

/** Ограничение от папки: кому видна папка, внутри которой создаётся или лежит материал. null — ограничения нет. */
export type FolderLimit = { folderName: string; roles: MaterialRole[] } | null;

export function folderLimit(items: PublicMaterial[], parentId: string | null): FolderLimit {
  if (!parentId) return null;
  const parent = items.find((item) => item.id === parentId);
  if (!parent || parent.effectiveRoles == null) return null;
  return { folderName: parent.name, roles: parent.effectiveRoles };
}

/** Выбор в окне → значение для сервера. Все пять ролей — то же, что «все». */
export function rolesFromChoice(all: boolean, picked: Iterable<MaterialRole>): MaterialRoles {
  if (all) return null;
  const set = new Set(picked);
  const roles = MATERIAL_ROLES.filter((role) => set.has(role));
  return roles.length === MATERIAL_ROLES.length ? null : roles;
}
