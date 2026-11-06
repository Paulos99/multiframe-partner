import type { JobObject, JobObjectDocument } from '../../../../packages/shared/partner';

/** Документ собран под другую площадь комнаты — его нужно пересобрать. */
export function isDocStale(doc: Pick<JobObjectDocument, 'areaM2'>, room: Pick<JobObject, 'room'>): boolean {
  const roomArea = room.room?.areaM2;
  return doc.areaM2 != null && roomArea != null && Math.abs(doc.areaM2 - roomArea) > 0.049;
}
