export const PHONE_PROJECT_STAGES: readonly string[];
export const PHONE_ROOM_STATUSES: readonly string[];
export const PHONE_ROLES: readonly string[];
export const PHONE_EXAMPLE: string;
export function phoneStageAllowed(projectStage: string | null | undefined): boolean;
export function phoneRoomStatusAllowed(roomStatus: string | null | undefined): boolean;
export function roleSeesClientPhone(role: string | null | undefined): boolean;
export function projectStageOf(
  project: { status?: string | null } | null | undefined,
  rooms: ReadonlyArray<{ status?: string }> | null | undefined,
): 'new' | 'measure' | 'proposal' | 'install' | 'done';
export function cleanClientPhone(raw: unknown): { value?: string; error?: string };
