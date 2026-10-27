import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDemoPlatform } from './demoSeed.js';
import { greetingLine, personName } from '../../packages/shared/personName.js';

const ROLE_WORD = /^(Владелец|Менеджер|Замерщик|Монтажник|Админ|Администратор|Admin)$/;

test('у демо-ролей на сервере правдоподобные имена', () => {
  const { users } = buildDemoPlatform({ withHashes: false });
  assert.ok(users.length >= 9);
  for (const user of users) {
    const name = personName(user.displayName);
    assert.ok(name, `${user.login} без личного имени`);
    assert.equal(ROLE_WORD.test(name.split(' ')[0]), false, user.displayName);
    assert.equal(user.phone, undefined);
    assert.match(greetingLine(user.displayName, 9), /^Доброе утро, \S+$/);
    assert.equal(greetingLine(user.displayName, 9).includes(user.role), false);
  }
});
