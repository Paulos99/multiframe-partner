import { JOB_OBJECT_STATUS_LABELS, type JobObject, type Project, type ProjectStatus } from '../../../../packages/shared/partner';
import { PROJECT_STATUS_LABELS } from '../../../../packages/shared/projectAccess.js';
import { REFUSAL_OTHER_KEY, closeLabel, isRefused, refusalReasonPlain } from '../../../../packages/shared/refusal.js';

export { closeLabel, isRefused, refusalReasonPlain };

/** Название стадии комнаты. Закрытая комната — «Завершён» или «Отказ». */
export function roomStageLabel(room: Pick<JobObject, 'status' | 'refusal'>): string {
  return room.status === 'closed' ? closeLabel(room) : JOB_OBJECT_STATUS_LABELS[room.status];
}

/** Название стадии проекта. Завершённый проект с причиной — «Отказ». */
export function projectStageLabel(project: Pick<Project, 'refusal'> | null | undefined, status: ProjectStatus): string {
  return status === 'done' ? closeLabel(project) : PROJECT_STATUS_LABELS[status];
}

/** «Отказ: дорого» и комментарий. Пусто, если отказа нет. */
export function refusalLine(item: { refusal?: Project['refusal'] } | null | undefined): string {
  if (!item || !isRefused(item)) return '';
  const reason = refusalReasonPlain(item.refusal!.reasonKey);
  return `Отказ: ${reason}${item.refusal!.comment ? `. ${item.refusal!.comment}` : ''}`;
}

/** Проверка выбора в окне закрытия. Текст ошибки пуст, когда всё заполнено. */
export function closeChoiceError(outcome: 'completed' | 'refused', reasonKey: string, comment: string): string {
  if (outcome === 'completed') return '';
  if (!reasonKey) return 'Выберите причину отказа';
  if (reasonKey === REFUSAL_OTHER_KEY && !comment.trim()) return 'Опишите причину своими словами';
  return '';
}
