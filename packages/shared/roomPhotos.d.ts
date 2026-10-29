export type PhotoStage = 'before' | 'progress' | 'after';
export type PhotoCounts = Record<PhotoStage, number>;

export const PHOTO_STAGES: readonly PhotoStage[];
export const PHOTO_STAGE_LABELS: Record<PhotoStage, string>;
export const PHOTO_LIMIT_PER_ROOM: number;
export const PHOTO_CAPTION_MAX: number;

export function isPhotoStage(value: unknown): value is PhotoStage;
export function photoStagesRoleSees(role: string | null | undefined): readonly PhotoStage[];
export function photoStagesRoleAdds(role: string | null | undefined): readonly PhotoStage[];
export function canSeePhotoStage(role: string | null | undefined, stage: string): boolean;
export function canAddPhoto(role: string | null | undefined, stage: string): boolean;
export function canDeletePhoto(
  user: { id: string; role: string } | null | undefined,
  photo: { createdBy?: string | null } | null | undefined,
): boolean;
export function canShareReportWithClient(role: string | null | undefined): boolean;
export function cleanPhotoCaption(raw: unknown): string;
export function emptyPhotoCounts(): PhotoCounts;
export function photoCountsFor(
  photos: ReadonlyArray<{ stage: string }> | null | undefined,
  role: string | null | undefined,
): PhotoCounts;
export function photoTotal(counts: Partial<PhotoCounts> | null | undefined): number;
