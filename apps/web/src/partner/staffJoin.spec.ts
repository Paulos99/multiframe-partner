import { describe, expect, it } from 'vitest';
import {
  COMPANY_SEARCH_MIN,
  isAwaitingJoin,
  isStaffRegisterRole,
  pendingStaffJoins,
  staffJoinFormProblem,
  type StaffJoinForm,
  type StaffJoinRequest,
} from './staffJoin';

const form = (overrides: Partial<StaffJoinForm> = {}): StaffJoinForm => ({
  firstName: 'Павел',
  lastName: 'Замеров',
  orgId: 'ui_org',
  companyName: 'UI test company',
  role: 'measurer',
  login: 'pavel.m',
  password: 'Staff-Join-2026',
  passwordRepeat: 'Staff-Join-2026',
  phone: '',
  ...overrides,
});

describe('заявка сотрудника', () => {
  it('роль сотрудника — менеджер, замерщик или монтажник', () => {
    expect(isStaffRegisterRole('owner')).toBe(false);
    expect(isStaffRegisterRole('sales')).toBe(true);
    expect(isStaffRegisterRole('measurer')).toBe(true);
    expect(isStaffRegisterRole('crew')).toBe(true);
  });

  it('форма не уходит без выбранной компании и при слабом пароле', () => {
    expect(staffJoinFormProblem(form({ orgId: '' }), () => '')).toBe('Выберите компанию из списка');
    expect(staffJoinFormProblem(form({ login: 'bad name' }), () => '')).toBe('Логин без пробелов');
    expect(staffJoinFormProblem(form(), () => 'Пароль слишком короткий')).toBe('Пароль слишком короткий');
    expect(staffJoinFormProblem(form({ passwordRepeat: 'other' }), () => '')).toBe('Пароли не совпадают');
    expect(staffJoinFormProblem(form(), () => '')).toBe('');
  });

  it('экран ожидания только пока нет компании и заявка не одобрена', () => {
    expect(isAwaitingJoin(null)).toBe(false);
    expect(COMPANY_SEARCH_MIN).toBe(2);
    expect(
      isAwaitingJoin({
        id: 'u',
        login: 'a',
        role: 'crew',
        displayName: 'А',
        orgId: null,
        org: null,
        staffJoin: { status: 'pending', companyName: 'Юг' },
      }),
    ).toBe(true);
    expect(
      isAwaitingJoin({
        id: 'u',
        login: 'a',
        role: 'crew',
        displayName: 'А',
        orgId: 'ui_org',
        org: null,
        staffJoin: { status: 'pending', companyName: 'Юг' },
      }),
    ).toBe(false);
  });

  it('новые заявки сверху', () => {
    const rows: StaffJoinRequest[] = [
      { id: '1', userId: 'a', login: 'a', displayName: 'А', role: 'crew', status: 'pending', submittedAt: '2026-01-01' },
      { id: '2', userId: 'b', login: 'b', displayName: 'Б', role: 'sales', status: 'rejected', submittedAt: '2026-02-01' },
      { id: '3', userId: 'c', login: 'c', displayName: 'В', role: 'measurer', status: 'pending', submittedAt: '2026-03-01' },
    ];
    expect(pendingStaffJoins(rows).map((row) => row.id)).toEqual(['3', '1']);
  });
});
