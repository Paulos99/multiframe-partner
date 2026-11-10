import type { UserRole } from '../../../../packages/shared/partner';

/** Быстрое действие «Добавить менеджера» на «Сегодня»: форма сотрудника откроется сразу с этой ролью. */
let pendingAddRole: UserRole | null = null;

export function requestStaffAdd(role: UserRole): void {
  pendingAddRole = role;
}

export function peekStaffAdd(): UserRole | null {
  return pendingAddRole;
}

export function clearStaffAdd(): void {
  pendingAddRole = null;
}
