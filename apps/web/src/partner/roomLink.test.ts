import assert from 'node:assert/strict';
import test from 'node:test';
import type { JobObject } from '../../../../packages/shared/partner.ts';
import { calcUrlFromOrg } from './calcUrl.ts';
import { answersFromStoredRoom, linkCalcToRoom, roomRecordFromAnswers } from './roomLink.ts';

const room = {
  roomType: 'bedroom' as const,
  roomTypeCustom: '',
  ceilingAreaM2: 18,
  slabType: 'hollow' as const,
  slabThickness: 'unknown' as const,
  floorAbove: 'unknown' as const,
  houseType: 'panel' as const,
  objectStage: 'renovation' as const,
  plannedCeiling: 'gypsum' as const,
  noisyNeighbors: 'often_noisy' as const,
  noiseKind: 'mixed' as const,
  roomWishes: ['from_above' as const],
};

function existing(area = 12): JobObject {
  return {
    id: 'room-1',
    orgId: 'org',
    createdAt: '',
    updatedAt: '',
    createdBy: 'u',
    assignedTo: null,
    status: 'draft',
    clientName: 'Никитин И.',
    clientPhone: '+7999',
    address: 'Ленина, 1',
    city: 'Москва',
    room: { areaM2: area, roomType: 'kitchen', answers: { ceilingAreaM2: area, roomType: 'kitchen' } },
    estimate: null,
    clientSummary: '',
    history: [],
    projectId: 'prj',
    roomName: '',
    documents: [],
  };
}

test('проблемомер → проект: площадь, тип комнаты и натяжной потолок', () => {
  const saved = roomRecordFromAnswers(room);
  assert.equal(saved.areaM2, 18);
  assert.equal(saved.roomType, 'bedroom');
  assert.equal(saved.houseType, 'panel');
  assert.equal((saved.answers as { plannedCeiling?: string }).plannedCeiling, 'stretch');
  assert.equal((saved.answers as { ceilingAreaM2?: number }).ceilingAreaM2, 18);
});

test('проект → проблемомер: площадь комнаты подставляется обратно', () => {
  const back = answersFromStoredRoom({
    areaM2: 22,
    roomType: 'kids',
    answers: { ceilingAreaM2: 10, roomType: 'kitchen', plannedCeiling: 'plaster' },
  });
  assert.equal(back?.ceilingAreaM2, 22);
  assert.equal(back?.roomType, 'kids');
  assert.equal(back?.plannedCeiling, 'stretch');
});

test('проект → калькулятор: в ссылке уже стоит площадь комнаты', () => {
  const url = calcUrlFromOrg(
    {
      companyName: 'Компания',
      city: 'Москва',
      panelPriceRub: 2396,
      pricePerM2: 5990,
      installPricePerM2: 1500,
      dowelPriceRub: 25,
      dowelsPerPanel: 2,
    },
    'Компания',
    { objectId: 'room-1', clientName: 'Никитин И.', areaM2: 18 },
  );
  assert.match(url, /objectId=room-1/);
  assert.match(url, /area=18/);
  assert.match(url, /surfaces=ceiling/);
  assert.doesNotMatch(url, /ceiling_framed/);
});

test('калькулятор → проект: новая площадь в той же комнате, без новой карточки', () => {
  const patch = linkCalcToRoom(
    { type: 'mf-cabinet-calc', areaM2: 21.4, panels: 56, dowels: 129, hasScheme: true, panelsCost: 134176 },
    existing(18),
    {
      companyName: 'Компания',
      city: 'Москва',
      panelPriceRub: 2396,
      pricePerM2: 5990,
      installPricePerM2: 1500,
      dowelPriceRub: 25,
      dowelsPerPanel: 2,
    },
  );
  assert.ok(patch);
  assert.equal(patch.id, 'room-1');
  assert.equal(patch.room?.areaM2, 21.4);
  assert.equal((patch.room?.answers as { ceilingAreaM2?: number }).ceilingAreaM2, 21.4);
  assert.equal(patch.clientName, undefined);
  assert.equal(patch.estimate?.panels, 56);
  assert.equal(linkCalcToRoom({ type: 'mf-cabinet-calc', areaM2: 30 }, undefined, null), null);
});
