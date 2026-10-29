import { PHOTO_STAGES, type PhotoStage } from '../../../../../packages/shared/roomPhotos.js';

/** Минимум, который нужен просмотрщику и сравнению. Подходит и фото партнёра, и фото клиентской страницы. */
export type ViewPhoto = {
  id: string;
  stage: PhotoStage;
  url: string;
  thumbUrl: string;
  createdAt: string;
  width?: number | null;
  height?: number | null;
  caption?: string;
  authorName?: string;
};

export function groupByStage<T extends { stage: PhotoStage; createdAt: string }>(
  photos: readonly T[],
): Record<PhotoStage, T[]> {
  const out = { before: [], progress: [], after: [] } as Record<PhotoStage, T[]>;
  for (const photo of photos) out[photo.stage]?.push(photo);
  for (const stage of PHOTO_STAGES) out[stage].sort((a, b) => (a.createdAt > b.createdAt ? 1 : -1));
  return out;
}

/** «12 марта, 14:05» — по часовому поясу устройства. */
export function formatPhotoDate(iso: string | null | undefined, withTime = true): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const day = date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  if (!withTime) return day;
  return `${day}, ${date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
}

export const ROLE_LABELS: Record<string, string> = {
  owner: 'владелец',
  sales: 'менеджер',
  measurer: 'замерщик',
  crew: 'монтажник',
  admin: 'админ СТП',
};
