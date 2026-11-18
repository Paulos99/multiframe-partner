/**
 * Регистрация сотрудника: поиск компании, заявка на подключение, разбор заявок владельцем и менеджером.
 */
import type { SessionUser, UserRole } from '../../../../packages/shared/partner';
import { REGISTER_TRAP_FIELD, STAFF_ASSIGNABLE_ROLES } from '../../../../packages/shared/schemas.js';
import { request } from './apiClient';
import { saveToken } from './localStore';

export const COMPANY_SEARCH_MIN = 2;

export type StaffJoinStatus = 'pending' | 'approved' | 'rejected';

export type CompanyHint = { id: string; name: string };

export type StaffJoinForm = {
  firstName: string;
  lastName: string;
  orgId: string;
  companyName: string;
  role: UserRole;
  login: string;
  password: string;
  passwordRepeat: string;
  phone?: string;
  trap?: string;
};

export type StaffJoinRequest = {
  id: string;
  userId: string;
  login: string;
  displayName: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  role: UserRole | string;
  status: StaffJoinStatus;
  submittedAt?: string;
  decidedAt?: string | null;
  reason?: string;
};

export function isStaffRegisterRole(role: string): role is UserRole {
  return (STAFF_ASSIGNABLE_ROLES as string[]).includes(role);
}

export async function apiSearchCompanies(query: string): Promise<CompanyHint[]> {
  const q = query.trim();
  if (q.length < COMPANY_SEARCH_MIN) return [];
  const data = await request<{ companies: CompanyHint[] }>(
    `/auth/companies?q=${encodeURIComponent(q)}`,
    { token: null },
  );
  return Array.isArray(data.companies) ? data.companies : [];
}

export async function apiRegisterStaff(form: StaffJoinForm): Promise<{ token: string; user: SessionUser }> {
  const { trap, companyName: _name, ...fields } = form;
  void _name;
  const data = await request<{ token: string; user: SessionUser }>('/auth/register-staff', {
    method: 'POST',
    body: JSON.stringify({ ...fields, [REGISTER_TRAP_FIELD]: trap || '' }),
    token: null,
  });
  saveToken(data.token);
  return data;
}

export async function apiSubmitStaffJoin(orgId: string, role: UserRole): Promise<SessionUser> {
  const data = await request<{ user: SessionUser }>('/me/staff-join', {
    method: 'POST',
    body: JSON.stringify({ orgId, role }),
  });
  return data.user;
}

export async function apiListStaffJoins(): Promise<StaffJoinRequest[]> {
  const data = await request<{ requests: StaffJoinRequest[] }>('/org/staff-join-requests');
  return Array.isArray(data.requests) ? data.requests : [];
}

export async function apiDecideStaffJoin(
  requestId: string,
  decision: 'approve' | 'reject',
  options: { role?: UserRole; reason?: string } = {},
): Promise<StaffJoinRequest> {
  const data = await request<{ request: StaffJoinRequest }>(
    `/org/staff-join-requests/${encodeURIComponent(requestId)}/${decision}`,
    {
      method: 'POST',
      body: JSON.stringify(
        decision === 'approve' ? { role: options.role || '' } : { reason: options.reason || '' },
      ),
    },
  );
  return data.request;
}

export function pendingStaffJoins(rows: StaffJoinRequest[]): StaffJoinRequest[] {
  return rows
    .filter((row) => row.status === 'pending')
    .sort((a, b) => String(b.submittedAt || '').localeCompare(String(a.submittedAt || '')));
}

export function rejectedStaffJoins(rows: StaffJoinRequest[]): StaffJoinRequest[] {
  return rows
    .filter((row) => row.status === 'rejected')
    .sort((a, b) => String(b.decidedAt || '').localeCompare(String(a.decidedAt || '')));
}

export function isAwaitingJoin(user: SessionUser | null | undefined): boolean {
  if (!user || user.orgId) return false;
  const status = user.staffJoin?.status;
  return status === 'pending' || status === 'rejected';
}

/** Проверка формы на устройстве: те же правила, что на сервере. */
export function staffJoinFormProblem(form: StaffJoinForm, passwordProblem: (pw: string) => string): string {
  if (!form.firstName.trim()) return 'Укажите имя';
  if (!form.lastName.trim()) return 'Укажите фамилию';
  if (!form.orgId.trim()) return 'Выберите компанию из списка';
  if (!isStaffRegisterRole(form.role)) return 'Выберите роль: менеджер, замерщик или монтажник';
  if (!form.login.trim()) return 'Укажите логин';
  if (/\s/.test(form.login.trim())) return 'Логин без пробелов';
  if (!form.password) return 'Придумайте пароль';
  const weak = passwordProblem(form.password);
  if (weak) return weak;
  if (form.password !== form.passwordRepeat) return 'Пароли не совпадают';
  return '';
}
