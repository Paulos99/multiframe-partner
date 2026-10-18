import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import {
  computeAnalyticsFunnel,
  funnelPassKey,
  funnelStopPercents,
  funnelStepPercent,
} from '../../packages/shared/funnel.js';

const fromTypeScript = await loadTypeScriptFunnel();

function ev(partial) {
  return {
    id: partial.id || `e_${partial.action || 'x'}_${partial.sessionId || partial.at || 'n'}`,
    at: partial.at || '2026-10-18T12:00:00.000Z',
    orgId: partial.orgId === undefined ? 'org' : partial.orgId,
    userId: partial.userId === undefined ? 'user' : partial.userId,
    login: partial.login || 'login',
    tool: partial.tool,
    action: partial.action,
    sessionId: partial.sessionId,
  };
}

function assertAtMost100(funnel) {
  for (const steps of [funnel.problemomer, funnel.calculator]) {
    const values = Object.values(steps);
    for (let index = 1; index < values.length; index += 1) {
      assert.ok(
        values[index] <= values[index - 1],
        `этап ${values[index]} больше предыдущего ${values[index - 1]}`,
      );
    }
    assertStopsSum100(values);
  }
}

function assertStopsSum100(values) {
  const percents = funnelStopPercents(values);
  assert.equal(percents.length, values.length);
  if (!(values[0] > 0)) {
    assert.deepEqual(percents, values.map(() => '—'));
    return;
  }
  const numbers = percents.map((text) => Number(text.replace('%', '')));
  for (const n of numbers) assert.ok(Number.isInteger(n) && n >= 0 && n <= 100, String(n));
  assert.equal(numbers.reduce((sum, n) => sum + n, 0), 100, percents.join(' '));
}

function assertSameFunnel(events) {
  assert.deepEqual(
    fromTypeScript.computeAnalyticsFunnel(events),
    computeAnalyticsFunnel(events),
    'funnel.js разошёлся с funnel.ts',
  );
  for (const [part, whole] of [
    [0, 0],
    [10, 7],
    [6, 7],
    [1, 0],
  ]) {
    assert.equal(fromTypeScript.funnelStepPercent(part, whole), funnelStepPercent(part, whole));
  }
  for (const counts of [
    [0, 0, 0, 0],
    [10, 4, 2, 1],
    [7, 6, 0, 0],
    [23, 21, 10, 2],
    [5, 7, 3, 0],
  ]) {
    assert.deepEqual(fromTypeScript.funnelStopPercents(counts), funnelStopPercents(counts));
  }
}

test('повторные расчёты и PDF в одном проходе считаются один раз', () => {
  const events = [
    ev({ sessionId: 'tab-1', tool: 'problemomer', action: 'open' }),
    ev({ sessionId: 'tab-1', tool: 'problemomer', action: 'result', id: 'r1' }),
    ev({ sessionId: 'tab-1', tool: 'problemomer', action: 'result', id: 'r2' }),
    ev({ sessionId: 'tab-1', tool: 'problemomer', action: 'result', id: 'r3' }),
    ev({ sessionId: 'tab-1', tool: 'problemomer', action: 'pdf', id: 'p1' }),
    ev({ sessionId: 'tab-1', tool: 'problemomer', action: 'pdf', id: 'p2' }),
    ev({ sessionId: 'tab-1', tool: 'calculator', action: 'open' }),
    ev({ sessionId: 'tab-1', tool: 'calculator', action: 'calc_done', id: 'c1' }),
    ev({ sessionId: 'tab-1', tool: 'calculator', action: 'calc_done', id: 'c2' }),
    ev({ sessionId: 'tab-1', tool: 'calculator', action: 'calc_done', id: 'c3' }),
    ev({ sessionId: 'tab-1', tool: 'calculator', action: 'pdf', id: 'cp1' }),
    ev({ sessionId: 'tab-1', tool: 'calculator', action: 'pdf', id: 'cp2' }),
  ];
  const funnel = computeAnalyticsFunnel(events);
  assert.deepEqual(funnel.problemomer, { open: 1, result: 1, pdf: 1, share: 0 });
  assert.deepEqual(funnel.calculator, { open: 1, calcDone: 1, pdf: 1 });
  assert.equal(events.filter((e) => e.action === 'result').length, 3);
  assert.equal(events.filter((e) => e.action === 'pdf').length, 4);
  assert.equal(funnelStepPercent(funnel.problemomer.result, funnel.problemomer.open), '100%');
  assert.equal(funnelStepPercent(funnel.problemomer.share, funnel.problemomer.open), '0%');
  assertAtMost100(funnel);
  assertSameFunnel(events);
});

test('сырые 10 расчётов на 7 открытий давали 143%, по проходам не больше 100%', () => {
  const events = [];
  for (const id of ['s1', 's2', 's3', 's4']) {
    events.push(ev({ sessionId: id, tool: 'problemomer', action: 'open', id: `${id}-open` }));
    events.push(ev({ sessionId: id, tool: 'problemomer', action: 'result', id: `${id}-r1` }));
    events.push(ev({ sessionId: id, tool: 'problemomer', action: 'result', id: `${id}-r2` }));
  }
  for (const id of ['s5', 's6']) {
    events.push(ev({ sessionId: id, tool: 'problemomer', action: 'open', id: `${id}-open` }));
    events.push(ev({ sessionId: id, tool: 'problemomer', action: 'result', id: `${id}-r` }));
  }
  events.push(ev({ sessionId: 's7', tool: 'problemomer', action: 'open', id: 's7-open' }));

  const rawOpen = events.filter((e) => e.action === 'open').length;
  const rawResult = events.filter((e) => e.action === 'result').length;
  assert.equal(rawOpen, 7);
  assert.equal(rawResult, 10);
  assert.equal(Math.round((rawResult / rawOpen) * 100), 143);

  const funnel = computeAnalyticsFunnel(events);
  assert.deepEqual(funnel.problemomer, { open: 7, result: 6, pdf: 0, share: 0 });
  assert.equal(funnelStepPercent(funnel.problemomer.result, funnel.problemomer.open), '86%');
  assertAtMost100(funnel);
  assertSameFunnel(events);
});

test('проход без события open засчитывается с первого этапа', () => {
  const events = [
    ev({ sessionId: 'deep', tool: 'problemomer', action: 'pdf', id: 'pdf-1' }),
    ev({ sessionId: 'deep', tool: 'problemomer', action: 'result', id: 'res-1' }),
    ev({ sessionId: 'calc-deep', tool: 'calculator', action: 'pdf' }),
  ];
  const funnel = computeAnalyticsFunnel(events);
  assert.equal(events.filter((e) => e.action === 'open').length, 0);
  assert.deepEqual(funnel.problemomer, { open: 1, result: 1, pdf: 1, share: 0 });
  assert.deepEqual(funnel.calculator, { open: 1, calcDone: 1, pdf: 1 });
  assert.equal(funnelStepPercent(funnel.problemomer.pdf, funnel.problemomer.open), '100%');
  assertAtMost100(funnel);
  assertSameFunnel(events);
});

test('пустые данные не делят на ноль', () => {
  for (const events of [[], null, undefined]) {
    const funnel = computeAnalyticsFunnel(events);
    assert.deepEqual(funnel, {
      problemomer: { open: 0, result: 0, pdf: 0, share: 0 },
      calculator: { open: 0, calcDone: 0, pdf: 0 },
    });
    assert.deepEqual(
      funnelStopPercents([
        funnel.problemomer.open,
        funnel.problemomer.result,
        funnel.problemomer.pdf,
        funnel.problemomer.share,
      ]),
      ['—', '—', '—', '—'],
    );
    assert.equal(funnelStepPercent(1, 0), '—');
    assert.equal(funnelStepPercent(0, 0), '—');
    assertAtMost100(funnel);
    assertSameFunnel(events);
  }
});

test('без sessionId повторный день схлопывается, другой день и другая сессия — нет', () => {
  const sameDay = [
    ev({
      sessionId: null,
      userId: 'u1',
      tool: 'calculator',
      action: 'open',
      at: '2026-10-18T09:00:00.000Z',
    }),
    ev({
      sessionId: '',
      userId: 'u1',
      tool: 'calculator',
      action: 'calc_done',
      at: '2026-10-18T10:00:00.000Z',
      id: 'a',
    }),
    ev({
      sessionId: '  ',
      userId: 'u1',
      tool: 'calculator',
      action: 'calc_done',
      at: '2026-10-18T11:00:00.000Z',
      id: 'b',
    }),
    ev({
      userId: 'u1',
      tool: 'calculator',
      action: 'pdf',
      at: '2026-10-18T12:00:00.000Z',
      id: 'c',
    }),
    ev({
      userId: 'u1',
      tool: 'calculator',
      action: 'calc_done',
      at: '2026-10-19T12:00:00.000Z',
      id: 'next-day',
    }),
    ev({
      sessionId: 'other-tab',
      userId: 'u1',
      tool: 'calculator',
      action: 'calc_done',
      at: '2026-10-18T15:00:00.000Z',
      id: 'other',
    }),
  ];
  const funnel = computeAnalyticsFunnel(sameDay);
  assert.deepEqual(funnel.calculator, { open: 3, calcDone: 3, pdf: 1 });
  assert.equal(funnelPassKey(sameDay[0], 'calculator'), funnelPassKey(sameDay[3], 'calculator'));
  assert.notEqual(funnelPassKey(sameDay[0], 'calculator'), funnelPassKey(sameDay[4], 'calculator'));
  assert.notEqual(funnelPassKey(sameDay[0], 'calculator'), funnelPassKey(sameDay[5], 'calculator'));
  assertAtMost100(funnel);
  assertSameFunnel(sameDay);
});

test('поздний этап тянет за собой предыдущие, входы и чужой инструмент не входят', () => {
  const events = [
    ev({ sessionId: 'only-share', tool: 'problemomer', action: 'share' }),
    ev({ sessionId: 'only-share', tool: 'cabinet', action: 'login' }),
    ev({ sessionId: 'only-share', tool: 'problemomer', action: 'login' }),
    null,
    { tool: 'problemomer' },
  ];
  const funnel = computeAnalyticsFunnel(events);
  assert.deepEqual(funnel.problemomer, { open: 1, result: 1, pdf: 1, share: 1 });
  assert.deepEqual(funnel.calculator, { open: 0, calcDone: 0, pdf: 0 });
  assert.equal(funnelStepPercent(10, 7), '100%');
  assertAtMost100(funnel);
  assertSameFunnel(events);
});

test('каждый этап — доля от всех открытий, первый всегда 100%', () => {
  const events = [];
  for (let i = 0; i < 10; i += 1) {
    const id = `open-${i}`;
    events.push(ev({ sessionId: id, tool: 'problemomer', action: 'open', id: `${id}-open` }));
    if (i < 4) {
      events.push(ev({ sessionId: id, tool: 'problemomer', action: 'result', id: `${id}-result` }));
    }
    if (i < 2) {
      events.push(ev({ sessionId: id, tool: 'problemomer', action: 'pdf', id: `${id}-pdf` }));
    }
    if (i < 1) {
      events.push(ev({ sessionId: id, tool: 'problemomer', action: 'share', id: `${id}-share` }));
    }
  }
  const funnel = computeAnalyticsFunnel(events);
  assert.deepEqual(funnel.problemomer, { open: 10, result: 4, pdf: 2, share: 1 });
  const counts = [
    funnel.problemomer.open,
    funnel.problemomer.result,
    funnel.problemomer.pdf,
    funnel.problemomer.share,
  ];
  const percents = funnelStopPercents(counts);
  // Где остановились: только открыли 10−4 = 6, до расчёта 4−2 = 2, до PDF 2−1 = 1, поделился 1.
  assert.deepEqual(percents, ['60%', '20%', '10%', '10%']);
  assertStopsSum100(counts);
  assert.deepEqual(funnelStopPercents([0, 0, 0, 0]), ['—', '—', '—', '—']);
  const ui = readFileSync(
    new URL('../web/src/partner/AnalyticsDashboard.tsx', import.meta.url),
    'utf8',
  );
  assert.match(ui, /где остановились, в сумме 100%/);
  assert.equal(ui.includes('% от всех открытий'), false);
  assert.equal(ui.includes('Процент от открытий'), false);
  assert.match(ui, /funnelStopPercents\(/);
  assertSameFunnel(events);
});

test('сервер и локальный агрегат вызывают одну функцию воронки', () => {
  const api = readFileSync(new URL('./index.js', import.meta.url), 'utf8');
  const partner = readFileSync(new URL('../../packages/shared/partner.ts', import.meta.url), 'utf8');
  assert.match(api, /computeAnalyticsFunnel/);
  assert.match(partner, /return computeAnalyticsFunnel\(events\)/);
  assert.equal(api.includes("e.action === 'open'"), false);
});

async function loadTypeScriptFunnel() {
  const source = readFileSync(new URL('../../packages/shared/funnel.ts', import.meta.url), 'utf8');
  const js = stripTypeScriptTypes(source, { mode: 'transform' });
  const dir = mkdtempSync(join(tmpdir(), 'mf-funnel-'));
  const file = join(dir, 'funnel.mjs');
  writeFileSync(file, js);
  return import(pathToFileURL(file).href);
}

test('«где остановились»: 23/21/10/2 даёт ровно 100% методом наибольшего остатка', () => {
  // Точные доли: 2/23 = 8,70%, 11/23 = 47,83%, 8/23 = 34,78%, 2/23 = 8,70%.
  // 9 + 48 + 35 + 9 было бы 101%; лишний процент не добавляется, равный остаток отдаётся раннему этапу.
  assert.deepEqual(funnelStopPercents([23, 21, 10, 2]), ['9%', '48%', '35%', '8%']);
  assertStopsSum100([23, 21, 10, 2]);
  assert.deepEqual(funnelStopPercents([23, 21, 10]), ['9%', '48%', '43%']);
});

test('«где остановились»: невозрастание, без отрицательных долей', () => {
  // 7 расчётов при 5 открытиях выравниваются до 5: остановились 0, 2, 3, 0.
  assert.deepEqual(funnelStopPercents([5, 7, 3, 0]), ['0%', '40%', '60%', '0%']);
  assert.deepEqual(funnelStopPercents([3, 3, 3]), ['0%', '0%', '100%']);
  assert.deepEqual(funnelStopPercents([1, 0, 0]), ['100%', '0%', '0%']);
  for (const counts of [[7, 6, 0, 0], [3, 1, 1], [100, 33, 33, 1], [6, 5, 4, 3]]) assertStopsSum100(counts);
});
