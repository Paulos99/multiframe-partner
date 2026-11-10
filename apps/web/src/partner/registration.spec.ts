import { expect, test, vi } from 'vitest';
import { passwordProblem } from '../../../../packages/shared/passwordPolicy.js';
import {
  isRegisterHash,
  pendingRegistrations,
  registerFormProblem,
  registerUrl,
  rejectedRegistrations,
  requestsCountLabel,
  type RegisterForm,
} from './registration';

vi.mock('./localStore', () => ({ loadToken: () => null, saveToken: vi.fn() }));

const form: RegisterForm = {
  firstName: 'Ирина',
  lastName: 'Соколова',
  companyName: 'Потолки Юга',
  city: 'Москва',
  login: 'irina',
  password: 'Ceiling-2026',
  passwordRepeat: 'Ceiling-2026',
};

test('адрес страницы регистрации', () => {
  expect(isRegisterHash('#/register')).toBe(true);
  expect(isRegisterHash('#register')).toBe(true);
  expect(isRegisterHash('#/register?utm=mail')).toBe(true);
  expect(isRegisterHash('#/r/abc')).toBe(false);
  expect(isRegisterHash('')).toBe(false);
  expect(registerUrl({ origin: 'https://partner.stp-multiframe.ru', pathname: '/cabinet/' })).toBe(
    'https://partner.stp-multiframe.ru/cabinet/#/register',
  );
});

test('проверка формы: все поля, пароль и повтор', () => {
  expect(registerFormProblem(form, passwordProblem)).toBe('');
  expect(registerFormProblem({ ...form, firstName: ' ' }, passwordProblem)).toBe('Укажите имя');
  expect(registerFormProblem({ ...form, city: '' }, passwordProblem)).toBe('Укажите город');
  expect(registerFormProblem({ ...form, login: 'два слова' }, passwordProblem)).toBe('Логин без пробелов');
  expect(registerFormProblem({ ...form, password: 'short', passwordRepeat: 'short' }, passwordProblem)).toMatch(/не короче/);
  expect(registerFormProblem({ ...form, passwordRepeat: 'other-pass' }, passwordProblem)).toBe('Пароли не совпадают');
});

test('заявки: ожидающие новыми сверху, отклонённые отдельно', () => {
  const rows = [
    { id: 'a', org: { registration: { status: 'pending' as const, submittedAt: '2026-11-01T10:00:00Z' } } },
    { id: 'b', org: { registration: { status: 'pending' as const, submittedAt: '2026-11-05T10:00:00Z' } } },
    { id: 'c', org: { registration: { status: 'rejected' as const, decidedAt: '2026-11-06T10:00:00Z' } } },
    { id: 'd', org: { registration: { status: 'approved' as const } } },
    { id: 'e', org: undefined },
  ];
  expect(pendingRegistrations(rows).map((r) => r.id)).toEqual(['b', 'a']);
  expect(rejectedRegistrations(rows).map((r) => r.id)).toEqual(['c']);
});

test('склонение счётчика заявок', () => {
  expect(requestsCountLabel(1)).toBe('1 заявка');
  expect(requestsCountLabel(3)).toBe('3 заявки');
  expect(requestsCountLabel(5)).toBe('5 заявок');
  expect(requestsCountLabel(11)).toBe('11 заявок');
  expect(requestsCountLabel(22)).toBe('22 заявки');
});
