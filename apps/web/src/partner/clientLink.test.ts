import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canCreateClientLink,
  canDisableClientLink,
  clientLinkUrl,
  isClientLinkHash,
  parseClientLinkHash,
} from './clientLink.ts';

const TOKEN = 'Abcdefghijklmnopqrstuvwxyz012345';

test('адрес клиента: токен берётся из #/r/<токен> и #r/<токен>', () => {
  assert.equal(TOKEN.length, 32);
  assert.equal(parseClientLinkHash(`#/r/${TOKEN}`), TOKEN);
  assert.equal(parseClientLinkHash(`#r/${TOKEN}`), TOKEN);
  assert.equal(parseClientLinkHash(`r/${TOKEN}`), TOKEN);
});

test('адрес клиента: чужие и кривые адреса токеном не считаются', () => {
  assert.equal(parseClientLinkHash(''), null);
  assert.equal(parseClientLinkHash('#project/p1/work'), null);
  assert.equal(parseClientLinkHash('#/r/'), null);
  assert.equal(parseClientLinkHash('#/r/abc'), null);
  assert.equal(parseClientLinkHash(`#/r/${TOKEN}/extra`), null);
  assert.equal(parseClientLinkHash(`#/r/${TOKEN}!`), null);
});

test('страница клиента открывается и по кривой ссылке: там будет понятное сообщение', () => {
  assert.equal(isClientLinkHash('#/r/abc'), true);
  assert.equal(isClientLinkHash('#/r/'), true);
  assert.equal(isClientLinkHash('#project/p1'), false);
  assert.equal(isClientLinkHash(''), false);
});

test('ссылка собирается из адреса сайта и токена', () => {
  assert.equal(clientLinkUrl(TOKEN, 'https://example.test'), `https://example.test/#/r/${TOKEN}`);
});

test('права: создают владелец, менеджер, замерщик; отключают владелец и менеджер', () => {
  for (const role of ['owner', 'sales', 'measurer'] as const) assert.equal(canCreateClientLink(role), true);
  assert.equal(canCreateClientLink('crew'), false);
  assert.equal(canCreateClientLink(undefined), false);
  assert.equal(canDisableClientLink('owner'), true);
  assert.equal(canDisableClientLink('sales'), true);
  assert.equal(canDisableClientLink('measurer'), false);
  assert.equal(canDisableClientLink('crew'), false);
});
