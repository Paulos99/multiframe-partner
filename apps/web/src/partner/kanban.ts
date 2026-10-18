import type {
  JobObjectStatus,
  UserRole,
} from '../../../../packages/shared/partner';
export const KANBAN_STAGES: JobObjectStatus[] = [
  'draft',
  'measured',
  'quote_sent',
  'install',
  'closed',
];
export function canMoveRoom(role: UserRole, target: JobObjectStatus) {
  return (
    KANBAN_STAGES.includes(target) &&
    (role !== 'crew' || target === 'install' || target === 'closed')
  );
}
