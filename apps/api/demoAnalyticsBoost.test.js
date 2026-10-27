import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildDemoAnalyticsEvents, buildDemoPlatform, extendDemoAnalyticsHistory } from './demoSeed.js';
import {
  applyCapitalDemoBoost,
  BOOST_RATIO,
  CAPITAL_COMPANY,
  companyMetrics,
  NORTH_COMPANY,
} from '../../packages/shared/demoAnalyticsBoost.js';

delete process.env.PARTNERS_BUCKET;
process.env.JWT_SECRET = randomBytes(32).toString('hex');
delete process.env.MATERIALS_BUCKET;

const METRICS = [
  'employees',
  'logins',
  'problemomerOpens',
  'problemomerResults',
  'calculatorOpens',
  'calculatorDone',
  'pdf',
  'shares',
  'areaM2',
  'panels',
];

function target(value) {
  return Math.round(Number(value) * BOOST_RATIO);
}

test('демо-история детерминирована и длиннее года', () => {
  const first = buildDemoAnalyticsEvents({ boostCapital: false });
  const second = buildDemoAnalyticsEvents({ boostCapital: false });
  assert.deepEqual(
    first.map((event) => event.id).sort(),
    second.map((event) => event.id).sort(),
  );
  const age = Date.now() - Math.min(...first.map((event) => Date.parse(event.at)));
  assert.ok(age > 300 * 24 * 60 * 60 * 1000, String(age));
  const results = (day) =>
    first.filter((event) => new RegExp(`^ev_result_org_demo_${day}_\\d+$`).test(event.id)).length;
  assert.ok(results(1) > results(5), `будний ${results(1)}, выходной ${results(5)}`);
  const recent = first.filter((event) => Date.now() - Date.parse(event.at) < 20 * 24 * 60 * 60 * 1000);
  const extended = extendDemoAnalyticsHistory(recent);
  const span =
    Math.max(...extended.map((event) => Date.parse(event.at))) -
    Math.min(...extended.map((event) => Date.parse(event.at)));
  assert.ok(span > 100 * 24 * 60 * 60 * 1000);
  assert.equal(extendDemoAnalyticsHistory(extended), extended);
});

test('редкий хвост без версии схемы всё равно дополняется до года', () => {
  const sparse = [
    {
      id: 'ev_login_org_demo_1_partner1',
      at: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString(),
      orgId: 'org_demo',
      action: 'login',
    },
    {
      id: 'ev_result_org_demo_0_0',
      at: new Date().toISOString(),
      orgId: 'org_demo',
      action: 'result',
      object: { areaM2: 10 },
    },
    {
      id: 'ae_user_kept',
      at: new Date().toISOString(),
      orgId: 'org_demo',
      userId: 'u_sales1',
      action: 'result',
      object: { areaM2: 3 },
    },
    { id: 'other_org', at: new Date().toISOString(), orgId: 'org_real', action: 'login' },
  ];
  const extended = extendDemoAnalyticsHistory(sparse);
  assert.ok(extended.length > 100);
  assert.equal(extended.find((event) => event.id === 'ev_demo_history_schema')?.schema, 3);
  assert.equal(extended.some((event) => event.id === 'ae_user_kept'), true);
  assert.equal(extended.some((event) => event.id === 'other_org'), true);
  const span =
    Math.max(...extended.map((event) => Date.parse(event.at))) -
    Math.min(...extended.map((event) => Date.parse(event.at)));
  assert.ok(span > 300 * 24 * 60 * 60 * 1000);
  assert.equal(extendDemoAnalyticsHistory(extended), extended);
});

test('маркер схемы на короткой пачке не мешает дополнению до года', () => {
  const short = [
    {
      id: 'ev_demo_history_schema',
      schema: 3,
      at: new Date().toISOString(),
      orgId: 'org_demo',
      action: 'schema',
    },
    {
      id: 'ev_result_org_demo_0_0',
      at: new Date().toISOString(),
      orgId: 'org_demo',
      action: 'result',
      object: { areaM2: 10 },
    },
    {
      id: 'ae_kept_short',
      at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      orgId: 'org_demo',
      userId: 'u_sales1',
      action: 'result',
      object: { areaM2: 4 },
    },
  ];
  const extended = extendDemoAnalyticsHistory(short);
  assert.notEqual(extended, short);
  assert.equal(extended.some((event) => event.id === 'ae_kept_short'), true);
  assert.ok(extended.length > short.length + 50);
  const stamps = extended
    .filter((event) => event.orgId === 'org_demo' && event.id !== 'ev_demo_history_schema')
    .map((event) => Date.parse(event.at));
  assert.ok(Math.max(...stamps) - Math.min(...stamps) > 300 * 24 * 60 * 60 * 1000);
  assert.equal(extendDemoAnalyticsHistory(extended), extended);
});

test('агрегаты Потолков Столицы в 1.3 раза выше Северного Потолка', () => {
  const platform = buildDemoPlatform({ withHashes: false });
  const events = buildDemoAnalyticsEvents();
  const north = companyMetrics(platform, events, NORTH_COMPANY);
  const capital = companyMetrics(platform, events, CAPITAL_COMPANY);
  for (const key of METRICS) {
    assert.equal(
      capital[key],
      target(north[key]),
      `${key}: столица ${capital[key]}, север ${north[key]}, цель ${target(north[key])}`,
    );
    if (north[key] > 0) {
      const ratio = capital[key] / north[key];
      assert.ok(ratio > 1.2 && ratio < 1.45, `${key} ratio ${ratio}`);
    }
  }
  const capitalUsers = platform.users.filter(
    (user) => user.orgId === 'org_demo' && user.demo === true,
  );
  assert.equal(capitalUsers.length, 1);
  assert.equal(capitalUsers[0].loginDisabled, true);
  assert.equal(Object.prototype.hasOwnProperty.call(capitalUsers[0], 'password'), false);
  assert.match(capitalUsers[0].passwordHash, /^\$2[aby]\$/);
  const northDemo = platform.users.filter((user) => user.orgId === 'org_demo_spb' && user.demo);
  assert.equal(northDemo.length, 0);
  const demoLogins = events.filter(
    (event) => event.action === 'login' && event.login === capitalUsers[0].login,
  );
  assert.ok(demoLogins.length > 0);
});

test('повторное повышение ничего не добавляет и не трогает север', () => {
  const platform = buildDemoPlatform({ boostCapital: false, withHashes: false });
  const events = buildDemoAnalyticsEvents({ boostCapital: false });
  const first = applyCapitalDemoBoost(platform, events);
  const second = applyCapitalDemoBoost(first.platform, first.events);
  assert.equal(second.addedUsers.length, 0);
  assert.equal(second.addedEvents.length, 0);
  const northBefore = events.filter((event) => event.companyName === NORTH_COMPANY);
  const northAfter = first.events.filter((event) => event.companyName === NORTH_COMPANY);
  assert.deepEqual(northAfter, northBefore);
  assert.deepEqual(first.platform.objects, platform.objects);
  assert.equal(first.platform.orgs, platform.orgs);
});

test('dry-run на локальной копии одинаковых демо-данных печатает сводку и не пишет файлы', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'mf-capital-boost-'));
  const platformFile = path.join(dir, 'platform-v2.json');
  const eventsFile = path.join(dir, 'analytics-events.json');
  const platform = buildDemoPlatform({ boostCapital: false, withHashes: false });
  const events = buildDemoAnalyticsEvents({ boostCapital: false });
  writeFileSync(platformFile, JSON.stringify(platform));
  writeFileSync(eventsFile, JSON.stringify(events));
  const beforePlatform = readFileSync(platformFile);
  const beforeEvents = readFileSync(eventsFile);
  const script = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../scripts/boost-capital-analytics.mjs',
  );
  const run = spawnSync(
    process.execPath,
    [
      script,
      '--dry-run',
      '--platform',
      platformFile,
      '--events',
      eventsFile,
    ],
    { encoding: 'utf8' },
  );
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /Потолки Столицы/);
  assert.match(run.stdout, /Северный Потолок/);
  assert.match(run.stdout, /dry-run/);
  for (const label of ['Сотрудники', 'Входы', 'Проблемомер', 'Калькулятор', 'PDF', 'Отправки', 'Площадь', 'Панели']) {
    assert.match(run.stdout, new RegExp(label));
  }
  assert.equal(run.stdout.includes('passwordHash'), false);
  assert.equal(run.stdout.includes('$2'), false);
  assert.deepEqual(readFileSync(platformFile), beforePlatform);
  assert.deepEqual(readFileSync(eventsFile), beforeEvents);

  const write = spawnSync(
    process.execPath,
    [script, '--platform', platformFile, '--events', eventsFile],
    { encoding: 'utf8' },
  );
  assert.equal(write.status, 0, write.stderr);
  const storedPlatform = JSON.parse(readFileSync(platformFile, 'utf8'));
  const storedEvents = JSON.parse(readFileSync(eventsFile, 'utf8'));
  const north = companyMetrics(storedPlatform, storedEvents, NORTH_COMPANY);
  const capital = companyMetrics(storedPlatform, storedEvents, CAPITAL_COMPANY);
  for (const key of METRICS) {
    assert.equal(capital[key], target(north[key]), key);
  }
  assert.deepEqual(storedPlatform.objects, platform.objects);
  const again = spawnSync(
    process.execPath,
    [script, '--dry-run', '--platform', platformFile, '--events', eventsFile],
    { encoding: 'utf8' },
  );
  assert.equal(again.status, 0, again.stderr);
  assert.match(again.stdout, /Событий добавить: 0/);
  assert.match(again.stdout, /Сотрудников добавить: 0/);
  rmSync(dir, { recursive: true, force: true });
});

test('демо-сотрудник Потолков Столицы не может войти', async () => {
  const { handler, resetPlatformMemoryForTests } = await import(
    pathToFileURL(path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'index.js')).href
  );
  resetPlatformMemoryForTests();
  const response = await handler({
    httpMethod: 'POST',
    path: '/auth/login',
    headers: {},
    body: JSON.stringify({ login: 'demo-capital-1', password: 'not-a-password' }),
  });
  assert.equal(response.statusCode, 401);
  const owner = await handler({
    httpMethod: 'POST',
    path: '/auth/login',
    headers: {},
    body: JSON.stringify({ login: 'partner1', password: 'demo1234' }),
  });
  assert.equal(owner.statusCode, 200, owner.body);
  assert.equal(JSON.parse(owner.body).user.org.companyName, CAPITAL_COMPANY);
});
