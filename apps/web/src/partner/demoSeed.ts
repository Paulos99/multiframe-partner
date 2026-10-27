/**
 * Client-side mirror of apps/api/demoSeed.js for offline / local fallback.
 */
import { boostCapitalEvents } from '../../../../packages/shared/demoAnalyticsBoost.js';
import {
  DEFAULT_DOWEL_PRICE_RUB,
  DEFAULT_INSTALL_PRICE_PER_M2,
  OFFICIAL_PANEL_PRICE_RUB,
  OFFICIAL_PRICE_PER_M2,
  PANEL_AREA_M2,
  type JobObject,
  type JobObjectStatus,
  type OrgSettings,
  type UserRole,
} from '../../../../packages/shared/partner';

type DemoUser = {
  id: string;
  login: string;
  password: string;
  role: UserRole;
  displayName: string;
  orgId: string | null;
  createdAt: string;
};

type DemoOrg = {
  id: string;
  settings: OrgSettings;
  createdAt: string;
  createdBy: string;
};

export type DemoAccount = {
  login: string;
  password: string;
  role: UserRole | 'admin';
  company: string;
  label: string;
};

export const DEMO_ACCOUNTS: DemoAccount[] = [
  { login: 'admin', password: 'admin1234', role: 'admin', company: 'StP', label: 'Admin StP' },
  {
    login: 'partner1',
    password: 'demo1234',
    role: 'owner',
    company: 'Потолки Столицы',
    label: 'Владелец · Потолки Столицы',
  },
  {
    login: 'sales1',
    password: 'exec1234',
    role: 'sales',
    company: 'Потолки Столицы',
    label: 'Менеджер · Потолки Столицы',
  },
  {
    login: 'exec1',
    password: 'exec1234',
    role: 'measurer',
    company: 'Потолки Столицы',
    label: 'Замерщик · Потолки Столицы',
  },
  {
    login: 'crew1',
    password: 'exec1234',
    role: 'crew',
    company: 'Потолки Столицы',
    label: 'Монтажник · Потолки Столицы',
  },
  {
    login: 'crew1b',
    password: 'exec1234',
    role: 'crew',
    company: 'Потолки Столицы',
    label: 'Монтажник 2 · Потолки Столицы',
  },
  {
    login: 'partner2',
    password: 'demo1234',
    role: 'owner',
    company: 'Северный Потолок',
    label: 'Владелец · Северный Потолок',
  },
  {
    login: 'sales2',
    password: 'exec1234',
    role: 'sales',
    company: 'Северный Потолок',
    label: 'Менеджер · Северный Потолок',
  },
  {
    login: 'exec2',
    password: 'exec1234',
    role: 'measurer',
    company: 'Северный Потолок',
    label: 'Замерщик · Северный Потолок',
  },
  {
    login: 'crew2',
    password: 'exec1234',
    role: 'crew',
    company: 'Северный Потолок',
    label: 'Монтажник · Северный Потолок',
  },
];

/** Реальное «сейчас» минус n суток. Час берётся из Date.now(), не из выдуманных демо-часов. */
function daysAgo(n: number, _hour?: number, _minute?: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
}

/** Полдень локального дня: повторная сборка в те же сутки даёт те же отметки. */
function analyticsAt(day: number): string {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - day);
  return date.toISOString();
}

export const DEMO_HISTORY_SCHEMA = 3;

/** День отсчёта, а не день недели: одни и те же цифры в любой день календаря. */
const DEMO_HISTORY_DAYS = 371;

function includeDemoDay(day: number): boolean {
  if (day < 28) return true;
  if (day < 100) return day % 4 === 0;
  return day % 14 === 0;
}

const DEMO_PEOPLE: Record<string, { login: string; name: string }> = {
  u_partner1: { login: 'partner1', name: 'Владелец · Потолки Столицы' },
  u_sales1: { login: 'sales1', name: 'Менеджер · Потолки Столицы' },
  u_exec1: { login: 'exec1', name: 'Замерщик · Потолки Столицы' },
  u_crew1: { login: 'crew1', name: 'Монтажник · Потолки Столицы' },
  u_crew1b: { login: 'crew1b', name: 'Монтажник 2 · Потолки Столицы' },
  u_partner2: { login: 'partner2', name: 'Владелец · Северный Потолок' },
  u_sales2: { login: 'sales2', name: 'Менеджер · Северный Потолок' },
  u_exec2: { login: 'exec2', name: 'Замерщик · Северный Потолок' },
  u_crew2: { login: 'crew2', name: 'Монтажник · Северный Потолок' },
};

function historyStamp(userId: string, at: string, action: string, detail?: string) {
  const person = DEMO_PEOPLE[userId] || { login: 'system', name: 'Сотрудник' };
  return { at, userId, login: person.login, authorName: person.name, action, detail };
}

function orgSettings(companyName: string, city: string): OrgSettings {
  return {
    companyName,
    city,
    panelPriceRub: OFFICIAL_PANEL_PRICE_RUB,
    pricePerM2: OFFICIAL_PRICE_PER_M2,
    installPricePerM2: DEFAULT_INSTALL_PRICE_PER_M2,
    dowelsPerPanel: 2,
    dowelPriceRub: DEFAULT_DOWEL_PRICE_RUB,
  };
}

function estimate(areaM2: number) {
  const panels = Math.ceil(areaM2 / PANEL_AREA_M2);
  const dowels = Math.ceil(panels * 2 * 1.15);
  const panelsCost = panels * OFFICIAL_PANEL_PRICE_RUB;
  const installCost = Math.round(areaM2 * DEFAULT_INSTALL_PRICE_PER_M2);
  const dowelsCost = Math.round(dowels * DEFAULT_DOWEL_PRICE_RUB);
  return {
    panels,
    dowels,
    panelsCost,
    installCost,
    dowelsCost,
    totalCost: panelsCost + installCost + dowelsCost,
  };
}

const ROOM_TYPES = ['living', 'bedroom', 'kids', 'kitchen', 'office'] as const;
const HOUSE_TYPES = ['panel', 'block', 'brick', 'monolith'] as const;
const STAGES = ['newbuild', 'renovation', 'occupied'] as const;
/**
 * Demo «было → с MultiFrame» pairs. Only transitions the problem meter can really
 * produce (the ceiling never lowers the class). Mirrors apps/api/demoSeed.js.
 */
export const DEMO_CLASS_PAIRS = [
  ['below', 'V'],
  ['V', 'B'],
  ['below', 'V'],
  ['B', 'A'],
] as const;

function pick<T>(arr: readonly T[], i: number): T {
  return arr[i % arr.length]!;
}

type Spec = {
  id: string;
  status: JobObjectStatus;
  clientName: string;
  phone: string;
  address: string;
  area: number;
  day: number;
  rt: number;
  ht: number;
  st: number;
};

const SPECS_A: Spec[] = [
  { id: 'obj_a01', status: 'closed', clientName: 'Иванова А.', phone: '+7 495 111-01-01', address: 'ул. Арбат, 12', area: 18, day: 28, rt: 0, ht: 0, st: 2 },
  { id: 'obj_a02', status: 'closed', clientName: 'Петров С.', phone: '+7 495 111-01-02', address: 'Ленинский пр., 45', area: 22, day: 25, rt: 1, ht: 1, st: 1 },
  { id: 'obj_a03', status: 'install', clientName: 'Сидорова М.', phone: '+7 495 111-01-03', address: 'ул. Тверская, 8', area: 16, day: 18, rt: 2, ht: 2, st: 0 },
  { id: 'obj_a04', status: 'install', clientName: 'Козлов Д.', phone: '+7 495 111-01-04', address: 'пр. Мира, 70', area: 28, day: 15, rt: 0, ht: 3, st: 1 },
  { id: 'obj_a05', status: 'quote_sent', clientName: 'Вася', phone: '+7 495 111-01-05', address: 'ул. Смирнова, 74', area: 13, day: 8, rt: 1, ht: 1, st: 2 },
  { id: 'obj_a06', status: 'quote_sent', clientName: 'Морозова Е.', phone: '+7 495 111-01-06', address: 'ул. Покровка, 3', area: 20, day: 6, rt: 3, ht: 0, st: 1 },
  { id: 'obj_a07', status: 'quote_sent', clientName: 'Никитин И.', phone: '+7 495 111-01-07', address: 'ул. Ордынка, 19', area: 24, day: 5, rt: 4, ht: 2, st: 0 },
  { id: 'obj_a08', status: 'measured', clientName: 'Фёдорова О.', phone: '+7 495 111-01-08', address: 'ул. Маросейка, 5', area: 15, day: 3, rt: 1, ht: 1, st: 2 },
  { id: 'obj_a09', status: 'measured', clientName: 'Громов П.', phone: '+7 495 111-01-09', address: 'ул. Таганская, 11', area: 19, day: 2, rt: 0, ht: 3, st: 1 },
  { id: 'obj_a10', status: 'measured', clientName: 'Белова Н.', phone: '+7 495 111-01-10', address: 'ул. Солянка, 2', area: 12, day: 1, rt: 2, ht: 0, st: 2 },
  { id: 'obj_a11', status: 'draft', clientName: 'Чернов А.', phone: '+7 495 111-01-11', address: 'ул. Бауманская, 33', area: 17, day: 0, rt: 3, ht: 2, st: 0 },
];

const SPECS_B: Spec[] = [
  { id: 'obj_b01', status: 'closed', clientName: 'Смирнов В.', phone: '+7 812 222-01-01', address: 'Невский пр., 28', area: 21, day: 27, rt: 0, ht: 2, st: 1 },
  { id: 'obj_b02', status: 'closed', clientName: 'Кузнецова Л.', phone: '+7 812 222-01-02', address: 'Литейный пр., 14', area: 14, day: 22, rt: 1, ht: 0, st: 2 },
  { id: 'obj_b03', status: 'install', clientName: 'Орлов К.', phone: '+7 812 222-01-03', address: 'ул. Рубинштейна, 9', area: 26, day: 16, rt: 0, ht: 3, st: 0 },
  { id: 'obj_b04', status: 'install', clientName: 'Павлова Т.', phone: '+7 812 222-01-04', address: 'Васильевский остр., 7-я линия, 22', area: 18, day: 12, rt: 2, ht: 1, st: 1 },
  { id: 'obj_b05', status: 'quote_sent', clientName: 'Волков Р.', phone: '+7 812 222-01-05', address: 'ул. Садовая, 40', area: 23, day: 9, rt: 4, ht: 2, st: 2 },
  { id: 'obj_b06', status: 'quote_sent', clientName: 'Лебедева И.', phone: '+7 812 222-01-06', address: 'Московский пр., 55', area: 16, day: 7, rt: 1, ht: 0, st: 1 },
  { id: 'obj_b07', status: 'measured', clientName: 'Соколов Д.', phone: '+7 812 222-01-07', address: 'ул. Гороховая, 18', area: 20, day: 4, rt: 3, ht: 1, st: 0 },
  { id: 'obj_b08', status: 'measured', clientName: 'Зайцева М.', phone: '+7 812 222-01-08', address: 'пр. Просвещения, 80', area: 15, day: 2, rt: 0, ht: 0, st: 2 },
  { id: 'obj_b09', status: 'measured', clientName: 'Медведев Ю.', phone: '+7 812 222-01-09', address: 'ул. Оптиков, 4', area: 29, day: 1, rt: 1, ht: 3, st: 1 },
  { id: 'obj_b10', status: 'draft', clientName: 'Егорова С.', phone: '+7 812 222-01-10', address: 'ул. Казанская, 6', area: 11, day: 0, rt: 2, ht: 2, st: 0 },
];

function makeObject(
  spec: Spec,
  orgId: string,
  city: string,
  createdBy: string,
  measurer: string,
  crew: string,
  sales: string,
): JobObject {
  const createdAt = daysAgo(spec.day, 9, 30);
  const quoteAt = daysAgo(Math.max(0, spec.day - 3), 14, 0);
  const installAt = daysAgo(Math.max(0, spec.day - 10), 10, 0);
  const closedAt = daysAgo(Math.max(0, spec.day - 14), 16, 0);
  const history = [historyStamp(createdBy, createdAt, 'create', 'measured')];
  let updatedAt = createdAt;
  if (['quote_sent', 'install', 'closed'].includes(spec.status)) {
    history.unshift(historyStamp(createdBy, quoteAt, 'status', 'measured→quote_sent'));
    updatedAt = quoteAt;
  }
  if (['install', 'closed'].includes(spec.status)) {
    history.unshift(historyStamp(createdBy, installAt, 'status', 'quote_sent→install'));
    updatedAt = installAt;
  }
  if (spec.status === 'closed') {
    history.unshift(historyStamp(createdBy, closedAt, 'status', 'install→closed'));
    updatedAt = closedAt;
  }
  const roomType = pick(ROOM_TYPES, spec.rt);
  const houseType = pick(HOUSE_TYPES, spec.ht);
  const objectStage = pick(STAGES, spec.st);
  return {
    id: spec.id,
    orgId,
    createdAt,
    updatedAt,
    createdBy,
    assignedTo: ['install', 'closed'].includes(spec.status)
      ? crew
      : spec.status === 'measured'
        ? measurer
        : spec.status === 'quote_sent'
          ? sales
          : null,
    status: spec.status,
    clientName: spec.clientName,
    clientPhone: spec.phone,
    address: spec.address,
    city,
    room: {
      roomType,
      areaM2: spec.area,
      houseType,
      objectStage,
      classBefore: pick(DEMO_CLASS_PAIRS, spec.day)[0],
      classAfter: pick(DEMO_CLASS_PAIRS, spec.day)[1],
      answers: { roomType, ceilingAreaM2: spec.area, houseType, objectStage },
    },
    estimate: estimate(spec.area),
    clientSummary: `${spec.clientName} · ${spec.area} м² · ${spec.address}`,
    history,
  };
}

export function buildLocalDemoUsers(): DemoUser[] {
  const now = new Date().toISOString();
  return [
    { id: 'u_admin', login: 'admin', password: 'admin1234', role: 'admin', displayName: 'Администратор StP', orgId: null, createdAt: now },
    { id: 'u_partner1', login: 'partner1', password: 'demo1234', role: 'owner', displayName: 'Владелец · Потолки Столицы', orgId: 'org_demo', createdAt: now },
    { id: 'u_sales1', login: 'sales1', password: 'exec1234', role: 'sales', displayName: 'Менеджер · Потолки Столицы', orgId: 'org_demo', createdAt: now },
    { id: 'u_exec1', login: 'exec1', password: 'exec1234', role: 'measurer', displayName: 'Замерщик · Потолки Столицы', orgId: 'org_demo', createdAt: now },
    { id: 'u_crew1', login: 'crew1', password: 'exec1234', role: 'crew', displayName: 'Монтажник · Потолки Столицы', orgId: 'org_demo', createdAt: now },
    { id: 'u_crew1b', login: 'crew1b', password: 'exec1234', role: 'crew', displayName: 'Монтажник 2 · Потолки Столицы', orgId: 'org_demo', createdAt: now },
    { id: 'u_partner2', login: 'partner2', password: 'demo1234', role: 'owner', displayName: 'Владелец · Северный Потолок', orgId: 'org_demo_spb', createdAt: now },
    { id: 'u_sales2', login: 'sales2', password: 'exec1234', role: 'sales', displayName: 'Менеджер · Северный Потолок', orgId: 'org_demo_spb', createdAt: now },
    { id: 'u_exec2', login: 'exec2', password: 'exec1234', role: 'measurer', displayName: 'Замерщик · Северный Потолок', orgId: 'org_demo_spb', createdAt: now },
    { id: 'u_crew2', login: 'crew2', password: 'exec1234', role: 'crew', displayName: 'Монтажник · Северный Потолок', orgId: 'org_demo_spb', createdAt: now },
  ];
}

export function buildLocalDemoOrgs(): DemoOrg[] {
  return [
    {
      id: 'org_demo',
      createdAt: daysAgo(40),
      createdBy: 'u_admin',
      settings: orgSettings('Потолки Столицы', 'Москва'),
    },
    {
      id: 'org_demo_spb',
      createdAt: daysAgo(38),
      createdBy: 'u_admin',
      settings: orgSettings('Северный Потолок', 'Санкт-Петербург'),
    },
  ];
}

/**
 * Демо-комнаты без живого исполнителя получают текущего сотрудника своей компании.
 * Уже назначенная роль не переписывается. Вызывается и для нового сида, и для записанного v5.
 */
export function assignDemoRoomStaff<T extends { id?: string; orgId?: string | null; status?: string | null; assignedTo?: string | null }>(
  objects: T[],
  users: Array<{ id: string; role: string; orgId?: string | null }>,
): T[] {
  const byOrg = new Map<string, { crew: string[]; sales?: string; measurer?: string }>();
  for (const user of users) {
    if (user.orgId !== 'org_demo' && user.orgId !== 'org_demo_spb') continue;
    const slot = byOrg.get(user.orgId) || { crew: [] };
    if (user.role === 'crew') slot.crew.push(user.id);
    if (user.role === 'sales' && !slot.sales) slot.sales = user.id;
    if (user.role === 'measurer' && !slot.measurer) slot.measurer = user.id;
    byOrg.set(user.orgId, slot);
  }
  for (const slot of byOrg.values()) slot.crew.sort();
  return objects.map((object) => {
    const slot = object.orgId ? byOrg.get(object.orgId) : undefined;
    if (!slot) return object;
    const current = users.find((user) => user.id === object.assignedTo);
    let next: string | undefined;
    if (object.status === 'install' || object.status === 'closed') {
      if (current?.role === 'crew') return object;
      if (!slot.crew.length) return object;
      const index = [...String(object.id || '')].reduce((sum, char) => sum + char.charCodeAt(0), 0) % slot.crew.length;
      next = slot.crew[index];
    } else if (object.status === 'quote_sent') {
      if (current?.role === 'sales') return object;
      next = slot.sales;
    } else if (object.status === 'measured') {
      if (current?.role === 'measurer') return object;
      next = slot.measurer;
    } else {
      return object;
    }
    if (!next || next === object.assignedTo) return object;
    return { ...object, assignedTo: next };
  });
}

export function buildLocalDemoObjects(): JobObject[] {
  const moscow = SPECS_A.map((s) =>
    makeObject(s, 'org_demo', 'Москва', 'u_partner1', 'u_exec1', s.id === 'obj_a04' ? 'u_crew1b' : 'u_crew1', 'u_sales1'),
  );
  return [
    ...moscow,
    ...SPECS_B.map((s) =>
      makeObject(s, 'org_demo_spb', 'Санкт-Петербург', 'u_partner2', 'u_exec2', 'u_crew2', 'u_sales2'),
    ),
  ];
}

export type LocalAnalyticsEvent = {
  id: string;
  at: string;
  orgId: string | null;
  userId: string | null;
  login: string;
  role: string;
  companyName: string;
  city?: string;
  tool: 'problemomer' | 'calculator' | 'cabinet';
  action: 'login' | 'open' | 'result' | 'pdf' | 'share' | 'calc_done' | 'schema';
  schema?: number;
  object?: Record<string, unknown> | null;
};

export function buildLocalDemoAnalytics(): LocalAnalyticsEvent[] {
  const events: LocalAnalyticsEvent[] = [];
  const orgs = [
    {
      orgId: 'org_demo',
      companyName: 'Потолки Столицы',
      city: 'Москва',
      owner: { id: 'u_partner1', login: 'partner1', role: 'owner' },
      sales: { id: 'u_sales1', login: 'sales1', role: 'sales' },
      measurer: { id: 'u_exec1', login: 'exec1', role: 'measurer' },
      crew: { id: 'u_crew1', login: 'crew1', role: 'crew' },
    },
    {
      orgId: 'org_demo_spb',
      companyName: 'Северный Потолок',
      city: 'Санкт-Петербург',
      owner: { id: 'u_partner2', login: 'partner2', role: 'owner' },
      sales: { id: 'u_sales2', login: 'sales2', role: 'sales' },
      measurer: { id: 'u_exec2', login: 'exec2', role: 'measurer' },
      crew: { id: 'u_crew2', login: 'crew2', role: 'crew' },
    },
  ];

  for (let day = DEMO_HISTORY_DAYS - 1; day >= 0; day -= 1) {
    if (!includeDemoDay(day)) continue;
    const isWeekend = day % 7 === 5 || day % 7 === 6;
    const intensity = isWeekend ? 0.35 : 1;

    for (const org of orgs) {
      for (const u of [org.owner, org.sales, org.measurer, org.crew]) {
        if (u.role !== 'owner' && (day + u.login.length) % 5 === 0) continue;
        if (u.role === 'owner' && day % 3 !== 0) continue;
        events.push({
          id: `ev_login_${org.orgId}_${day}_${u.login}`,
          at: analyticsAt(day),
          orgId: org.orgId,
          userId: u.id,
          login: u.login,
          role: u.role,
          companyName: org.companyName,
          city: org.city,
          tool: 'cabinet',
          action: 'login',
        });
      }

      const opens = Math.round((isWeekend ? 1 : 3) * intensity);
      for (let i = 0; i < opens; i += 1) {
        const u = i % 2 === 0 ? org.measurer : org.sales;
        events.push({
          id: `ev_open_${org.orgId}_${day}_${i}`,
          at: analyticsAt(day),
          orgId: org.orgId,
          userId: u.id,
          login: u.login,
          role: u.role,
          companyName: org.companyName,
          city: org.city,
          tool: i % 3 === 0 ? 'calculator' : 'problemomer',
          action: 'open',
        });
      }

      const results = Math.round((isWeekend ? 1 : 2 + (day % 2)) * intensity);
      for (let i = 0; i < results; i += 1) {
        const u = i % 2 === 0 ? org.measurer : org.sales;
        const area = 12 + ((day + i) % 18);
        const object = {
          roomType: pick(ROOM_TYPES, day + i),
          areaM2: area,
          houseType: pick(HOUSE_TYPES, day + i * 2),
          objectStage: pick(STAGES, day + i),
          classBefore: pick(DEMO_CLASS_PAIRS, day)[0],
          classAfter: pick(DEMO_CLASS_PAIRS, day)[1],
          city: org.city,
          panels: Math.ceil(area / PANEL_AREA_M2),
        };
        events.push({
          id: `ev_result_${org.orgId}_${day}_${i}`,
          at: analyticsAt(day),
          orgId: org.orgId,
          userId: u.id,
          login: u.login,
          role: u.role,
          companyName: org.companyName,
          city: org.city,
          tool: 'problemomer',
          action: 'result',
          object,
        });
        if (i % 2 === 0) {
          events.push({
            id: `ev_pdf_${org.orgId}_${day}_${i}`,
            at: analyticsAt(day),
            orgId: org.orgId,
            userId: u.id,
            login: u.login,
            role: u.role,
            companyName: org.companyName,
            city: org.city,
            tool: 'problemomer',
            action: 'pdf',
            object,
          });
        }
      }

      const calcs = Math.round((isWeekend ? 1 : 2) * intensity);
      for (let i = 0; i < calcs; i += 1) {
        const area = 14 + ((day + i * 3) % 20);
        const object = {
          areaM2: area,
          panels: Math.ceil(area / PANEL_AREA_M2),
          mode: i % 2 === 0 ? 'area' : 'dims',
          city: org.city,
        };
        events.push({
          id: `ev_calc_${org.orgId}_${day}_${i}`,
          at: analyticsAt(day),
          orgId: org.orgId,
          userId: org.sales.id,
          login: org.sales.login,
          role: org.sales.role,
          companyName: org.companyName,
          city: org.city,
          tool: 'calculator',
          action: 'calc_done',
          object,
        });
      }
    }
  }

  events.push({
    id: 'ev_demo_history_schema',
    schema: DEMO_HISTORY_SCHEMA,
    at: analyticsAt(DEMO_HISTORY_DAYS - 1),
    orgId: 'org_demo',
    userId: 'u_partner1',
    login: 'partner1',
    role: 'owner',
    companyName: 'Потолки Столицы',
    city: 'Москва',
    tool: 'cabinet',
    action: 'schema',
  });

  return boostCapitalEvents(events.sort((a, b) => Date.parse(b.at) - Date.parse(a.at)));
}
