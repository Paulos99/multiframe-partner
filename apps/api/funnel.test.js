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
  funnelPercents,
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
    const percents = funnelPercents(values);
    assert.equal(percents[0], '100%');
    let previousPercent = 100;
    for (let index = 0; index < values.length; index += 1) {
      if (index > 0) {
        assert.ok(
          values[index] <= values[index - 1],
          `этап ${values[index]} больше предыдущего ${values[index - 1]}`,
        );
      }
      const text = percents[index];
      if (index === 0) continue;
      if (values[0] === 0) {
        assert.equal(text, '—');
        continue;
      }
      const percent = Number(text.replace('%', ''));
      assert.equal(Number.isFinite(percent), true, text);
      assert.ok(percent <= 100, text);
      assert.ok(percent <= previousPercent, `${text} больше предыдущих ${previousPercent}%`);
      previousPercent = percent;
    }
  }
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
  ]) {
    assert.deepEqual(fromTypeScript.funnelPercents(counts), funnelPercents(counts));
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
      funnelPercents([
        funnel.problemomer.open,
        funnel.problemomer.result,
        funnel.problemomer.pdf,
        funnel.problemomer.share,
      ]),
      ['100%', '—', '—', '—'],
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
  const percents = funnelPercents(counts);
  // От предыдущего этапа PDF был бы 2/4 = 50%, шаринг 1/2 = 50%.
  // От всех открытий: 4/10, 2/10 и 1/10.
  assert.deepEqual(percents, ['100%', '40%', '20%', '10%']);
  assert.notEqual(percents[2], `${Math.round((2 / 4) * 100)}%`);
  assert.equal(percents[0], '100%');
  for (let index = 1; index < counts.length; index += 1) {
    assert.ok(counts[index] <= counts[index - 1]);
    assert.ok(Number(percents[index].replace('%', '')) <= Number(percents[index - 1].replace('%', '')));
    assert.ok(Number(percents[index].replace('%', '')) <= 100);
  }
  assert.equal(funnelPercents([0, 0, 0, 0])[0], '100%');
  const ui = readFileSync(
    new URL('../web/src/partner/AnalyticsDashboard.tsx', import.meta.url),
    'utf8',
  );
  assert.match(ui, /% от всех открытий/);
  assert.equal(ui.includes('Процент от открытий'), false);
  assert.match(ui, /funnelPercents\(/);
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
