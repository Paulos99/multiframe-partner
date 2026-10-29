/**
 * Фотоотчёт комнаты: этапы, кто что может.
 *
 * Видят все три этапа: замерщик, монтажник, владелец, менеджер, админ StP.
 * Добавляют: «До» — замерщик, монтажник, владелец, менеджер; «В процессе» и «После» — монтажник, владелец, менеджер.
 * Показ клиенту по умолчанию включён: выключить его может владелец или менеджер.
 * Админ StP смотрит все этапы всех партнёров и может убрать лишнее, но не добавляет.
 * Сервер проверяет те же правила: apps/api/roomPhotos.js.
 */

export const PHOTO_STAGES = ['before', 'progress', 'after'];

export const PHOTO_STAGE_LABELS = {
  before: 'До',
  progress: 'В процессе',
  after: 'После',
};

/** Сколько фото хранится в одной комнате. */
export const PHOTO_LIMIT_PER_ROOM = 60;
export const PHOTO_CAPTION_MAX = 120;

const ADD = {
  owner: PHOTO_STAGES,
  sales: PHOTO_STAGES,
  crew: PHOTO_STAGES,
  measurer: ['before'],
};

const SEE = {
  admin: PHOTO_STAGES,
  owner: PHOTO_STAGES,
  sales: PHOTO_STAGES,
  crew: PHOTO_STAGES,
  measurer: PHOTO_STAGES,
};

export function isPhotoStage(value) {
  return PHOTO_STAGES.includes(value);
}

/** Этапы, которые роль может видеть. */
export function photoStagesRoleSees(role) {
  return SEE[role] || [];
}

/** Этапы, в которые роль может добавлять фото. */
export function photoStagesRoleAdds(role) {
  return ADD[role] || [];
}

export function canSeePhotoStage(role, stage) {
  return photoStagesRoleSees(role).includes(stage);
}

export function canAddPhoto(role, stage) {
  return photoStagesRoleAdds(role).includes(stage);
}

/** Свои фото удаляет автор. Владелец, менеджер и админ — любые в пределах доступа. */
export function canDeletePhoto(user, photo) {
  if (!user || !photo) return false;
  if (user.role === 'admin' || user.role === 'owner' || user.role === 'sales') return true;
  return photo.createdBy === user.id;
}

/** Включить показ фотоотчёта клиенту может владелец или менеджер. */
/**
 * Показывается ли фотоотчёт клиенту. По умолчанию да: выключено только то, что владелец или менеджер
 * отключили явно (false). Записи без настройки (старые комнаты и новые) показываются.
 */
export function photoReportVisibleToClient(obj) {
  return obj?.photoReport?.clientVisible !== false;
}

export function canShareReportWithClient(role) {
  return role === 'owner' || role === 'sales';
}

export function cleanPhotoCaption(raw) {
  return String(raw ?? '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, PHOTO_CAPTION_MAX);
}

export function emptyPhotoCounts() {
  return { before: 0, progress: 0, after: 0 };
}

/** Количество по этапам, только те, что роль видит. */
export function photoCountsFor(photos, role) {
  const counts = emptyPhotoCounts();
  const seen = photoStagesRoleSees(role);
  for (const photo of photos || []) {
    if (photo && seen.includes(photo.stage)) counts[photo.stage] += 1;
  }
  return counts;
}

export function photoTotal(counts) {
  return PHOTO_STAGES.reduce((sum, stage) => sum + Number(counts?.[stage] || 0), 0);
}
