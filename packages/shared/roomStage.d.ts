export declare const ROOM_STAGE_LABELS: Readonly<Record<string, string>>;
export declare const MEASURER_ROOM_STAGES: readonly string[];
export declare function canChangeRoomStage(
  role: string | null | undefined,
  from: string | null | undefined,
  to: string | null | undefined,
): boolean;
export declare function roleChangesRoomStage(role: string | null | undefined): boolean;
export declare function isStageConflict(
  existing: { status?: string | null } | null | undefined,
  body: { status?: unknown; baseStatus?: unknown } | null | undefined,
): boolean;
