export const AUTO_ARCHIVE_DAYS: 14;

export function allRoomsCompleted(
  rooms: Array<{ status?: string; updatedAt?: string | null }> | null | undefined,
): boolean;

export function lastRoomCompletedAt(
  rooms: Array<{ status?: string; updatedAt?: string | null }> | null | undefined,
): number | null;

export function shouldAutoArchive(
  project: { archivedAt?: string | null; unarchiveHold?: boolean | null },
  rooms: Array<{ status?: string; updatedAt?: string | null }> | null | undefined,
  now?: number | Date | string,
): boolean;

export function applyAutoArchive(
  projects: Array<Record<string, unknown>>,
  objects: Array<Record<string, unknown>>,
  now?: number | Date | string,
): number;

export function archivePatchResult(
  archivedPatch: boolean | undefined,
  existing: { archivedAt?: string | null; unarchiveHold?: boolean | null } | null | undefined,
  nowIso?: string,
): { archivedAt: string | null; unarchiveHold: boolean };
