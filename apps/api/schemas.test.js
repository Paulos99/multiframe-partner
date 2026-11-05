import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import {
  LOGIN_MAX,
  MATERIAL_DIRECT_MAX_BYTES,
  MATERIAL_MAX_PARTS,
  OBJECT_PAYLOAD_MAX,
  createSchemas,
  parseWith,
} from '../../packages/shared/schemas.js';
import { parseBody, schemas } from './validation.js';

const fail = (schema, value) => {
  const result = parseWith(schema, value);
  assert.equal(result.ok, false, 'ожидалась ошибка');
  return result;
};
const pass = (schema, value) => {
  const result = parseWith(schema, value);
  assert.equal(result.ok, true, result.message);
  return result.data;
};

test('createSchemas: схемы собираются из переданного zod, общий модуль сам zod не импортирует', () => {
  assert.ok(createSchemas(z).loginRequest);
});

test('вход: логин обрезается и режется до 200 знаков, пароль не трогается', () => {
  const data = pass(schemas.loginRequest, { login: `  ${'a'.repeat(300)} `, password: ' пароль ' });
  assert.equal(data.login.length, 200);
  assert.equal(data.password, ' пароль ');
  assert.deepEqual(pass(schemas.loginRequest, {}), { login: '', password: '' });
  assert.equal(pass(schemas.loginRequest, { login: 0, password: null }).login, '');
});

test('любое тело, не объект, отклоняется с 400', () => {
  for (const bad of [null, 'text', 7, [], undefined]) {
    assert.deepEqual(fail(schemas.loginRequest, bad), { ok: false, message: 'Некорректный запрос', status: 400 });
  }
});

test('новый партнёр: пустые логин и пароль, длинный логин, название по умолчанию', () => {
  assert.equal(fail(schemas.partnerCreate, { login: 'a' }).message, 'Укажите логин и пароль');
  assert.equal(fail(schemas.partnerCreate, { login: ' ', password: 'x' }).message, 'Укажите логин и пароль');
  const long = fail(schemas.partnerCreate, { login: 'a'.repeat(LOGIN_MAX + 1), password: 'p' });
  assert.equal(long.message, 'Логин слишком длинный');
  assert.equal(long.status, 400);
  const edge = pass(schemas.partnerCreate, { login: ` ${'a'.repeat(LOGIN_MAX)} `, password: ' p ', companyName: '  ' });
  assert.equal(edge.login.length, LOGIN_MAX);
  assert.equal(edge.password, 'p');
  assert.equal(edge.companyName, edge.login);
  assert.equal(pass(schemas.partnerCreate, { login: 'l', password: 'p', companyName: ' ООО ' }).companyName, 'ООО');
});

test('менеджер StP: длина логина не ограничивается, имя по умолчанию — логин', () => {
  const data = pass(schemas.stpManagerCreate, { login: 'a'.repeat(LOGIN_MAX + 10), password: 'p' });
  assert.equal(data.displayName, data.login);
  assert.equal(fail(schemas.stpManagerCreate, { password: 'p' }).message, 'Укажите логин и пароль');
});

test('сотрудник: роль проверяется раньше логина, executor — это замерщик, пустая роль — замерщик', () => {
  assert.equal(fail(schemas.staffCreate, { role: 'owner' }).message, 'Роль: sales, measurer или crew');
  assert.equal(fail(schemas.staffCreate, { role: 'admin', login: 'a', password: 'b' }).message, 'Роль: sales, measurer или crew');
  assert.equal(fail(schemas.staffCreate, { role: 'crew' }).message, 'Укажите логин и пароль');
  assert.equal(
    fail(schemas.staffCreate, { login: 'a'.repeat(LOGIN_MAX + 1), password: 'p' }).message,
    'Логин слишком длинный',
  );
  assert.equal(pass(schemas.staffCreate, { login: 'l', password: 'p', role: 'executor' }).role, 'measurer');
  assert.equal(pass(schemas.staffCreate, { login: 'l', password: 'p' }).role, 'measurer');
  const crew = pass(schemas.staffCreate, { login: ' l ', password: 'p', role: ' crew ', displayName: ' Иван ' });
  assert.deepEqual([crew.login, crew.role, crew.displayName], ['l', 'crew', 'Иван']);
  assert.equal(pass(schemas.staffCreate, { login: 'l', password: 'p' }).displayName, 'l');
});

test('обновление сотрудника и города партнёра: поле должно быть передано', () => {
  assert.equal(fail(schemas.staffUpdate, {}).message, 'Укажите имя');
  assert.equal(pass(schemas.staffUpdate, { displayName: '' }).displayName, '');
  assert.equal(fail(schemas.partnerCityUpdate, { name: 'x' }).message, 'Укажите город');
  assert.equal(pass(schemas.partnerCityUpdate, { city: '' }).city, '');
});

test('комната: идентификатор проверяется только при создании, большой расчёт — 413', () => {
  assert.equal(fail(schemas.objectInput({ isNew: true }), { id: 'плохой id' }).message, 'Некорректный идентификатор комнаты');
  assert.equal(fail(schemas.objectInput({ isNew: true }), { id: 'a'.repeat(65) }).status, 400);
  pass(schemas.objectInput({ isNew: true }), { id: 'room_1-A' });
  pass(schemas.objectInput({ isNew: true }), {});
  pass(schemas.objectInput({ isNew: false }), { id: 'плохой id' });
  const big = fail(schemas.objectInput({ isNew: false }), { estimate: { x: 'a'.repeat(OBJECT_PAYLOAD_MAX) } });
  assert.deepEqual([big.message, big.status], ['Слишком большие данные расчёта', 413]);
  pass(schemas.objectInput({ isNew: false }), { room: null, estimate: { ok: 1 } });
});

test('проект: название обязательно, берётся своё или сохранённое, режется до 250 знаков', () => {
  assert.equal(fail(schemas.projectInput(undefined), {}).message, 'Укажите название проекта');
  assert.equal(fail(schemas.projectInput('Старое'), { name: '   ' }).message, 'Укажите название проекта');
  assert.equal(pass(schemas.projectInput('Старое'), { address: 'x' }).name, 'Старое');
  assert.equal(pass(schemas.projectInput('Старое'), { name: ' Новое ' }).name, 'Новое');
  assert.equal(pass(schemas.projectInput(undefined), { name: 'я'.repeat(400) }).name.length, 250);
  assert.equal(pass(schemas.projectInput(undefined), { name: 'П', clientName: 'К' }).clientName, 'К');
});

test('материалы: размер файла, ключ и части', () => {
  assert.equal(fail(schemas.materialMultipartStart, { size: 0 }).message, 'Файл пустой');
  assert.equal(fail(schemas.materialMultipartStart, { size: 'abc' }).message, 'Файл пустой');
  const huge = fail(schemas.materialMultipartStart, { size: MATERIAL_DIRECT_MAX_BYTES + 1 });
  assert.deepEqual([huge.message, huge.status], ['Файл больше 5 ТБ', 413]);
  assert.equal(pass(schemas.materialMultipartStart, { size: '1024' }).size, 1024);

  assert.equal(fail(schemas.materialMultipartRef, { storageKey: '../x', uploadId: 'u' }).message, 'Некорректный ключ материала');
  assert.equal(fail(schemas.materialMultipartRef, { storageKey: 'materials/mat_ab' }).message, 'Нет uploadId');
  assert.equal(
    fail(schemas.materialMultipartRef, { storageKey: 'materials/mat_ab', uploadId: 'u'.repeat(1025) }).message,
    'Нет uploadId',
  );
  assert.equal(pass(schemas.materialMultipartRef, { storageKey: 'materials/mat_a_1', uploadId: 'u' }).uploadId, 'u');

  assert.equal(fail(schemas.materialMultipartParts, {}).message, 'Нужно от 1 до 100 номеров частей');
  assert.equal(
    fail(schemas.materialMultipartParts, { partNumbers: Array.from({ length: 101 }, (_, i) => i + 1) }).message,
    'Нужно от 1 до 100 номеров частей',
  );
  for (const bad of [0, 1.5, MATERIAL_MAX_PARTS + 1, 'x']) {
    assert.equal(fail(schemas.materialMultipartParts, { partNumbers: [1, bad] }).message, 'Некорректный номер части');
  }
  assert.deepEqual(pass(schemas.materialMultipartParts, { partNumbers: ['1', 2, 2] }).partNumbers, [1, 2]);
});

test('parseBody бросает ошибку со статусом и русским текстом', () => {
  assert.throws(
    () => parseBody(schemas.materialMultipartStart, { size: MATERIAL_DIRECT_MAX_BYTES + 1 }),
    (error) => error.status === 413 && error.message === 'Файл больше 5 ТБ',
  );
  assert.throws(
    () => parseBody(schemas.staffUpdate, null),
    (error) => error.status === 400 && error.message === 'Некорректный запрос',
  );
});
