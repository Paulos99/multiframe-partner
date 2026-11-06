import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanStaffPhone, projectManagerContact } from '../../packages/shared/clientPhone.js';

test('cleanStaffPhone: только российские номера', () => {
  assert.deepEqual(cleanStaffPhone('89990001122'), { value: '+7 999 000-11-22' });
  assert.deepEqual(cleanStaffPhone('+7 999 000 11 22'), { value: '+7 999 000-11-22' });
  assert.deepEqual(cleanStaffPhone(''), { value: '' });
  assert.ok(cleanStaffPhone('+375291234567').error);
  assert.ok(cleanStaffPhone('abc').error);
});

test('projectManagerContact: менеджер проекта, иначе владелец', () => {
  const users = [
    { id: 'o', role: 'owner', orgId: 'org', displayName: 'Владелец', phone: '+7 900 000-00-01' },
    { id: 'm', role: 'sales', orgId: 'org', displayName: 'Елена', phone: '+7 900 000-00-02' },
    { id: 'n', role: 'sales', orgId: 'org', displayName: 'Без номера' },
  ];
  assert.deepEqual(projectManagerContact({ managerUserId: 'm', orgId: 'org' }, users), { id: 'm', name: 'Елена', phone: '+7 900 000-00-02' });
  assert.equal(projectManagerContact({ managerUserId: 'n', orgId: 'org' }, users).phone, '+7 900 000-00-01');
  assert.equal(projectManagerContact({ managerUserId: null, orgId: 'org' }, users).id, 'o');
  assert.equal(projectManagerContact({ managerUserId: 'n', orgId: 'x' }, users).name, 'Без номера');
  assert.equal(projectManagerContact(null, []), null);
});
