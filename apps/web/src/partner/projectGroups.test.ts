import assert from 'node:assert/strict';
import test from 'node:test';
import { buildProjectCards, cardMatches, visibleRooms } from './projectGroups.ts';

const kitchen = {
  id: 'room-k',
  projectId: 'prj_flat',
  status: 'measured',
  clientName: 'Иванова',
  address: 'Арбат, 12',
  roomName: 'Кухня',
};
const bedroom = {
  id: 'room-b',
  projectId: 'prj_flat',
  status: 'install',
  clientName: 'Иванова',
  address: 'Арбат, 12',
  roomName: 'Спальня',
};
const loose = {
  id: 'room-old',
  status: 'draft',
  clientName: 'Чернов',
  address: 'Бауманская, 33',
  roomName: '',
};
const project = {
  id: 'prj_flat',
  name: 'Квартира на Арбате',
  clientName: 'Иванова',
  address: 'Арбат, 12',
  city: 'Москва',
};

test('комнаты собираются в проект, старый объект остаётся карточкой в том же списке', () => {
  const cards = buildProjectCards([project], [kitchen, bedroom, loose]);
  assert.equal(cards.length, 2);
  assert.equal(cards[0].key, 'prj_flat');
  assert.deepEqual(cards[0].rooms.map((room) => room.roomName), ['Кухня', 'Спальня']);
  assert.equal(cards[1].loose, true);
  assert.equal(cards[1].title, 'Чернов');
  assert.equal(cardMatches(cards[0], 'спальня', 'all'), true);
  assert.equal(cardMatches(cards[0], '', 'install'), true);
  assert.equal(cardMatches(cards[1], '', 'install'), false);
  assert.deepEqual(
    visibleRooms(cards[0].rooms, 'install').map((room) => room.id),
    ['room-b'],
  );
});
