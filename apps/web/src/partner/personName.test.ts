import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyDemoPersonalNames,
  greetingLine,
  greetingName,
  personName,
} from '../../../../packages/shared/personName.js';
import { buildLocalDemoUsers } from './demoSeed.ts';

const ROLE_WORD = /^(Владелец|Менеджер|Замерщик|Монтажник|Админ|Администратор|Admin)$/;

test('приветствие берёт личное имя и молчит, если его нет', () => {
  assert.equal(greetingLine('Андрей Соколов', 8), 'Доброе утро, Андрей');
  assert.equal(greetingLine('Мария', 13), 'Добрый день, Мария');
  assert.equal(greetingLine('Игорь Лебедев', 21), 'Добрый вечер, Игорь');
  assert.equal(greetingLine('', 8), 'Доброе утро');
  assert.equal(greetingLine('   ', 13), 'Добрый день');
  assert.equal(greetingLine('Владелец · Потолки Столицы', 8), 'Доброе утро');
  assert.equal(greetingLine('Монтажник 2 · Потолки Столицы', 20), 'Добрый вечер');
  assert.equal(greetingLine('Администратор StP', 15), 'Добрый день');
  assert.equal(greetingName('Елена Крылова'), 'Елена');
  assert.equal(personName('Елена Крылова'), 'Елена Крылова');
  assert.equal(personName('Владелец'), '');
});

test('в локальном демо у каждой роли своё имя, старая подпись роли заменяется', () => {
  const users = buildLocalDemoUsers();
  assert.equal(users.length, 11);
  for (const user of users) {
    const name = personName(user.displayName);
    assert.ok(name, user.login);
    assert.equal(ROLE_WORD.test(name.split(' ')[0] || ''), false, user.displayName);
    assert.equal(greetingLine(user.displayName, 9).startsWith('Доброе утро, '), true);
  }
  const stale = [
    { id: 'u_partner1', displayName: 'Владелец · Потолки Столицы' },
    { id: 'u_sales1', displayName: 'Елена Крылова' },
    { id: 'u_crew1b', displayName: '' },
    { id: 'someone', displayName: 'Владелец · Чужая' },
  ];
  assert.equal(applyDemoPersonalNames(stale), true);
  assert.equal(stale[0]?.displayName, 'Андрей Соколов');
  assert.equal(stale[1]?.displayName, 'Елена Крылова');
  assert.equal(stale[2]?.displayName, '');
  assert.equal(stale[3]?.displayName, 'Владелец · Чужая');
  assert.equal(applyDemoPersonalNames(stale), false);
});
