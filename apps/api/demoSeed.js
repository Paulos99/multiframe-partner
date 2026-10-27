/**
 * Full demo dataset for leadership pitch: two ceiling partners + ~30 days of work.
 * Used by defaultPlatform() and POST /admin/demo/reset.
 * «Потолки Столицы» получают отдельные демо-события и одного сотрудника без входа,
 * чтобы агрегаты были round(Северный Потолок × 1.3).
 */
import bcrypt from 'bcryptjs';
import { boostCapitalEvents, boostCapitalStaff } from '../../packages/shared/demoAnalyticsBoost.js';
import { sealDisabledDemoUsers } from './sealDemoUsers.js';

const OFFICIAL_PANEL = 2396;
const OFFICIAL_M2 = 5990;
const DEFAULT_INSTALL = 1500;
const DEFAULT_DOWEL = 25;
const PANEL_AREA = 0.75 * 0.55;

export const DEMO_ACCOUNTS = [
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

/** Реальное «сейчас» минус n суток. Час — из Date.now(), без сдвига пояса. */
function daysAgo(n, _hour, _minute) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
}

/** Полдень локального дня: повторная сборка в те же сутки даёт те же отметки. */
function analyticsAt(day) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - day);
  return date.toISOString();
}

export const DEMO_HISTORY_SCHEMA = 3;

const DEMO_PEOPLE = {
  u_partner1: { login: 'partner1', name: 'Владелец · Потолки Столицы' },
  u_sales1: { login: 'sales1', name: 'Менеджер · Потолки Столицы' },
  u_measurer1: { login: 'exec1', name: 'Замерщик · Потолки Столицы' },
  u_crew1: { login: 'crew1', name: 'Монтажник · Потолки Столицы' },
  u_partner2: { login: 'partner2', name: 'Владелец · Северный Потолок' },
  u_sales2: { login: 'sales2', name: 'Менеджер · Северный Потолок' },
  u_measurer2: { login: 'exec2', name: 'Замерщик · Северный Потолок' },
  u_crew2: { login: 'crew2', name: 'Монтажник · Северный Потолок' },
};

function historyStamp(userId, at, action, detail) {
  const person = DEMO_PEOPLE[userId] || { login: 'system', name: 'Сотрудник' };
  return { at, userId, login: person.login, authorName: person.name, action, detail };
}

function estimate(areaM2) {
  const panels = Math.ceil(areaM2 / PANEL_AREA);
  const dowels = Math.ceil(panels * 2 * 1.15);
  const panelsCost = panels * OFFICIAL_PANEL;
  const installCost = Math.round(areaM2 * DEFAULT_INSTALL);
  const dowelsCost = Math.round(dowels * DEFAULT_DOWEL);
  return {
    panels,
    dowels,
    panelsCost,
    installCost,
    dowelsCost,
    totalCost: panelsCost + installCost + dowelsCost,
  };
}

function orgSettings(companyName, city) {
  return {
    companyName,
    city,
    panelPriceRub: OFFICIAL_PANEL,
    pricePerM2: OFFICIAL_M2,
    installPricePerM2: DEFAULT_INSTALL,
    dowelsPerPanel: 2,
    dowelPriceRub: DEFAULT_DOWEL,
  };
}

const ROOM_TYPES = ['living', 'bedroom', 'kids', 'kitchen', 'office'];
const HOUSE_TYPES = ['panel', 'block', 'brick', 'monolith'];
const STAGES = ['newbuild', 'renovation', 'occupied'];
/**
 * Demo «было → с MultiFrame» pairs. Only transitions the problem meter can really
 * produce (the ceiling never lowers the class). Mirrors apps/web/src/partner/demoSeed.ts.
 * Before: classBefore/classAfter rotated the same list with an offset of 2, which
 * produced impossible pairs like «А → В» and «Б → Дискомфорт» in analytics.
 */
export const DEMO_CLASS_PAIRS = [
  ['below', 'V'],
  ['V', 'B'],
  ['below', 'V'],
  ['B', 'A'],
];

function pick(arr, i) {
  return arr[i % arr.length];
}

function makeObject(spec) {
  const {
    id,
    orgId,
    createdBy,
    assignedTo,
    status,
    clientName,
    clientPhone,
    address,
    city,
    areaM2,
    dayOffset,
    roomType,
    houseType,
    objectStage,
  } = spec;
  const createdAt = daysAgo(dayOffset, 9, 30);
  const quoteAt = daysAgo(Math.max(0, dayOffset - 3), 14, 0);
  const installAt = daysAgo(Math.max(0, dayOffset - 10), 10, 0);
  const closedAt = daysAgo(Math.max(0, dayOffset - 14), 16, 0);
  const quoteAuthor = orgId === 'org_demo_spb' ? 'u_sales2' : 'u_sales1';
  const moveAuthor = orgId === 'org_demo_spb' ? 'u_partner2' : 'u_partner1';
  const est = estimate(areaM2);
  const classBefore = pick(DEMO_CLASS_PAIRS, dayOffset)[0];
  const classAfter = pick(DEMO_CLASS_PAIRS, dayOffset)[1];
  const history = [historyStamp(createdBy, createdAt, 'create', 'measured')];
  let updatedAt = createdAt;
  if (['quote_sent', 'install', 'closed'].includes(status)) {
    history.unshift(historyStamp(quoteAuthor, quoteAt, 'status', 'measured→quote_sent'));
    updatedAt = quoteAt;
  }
  if (['install', 'closed'].includes(status)) {
    history.unshift(historyStamp(moveAuthor, installAt, 'status', 'quote_sent→install'));
    updatedAt = installAt;
  }
  if (status === 'closed') {
    history.unshift(historyStamp(moveAuthor, closedAt, 'status', 'install→closed'));
    updatedAt = closedAt;
  }
  return {
    id,
    orgId,
    createdAt,
    updatedAt,
    createdBy,
    assignedTo: assignedTo || null,
    status,
    clientName,
    clientPhone,
    address,
    city,
    room: {
      roomType,
      areaM2,
      houseType,
      objectStage,
      classBefore: `${classBefore}`,
      classAfter: `${classAfter}`,
      answers: { roomType, ceilingAreaM2: areaM2, houseType, objectStage },
    },
    estimate: est,
    clientSummary: `${clientName} · ${areaM2} м² · ${address}`,
    history,
  };
}

const OBJECT_SPECS_A = [
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

const OBJECT_SPECS_B = [
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

function buildObjects() {
  const mapSpec = (spec, orgId, city, creator, measurer, sales, crew) => {
    let assignedTo = null;
    if (['install', 'closed'].includes(spec.status)) assignedTo = crew;
    else if (spec.status === 'measured') assignedTo = measurer;
    else if (spec.status === 'quote_sent') assignedTo = sales;
    // draft: unassigned — видит менеджер (старое objectVisibleTo: !assignedTo)
    return makeObject({
      id: spec.id,
      orgId,
      createdBy: spec.status === 'measured' ? measurer : creator,
      assignedTo,
      status: spec.status,
      clientName: spec.clientName,
      clientPhone: spec.phone,
      address: spec.address,
      city,
      areaM2: spec.area,
      dayOffset: spec.day,
      roomType: pick(ROOM_TYPES, spec.rt),
      houseType: pick(HOUSE_TYPES, spec.ht),
      objectStage: pick(STAGES, spec.st),
    });
  };

  return [
    ...OBJECT_SPECS_A.map((s) =>
      mapSpec(s, 'org_demo', 'Москва', 'u_partner1', 'u_measurer1', 'u_sales1', 'u_crew1'),
    ),
    ...OBJECT_SPECS_B.map((s) =>
      mapSpec(s, 'org_demo_spb', 'Санкт-Петербург', 'u_partner2', 'u_measurer2', 'u_sales2', 'u_crew2'),
    ),
  ];
}

/**
 * @param {{ withHashes?: boolean }} opts
 * withHashes=true for API (bcrypt); false returns plaintext password field for localStore shape helpers.
 */
export function buildDemoPlatform(opts = {}) {
  const withHashes = opts.withHashes !== false;
  const now = new Date().toISOString();
  const adminHash = withHashes ? bcrypt.hashSync('admin1234', 10) : null;
  const ownerHash = withHashes ? bcrypt.hashSync('demo1234', 10) : null;
  const staffHash = withHashes ? bcrypt.hashSync('exec1234', 10) : null;

  const user = (row) => {
    if (withHashes) {
      const { password: _p, ...rest } = row;
      return {
        ...rest,
        passwordHash:
          row.role === 'admin' ? adminHash : row.role === 'owner' ? ownerHash : staffHash,
        createdAt: now,
      };
    }
    return { ...row, createdAt: now };
  };

  const users = [
    user({
      id: 'u_admin',
      login: 'admin',
      password: 'admin1234',
      role: 'admin',
      displayName: 'Администратор StP',
      orgId: null,
    }),
    user({
      id: 'u_partner1',
      login: 'partner1',
      password: 'demo1234',
      role: 'owner',
      displayName: 'Владелец · Потолки Столицы',
      orgId: 'org_demo',
    }),
    user({
      id: 'u_sales1',
      login: 'sales1',
      password: 'exec1234',
      role: 'sales',
      displayName: 'Менеджер · Потолки Столицы',
      orgId: 'org_demo',
    }),
    user({
      id: 'u_measurer1',
      login: 'exec1',
      password: 'exec1234',
      role: 'measurer',
      displayName: 'Замерщик · Потолки Столицы',
      orgId: 'org_demo',
    }),
    user({
      id: 'u_crew1',
      login: 'crew1',
      password: 'exec1234',
      role: 'crew',
      displayName: 'Монтажник · Потолки Столицы',
      orgId: 'org_demo',
    }),
    user({
      id: 'u_partner2',
      login: 'partner2',
      password: 'demo1234',
      role: 'owner',
      displayName: 'Владелец · Северный Потолок',
      orgId: 'org_demo_spb',
    }),
    user({
      id: 'u_sales2',
      login: 'sales2',
      password: 'exec1234',
      role: 'sales',
      displayName: 'Менеджер · Северный Потолок',
      orgId: 'org_demo_spb',
    }),
    user({
      id: 'u_measurer2',
      login: 'exec2',
      password: 'exec1234',
      role: 'measurer',
      displayName: 'Замерщик · Северный Потолок',
      orgId: 'org_demo_spb',
    }),
    user({
      id: 'u_crew2',
      login: 'crew2',
      password: 'exec1234',
      role: 'crew',
      displayName: 'Монтажник · Северный Потолок',
      orgId: 'org_demo_spb',
    }),
  ];

  const orgs = [
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

  const platform = {
    version: 2,
    users,
    orgs,
    objects: buildObjects(),
    activity: [
      {
        id: 'act_seed_1',
        at: daysAgo(40),
        orgId: null,
        userId: 'u_admin',
        login: 'admin',
        action: 'seed_demo',
        detail: 'Демо-сеть для показа руководству',
      },
    ],
  };
  if (opts.boostCapital === false) return platform;
  return sealDisabledDemoUsers(boostCapitalStaff(platform));
}

function pushEvent(list, e) {
  list.push({
    id: e.id,
    at: e.at,
    orgId: e.orgId,
    userId: e.userId,
    login: e.login,
    role: e.role,
    companyName: e.companyName,
    city: e.city,
    tool: e.tool,
    action: e.action,
    object: e.object || null,
  });
}

/** День отсчёта, а не день недели: одни и те же цифры в любой день календаря. */
const DEMO_HISTORY_DAYS = 371;

function includeDemoDay(day) {
  if (day < 28) return true;
  if (day < 100) return day % 4 === 0;
  return day % 14 === 0;
}

/** Год истории. Столица поднимается до round(север × 1.3). */
export function buildDemoAnalyticsEvents(opts = {}) {
  const events = [];
  const orgs = [
    {
      orgId: 'org_demo',
      companyName: 'Потолки Столицы',
      city: 'Москва',
      owner: { id: 'u_partner1', login: 'partner1', role: 'owner' },
      sales: { id: 'u_sales1', login: 'sales1', role: 'sales' },
      measurer: { id: 'u_measurer1', login: 'exec1', role: 'measurer' },
      crew: { id: 'u_crew1', login: 'crew1', role: 'crew' },
    },
    {
      orgId: 'org_demo_spb',
      companyName: 'Северный Потолок',
      city: 'Санкт-Петербург',
      owner: { id: 'u_partner2', login: 'partner2', role: 'owner' },
      sales: { id: 'u_sales2', login: 'sales2', role: 'sales' },
      measurer: { id: 'u_measurer2', login: 'exec2', role: 'measurer' },
      crew: { id: 'u_crew2', login: 'crew2', role: 'crew' },
    },
  ];

  let n = 0;
  for (let day = DEMO_HISTORY_DAYS - 1; day >= 0; day -= 1) {
    if (!includeDemoDay(day)) continue;
    const isWeekend = day % 7 === 5 || day % 7 === 6;
    const intensity = isWeekend ? 0.35 : 1;

    for (const org of orgs) {
      const staff = [org.owner, org.sales, org.measurer, org.crew];
      for (const u of staff) {
        if (u.role !== 'owner' && (day + u.login.length) % 3 === 0 && intensity < 1) continue;
        if (u.role !== 'owner' && (day + u.login.length) % 5 === 0) continue;
        if (u.role === 'owner' && day % 3 !== 0) continue;
        n += 1;
        pushEvent(events, {
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
        const tool = i % 3 === 0 ? 'calculator' : 'problemomer';
        n += 1;
        pushEvent(events, {
          id: `ev_open_${org.orgId}_${day}_${i}`,
          at: analyticsAt(day),
          orgId: org.orgId,
          userId: u.id,
          login: u.login,
          role: u.role,
          companyName: org.companyName,
          city: org.city,
          tool,
          action: 'open',
        });
      }

      const results = Math.round((isWeekend ? 1 : 2 + (day % 2)) * intensity);
      for (let i = 0; i < results; i += 1) {
        const u = i % 2 === 0 ? org.measurer : org.sales;
        const area = 12 + ((day + i) % 18);
        const roomType = pick(ROOM_TYPES, day + i);
        const houseType = pick(HOUSE_TYPES, day + i * 2);
        const objectStage = pick(STAGES, day + i);
        const classBefore = pick(DEMO_CLASS_PAIRS, day)[0];
        const classAfter = pick(DEMO_CLASS_PAIRS, day)[1];
        const object = {
          roomType,
          areaM2: area,
          houseType,
          objectStage,
          classBefore,
          classAfter,
          city: org.city,
          panels: Math.ceil(area / PANEL_AREA),
        };
        n += 1;
        pushEvent(events, {
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
          pushEvent(events, {
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
        if (i === 0 && day % 4 === 0) {
          pushEvent(events, {
            id: `ev_share_${org.orgId}_${day}_${i}`,
            at: analyticsAt(day),
            orgId: org.orgId,
            userId: u.id,
            login: u.login,
            role: u.role,
            companyName: org.companyName,
            city: org.city,
            tool: 'problemomer',
            action: 'share',
            object,
          });
        }
      }

      const calcs = Math.round((isWeekend ? 1 : 2) * intensity);
      for (let i = 0; i < calcs; i += 1) {
        const u = org.sales;
        const area = 14 + ((day + i * 3) % 20);
        const object = {
          areaM2: area,
          panels: Math.ceil(area / PANEL_AREA),
          mode: i % 2 === 0 ? 'area' : 'dims',
          city: org.city,
        };
        pushEvent(events, {
          id: `ev_calc_${org.orgId}_${day}_${i}`,
          at: analyticsAt(day),
          orgId: org.orgId,
          userId: u.id,
          login: u.login,
          role: u.role,
          companyName: org.companyName,
          city: org.city,
          tool: 'calculator',
          action: 'calc_done',
          object,
        });
        if (i === 0) {
          pushEvent(events, {
            id: `ev_calcpdf_${org.orgId}_${day}_${i}`,
            at: analyticsAt(day),
            orgId: org.orgId,
            userId: u.id,
            login: u.login,
            role: u.role,
            companyName: org.companyName,
            city: org.city,
            tool: 'calculator',
            action: 'pdf',
            object,
          });
        }
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
    object: null,
  });

  // Admin logins
  for (let day = DEMO_HISTORY_DAYS - 1; day >= 0; day -= 14) {
    pushEvent(events, {
      id: `ev_admin_login_${day}`,
      at: analyticsAt(day),
      orgId: null,
      userId: 'u_admin',
      login: 'admin',
      role: 'admin',
      companyName: 'StP',
      city: '',
      tool: 'cabinet',
      action: 'login',
    });
  }

  const sorted = events.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  if (opts.boostCapital === false) return sorted;
  const platform = buildDemoPlatform({ withHashes: false });
  const demoStaff = platform.users.filter((user) => user.demo && user.loginDisabled);
  return boostCapitalEvents(sorted, demoStaff, platform);
}

const DEMO_ORG_IDS = new Set(['org_demo', 'org_demo_spb']);
const SEED_EVENT_ID =
  /^(ev_(login|open|result|pdf|share|calc|calcpdf|admin)_|ev_boost_capital_)/;

const YEAR_SPAN_MS = 300 * 24 * 60 * 60 * 1000;

export function demoHistorySchema(events) {
  const list = Array.isArray(events) ? events : [];
  const marker = list.find((event) => event && event.id === 'ev_demo_history_schema');
  const schema = Number(marker?.schema);
  return Number.isFinite(schema) ? schema : 0;
}

function demoHistoryReady(events) {
  const list = Array.isArray(events) ? events : [];
  if (demoHistorySchema(list) < DEMO_HISTORY_SCHEMA) return false;
  const stamps = list
    .filter((event) => event && DEMO_ORG_IDS.has(event.orgId) && event.id !== 'ev_demo_history_schema')
    .map((event) => Date.parse(event.at))
    .filter((stamp) => !Number.isNaN(stamp));
  if (stamps.length < 2) return false;
  return Math.max(...stamps) - Math.min(...stamps) >= YEAR_SPAN_MS;
}

/**
 * Демо-история дополняется до года, пока события без маркера не покрывают год.
 * Маркер на короткой пачке не замораживает её. Готовая пачка возвращается как есть.
 */
export function extendDemoAnalyticsHistory(events) {
  const list = Array.isArray(events) ? events : [];
  if (demoHistoryReady(list)) return list;
  const demo = list.filter((event) => event && DEMO_ORG_IDS.has(event.orgId));
  if (!demo.length) return list;
  const fresh = buildDemoAnalyticsEvents();
  const freshIds = new Set(fresh.map((event) => event.id));
  const kept = list.filter((event) => {
    if (!event) return false;
    if (!DEMO_ORG_IDS.has(event.orgId)) return true;
    const id = String(event.id || '');
    if (id === 'ev_demo_history_schema') return false;
    if (SEED_EVENT_ID.test(id)) return false;
    return !freshIds.has(id);
  });
  return [...fresh, ...kept].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}
