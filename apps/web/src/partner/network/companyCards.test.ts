import type { AnalyticsPartnerRow } from '../../../../../packages/shared/partner';
import {
  ACTIVITY_METRICS,
  buildCompanyCards,
  companyCountLabel,
  formatActivityWhen,
  objectCountLabel,
  staffLabel,
  type NetworkObject,
  type NetworkPartner,
} from './companyCards.ts';

function equal(actual: unknown, expected: unknown) {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) throw new Error(`Expected ${right}, got ${left}`);
}

function partner(partial: Partial<NetworkPartner> & { id: string; orgId: string | null }): NetworkPartner {
  return {
    user: { id: partial.id, orgId: partial.orgId, displayName: partial.user?.displayName || partial.id },
    org: partial.org,
    executorCount: partial.executorCount ?? 0,
  };
}

function activity(partial: Partial<AnalyticsPartnerRow> & { companyName: string }): AnalyticsPartnerRow {
  return {
    orgId: partial.orgId ?? null,
    companyName: partial.companyName,
    city: partial.city || '',
    logins: partial.logins ?? 0,
    problemomer: partial.problemomer ?? 0,
    calculator: partial.calculator ?? 0,
    pdf: partial.pdf ?? 0,
    shares: partial.shares ?? 9,
    areaM2: partial.areaM2 ?? 40,
    panels: partial.panels ?? 12,
    lastActiveAt: partial.lastActiveAt ?? null,
  };
}

const labels = ACTIVITY_METRICS.map((metric) => metric.label).join(' ');
if (/продаж/i.test(labels)) throw new Error('Входы нельзя называть продажами');
equal(ACTIVITY_METRICS.map((metric) => metric.key), ['logins', 'problemomer', 'calculator', 'pdf']);
equal(staffLabel(1), '1 сотрудник');
equal(staffLabel(2), '2 сотрудника');
equal(staffLabel(5), '5 сотрудников');
equal(staffLabel(11), '11 сотрудников');
equal(staffLabel(21), '21 сотрудник');
equal(companyCountLabel(2), '2 компании');
equal(objectCountLabel(11), '11 объектов');
equal(formatActivityWhen(null), null);
equal(formatActivityWhen('не дата'), null);

const moscow: NetworkObject[] = [
  { orgId: 'org_a', status: 'draft', objectStage: 'newbuild' },
  { orgId: 'org_a', status: 'measured', objectStage: 'renovation' },
  { orgId: 'org_a', status: 'measured', objectStage: null },
  { orgId: 'org_a', status: 'quote_sent', objectStage: 'occupied' },
  { orgId: 'org_a', status: 'weird', objectStage: 'custom-code' },
  { orgId: 'org_b', status: 'closed', objectStage: 'newbuild' },
];

const cards = buildCompanyCards({
  partners: [
    partner({
      id: 'u_a',
      orgId: 'org_a',
      executorCount: 4,
      user: { id: 'u_a', orgId: 'org_a', displayName: 'Владелец А' },
      org: { settings: { companyName: 'Потолки Столицы', city: ' Москва ' } },
    }),
    partner({
      id: 'u_b',
      orgId: 'org_b',
      executorCount: 0,
      user: { id: 'u_b', orgId: 'org_b', displayName: 'Владелец Б' },
      org: { settings: { companyName: 'Северный Потолок', city: '' } },
    }),
    partner({
      id: 'u_c',
      orgId: 'org_c',
      executorCount: 1,
      user: { id: 'u_c', orgId: 'org_c', displayName: 'Тихий край' },
      org: { settings: { companyName: 'Тихий край', city: 'Казань' } },
    }),
    partner({
      id: 'u_d',
      orgId: null,
      executorCount: Number.NaN,
      user: { id: 'u_d', orgId: null, displayName: '   ' },
      org: null,
    }),
  ],
  objects: moscow,
  activity: [
    activity({
      orgId: 'org_a',
      companyName: 'Потолки Столицы',
      logins: 3,
      problemomer: 2,
      calculator: 1,
      pdf: 0,
      lastActiveAt: '2026-10-18T09:30:00.000Z',
    }),
    activity({
      orgId: 'org_other',
      companyName: 'Потолки Столицы',
      logins: 99,
      problemomer: 99,
    }),
    activity({ orgId: null, companyName: 'Тихий край', logins: 0, problemomer: 0 }),
  ],
});

equal(cards.map((card) => card.companyName), ['Потолки Столицы', 'Северный Потолок', 'Тихий край', 'Без названия']);
equal(cards[0]?.city, 'Москва');
equal(cards[0]?.staffCount, 4);
equal(cards[0]?.objects, {
  state: 'ready',
  total: 5,
  stages: [
    { key: 'draft', label: 'Черновик', count: 1 },
    { key: 'measured', label: 'Замер', count: 2 },
    { key: 'quote_sent', label: 'КП отправлено', count: 1 },
  ],
  siteStages: [
    { key: 'newbuild', label: 'Новостройка / до заселения', count: 1 },
    { key: 'renovation', label: 'Идёт ремонт', count: 1 },
    { key: 'occupied', label: 'Уже живут', count: 1 },
    { key: 'custom-code', label: 'custom-code', count: 1 },
    { key: 'missing', label: 'Не указана', count: 1 },
  ],
});
equal(cards[0]?.activity, {
  state: 'ready',
  logins: 3,
  problemomer: 2,
  calculator: 1,
  pdf: 0,
  lastActiveAt: '2026-10-18T09:30:00.000Z',
});
equal(Object.keys(cards[0]?.activity.state === 'ready' ? cards[0].activity : {}).filter((key) => key !== 'state').sort(), [
  'calculator',
  'lastActiveAt',
  'logins',
  'pdf',
  'problemomer',
]);
equal(cards[1]?.city, null);
equal(cards[1]?.objects.state === 'ready' ? cards[1].objects.total : null, 1);
equal(cards[1]?.activity, { state: 'empty' });
equal(cards[2]?.activity, { state: 'empty' });
equal(cards[2]?.objects, { state: 'empty' });
equal(cards[3]?.staffCount, null);
equal(cards[3]?.objects, { state: 'unlinked' });

const hidden = buildCompanyCards({
  partners: [partner({ id: 'u_a', orgId: 'org_a', org: { settings: { companyName: 'Потолки Столицы', city: 'Москва' } } })],
  objects: null,
  activity: null,
});
equal(hidden[0]?.objects, { state: 'unknown' });
equal(hidden[0]?.activity, { state: 'unknown' });
equal(buildCompanyCards({ partners: [], objects: [], activity: [] }), []);

const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const when = formatActivityWhen('2026-10-18T09:30:00.000Z');
const parsed = new Date('2026-10-18T09:30:00.000Z');
equal(when, `${parsed.getDate()} ${MONTHS[parsed.getMonth()]}, ${String(parsed.getHours()).padStart(2, '0')}:${String(parsed.getMinutes()).padStart(2, '0')}`);

console.log('STP company cards: checks passed');
