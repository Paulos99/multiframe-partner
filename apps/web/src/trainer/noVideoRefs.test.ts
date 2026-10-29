/** Продавец говорит клиенту факты, а не «в видео сказано»: ссылок на видео нет ни в репликах, ни в разборе. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readJson } from './testContent';

const FILES = ['objections.json', 'scenarios.json', 'quiz.json', 'scoring.json'];
/** Поля-источники и служебные данные: здесь видео называть можно (подпись «Источник»), в остальном нельзя. */
const SOURCE_KEYS = new Set(['sourceQuotes', 'videos', 'showMaterial', 'exceptIfSentenceMatches']);
const BAD = /видео|ролик/i;

function walk(node: unknown, path: string, out: { path: string; text: string }[]): void {
  if (typeof node === 'string') {
    if (BAD.test(node)) out.push({ path, text: node });
  } else if (Array.isArray(node)) {
    node.forEach((v, i) => walk(v, `${path}[${i}]`, out));
  } else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) if (!SOURCE_KEYS.has(k)) walk(v, `${path}.${k}`, out);
  }
}

test('в репликах продавца, вариантах, эталонах, разборе и подсказках нет слов «видео» и «ролик»', () => {
  const found: { path: string; text: string }[] = [];
  for (const f of FILES) walk(readJson(f), f, found);
  assert.deepEqual(found.map((x) => `${x.path}: ${x.text.slice(0, 80)}`), []);
});

test('проверка ловит ссылку на видео', () => {
  const found: { path: string; text: string }[] = [];
  walk({ choices: [{ explanation: 'В видео сказано: классические системы требуют…' }], sourceQuotes: [{ quote: 'в видео' }] }, 'x', found);
  assert.equal(found.length, 1);
});

type Opt = { id: string; text: string; correct: boolean; explanation: string };
const allOptions = (): Opt[] => {
  const ob = readJson<{ objections: { choices: Record<string, { options: Opt[] }> }[] }>('objections.json');
  return ob.objections.flatMap((o) => [...o.choices.beat1.options, ...o.choices.beat2.options]);
};

test('верные ответы опираются на Проблемомер там, где это уместно, и не обещают тишину или точные дБ', () => {
  const opts = allOptions();
  const withTool = opts.filter((o) => o.correct && /Проблемомер/.test(o.text));
  assert.ok(withTool.length >= 6, `верных ответов с Проблемомером: ${withTool.length}`);
  assert.ok(withTool.length <= 14, 'Проблемомер не вставлен в каждый ответ');
  for (const o of withTool) {
    assert.ok(o.explanation.length > 40, o.id);
    assert.ok(!/гарантир|будет полная тишина|шумов не будет|\d+\s*дБ/i.test(o.text.replace(/(зависит|не обещ)[^.]*\./gi, '')), `обещание в ${o.id}`);
  }
});
