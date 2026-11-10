/**
 * Самостоятельная регистрация владельца: адрес страницы, запросы и разбор заявок для раздела «Кабинеты».
 * Сервер: POST /auth/register, POST /admin/partners/{id}/approve и /reject (apps/api/registration.js).
 */
import type { SessionUser } from '../../../../packages/shared/partner';
import { REGISTER_TRAP_FIELD } from '../../../../packages/shared/schemas.js';
import { request } from './apiClient';
import { saveToken } from './localStore';

export type RegistrationStatus = 'pending' | 'approved' | 'rejected';

export type OrgRegistration = {
  status: RegistrationStatus;
  source?: string;
  firstName?: string;
  lastName?: string;
  submittedAt?: string;
  decidedAt?: string;
  reason?: string;
};

export type RegisterForm = {
  firstName: string;
  lastName: string;
  companyName: string;
  city: string;
  login: string;
  password: string;
  passwordRepeat: string;
  /** Скрытое поле-ловушка: у человека всегда пустое. */
  trap?: string;
};

/** Ссылка для письма: …/cabinet/#/register */
export const REGISTER_HASH = '#/register';

export function isRegisterHash(hash: string): boolean {
  const raw = String(hash || '').replace(/^#/, '').replace(/^\/+/, '').split('?')[0];
  return raw === 'register';
}

export function registerUrl(where: { origin: string; pathname: string } = window.location): string {
  return `${where.origin}${where.pathname}${REGISTER_HASH}`;
}

export function openRegister(): void {
  window.location.hash = REGISTER_HASH;
}

export function leaveRegister(): void {
  if (typeof window === 'undefined' || !isRegisterHash(window.location.hash)) return;
  const url = new URL(window.location.href);
  url.hash = '';
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}`);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

export async function apiRegister(form: RegisterForm): Promise<{ token: string; user: SessionUser }> {
  const { trap, ...fields } = form;
  const data = await request<{ token: string; user: SessionUser }>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ ...fields, [REGISTER_TRAP_FIELD]: trap || '' }),
    token: null,
  });
  saveToken(data.token);
  return data;
}

export async function apiDecideRegistration(
  partnerUserId: string,
  decision: 'approve' | 'reject',
  reason = '',
): Promise<OrgRegistration> {
  const data = await request<{ registration: OrgRegistration }>(
    `/admin/partners/${encodeURIComponent(partnerUserId)}/${decision}`,
    { method: 'POST', body: JSON.stringify(decision === 'reject' ? { reason } : {}) },
  );
  return data.registration;
}

type WithRegistration = { org?: { registration?: OrgRegistration | null } | null } | null | undefined;

export function registrationOf(row: WithRegistration): OrgRegistration | null {
  const reg = row?.org?.registration;
  return reg && (reg.status === 'pending' || reg.status === 'approved' || reg.status === 'rejected') ? reg : null;
}

/** Заявки, ждущие решения, — новые сверху. */
export function pendingRegistrations<T extends WithRegistration>(rows: T[]): T[] {
  return rows
    .filter((row) => registrationOf(row)?.status === 'pending')
    .sort((a, b) => String(registrationOf(b)?.submittedAt || '').localeCompare(String(registrationOf(a)?.submittedAt || '')));
}

export function rejectedRegistrations<T extends WithRegistration>(rows: T[]): T[] {
  return rows
    .filter((row) => registrationOf(row)?.status === 'rejected')
    .sort((a, b) => String(registrationOf(b)?.decidedAt || '').localeCompare(String(registrationOf(a)?.decidedAt || '')));
}

/** «Новые заявки · 3» для меню и счётчика. */
export function requestsCountLabel(count: number): string {
  const tail = count % 10;
  const tens = count % 100;
  const word =
    tail === 1 && tens !== 11 ? 'заявка' : tail >= 2 && tail <= 4 && (tens < 12 || tens > 14) ? 'заявки' : 'заявок';
  return `${count} ${word}`;
}

/** Проверка формы на устройстве: те же правила, что на сервере, чтобы не гонять запрос впустую. */
export function registerFormProblem(form: RegisterForm, passwordProblem: (pw: string) => string): string {
  if (!form.firstName.trim()) return 'Укажите имя';
  if (!form.lastName.trim()) return 'Укажите фамилию';
  if (!form.companyName.trim()) return 'Укажите название компании';
  if (!form.city.trim()) return 'Укажите город';
  if (!form.login.trim()) return 'Укажите логин';
  if (/\s/.test(form.login.trim())) return 'Логин без пробелов';
  if (!form.password) return 'Придумайте пароль';
  const weak = passwordProblem(form.password);
  if (weak) return weak;
  if (form.password !== form.passwordRepeat) return 'Пароли не совпадают';
  return '';
}
