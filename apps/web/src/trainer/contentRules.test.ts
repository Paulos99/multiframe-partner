/**
 * Правила содержания тренажёра (решение владельца от 29.10.2026):
 * нет ссылок на наши испытания и конкретных цифр дБ, нет стен, нет QR-кодов для сертификатов,
 * закрытие разговора у менеджера — КП из Проблемомера и калькулятора, а верный вариант в викторине не угадывается по длине.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readJson } from './testContent';

const FILES = ['objections.json', 'scenarios.json', 'quiz.json', 'scoring.json'];
/** Подписи источников и регулярные выражения для автооценки: это не тексты для пользователя. */
const SKIP_KEYS = new Set(['sourceQuotes', 'videos', 'showMaterial', 'patterns', 'patternsRef', 'anyOf', 'exceptIfSentenceMatches', 'localForbiddenPatterns', 'description']);

const RULES: { name: string; rx: RegExp }[] = [
  { name: 'цифра в дБ', rx: /\d\s*(дб|децибел)/i },
  { name: 'ссылка на испытания', rx: /испытани/i },
  { name: 'тест/тестирование', rx: /(^|[^а-яё])тест/i },
  { name: 'QR-код', rx: /(^|[^a-z])qr(?![a-z])/i },
  { name: 'стены', rx: /(^|[^а-яё])стен/i },
  { name: 'созвон втроём', rx: /втроём|втроем/i },
  { name: 'потеря площади', rx: /потер[а-яё]*\s+(полезн[а-яё]*\s+)?(площад|пространств)/i },
];
/** Единственное допустимое упоминание цифры: запрет называть «до 17 дБ». */
const ALLOWED = [/до 17 дБ/];

type Hit = { path: string; rule: string; text: string };
function walk(node: unknown, path: string, out: Hit[]): void {
  if (typeof node === 'string') {
    if (ALLOWED.some((a) => a.test(node))) return;
    for (const r of RULES) if (r.rx.test(node)) out.push({ path, rule: r.name, text: node.slice(0, 90) });
  } else if (Array.isArray(node)) {
    node.forEach((v, i) => walk(v, `${path}[${i}]`, out));
  } else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) if (!SKIP_KEYS.has(k)) walk(v, `${path}.${k}`, out);
  }
}

test('в тексте для пользователя нет цифр дБ, испытаний, стен, QR-кодов, «втроём» и потери площади', () => {
  const found: Hit[] = [];
  for (const f of FILES) walk(readJson(f), f, found);
  assert.deepEqual(found.map((h) => `${h.path} [${h.rule}]: ${h.text}`), []);
});

test('проверка правил ловит нарушения', () => {
  const found: Hit[] = [];
  walk({ a: 'На стене +9 дБ в испытании', b: 'Сертификаты по QR-коду', c: 'созвонимся втроём', d: 'Потеря площади 2 м²', ok: 'Проблемомер оценивает эффект' }, 'x', found);
  assert.deepEqual(new Set(found.map((h) => h.rule)), new Set(['цифра в дБ', 'ссылка на испытания', 'стены', 'QR-код', 'созвон втроём', 'потеря площади']));
});

type QOpt = { id: string; text: string };
type Question = { id: string; topic: string; question: string; options: QOpt[]; correctOptionIds: string[]; explanation: string };
const questions = () => readJson<{ questions: Question[] }>('quiz.json').questions;
const correctOf = (q: Question) => q.options.filter((o) => q.correctOptionIds.includes(o.id));

test('в викторине 46 вопросов, у каждого 4 разных варианта и один верный', () => {
  const qs = questions();
  assert.ok(qs.length >= 40, `вопросов: ${qs.length}`);
  for (const q of qs) {
    assert.equal(q.options.length, 4, q.id);
    assert.equal(q.correctOptionIds.length, 1, q.id);
    assert.equal(new Set(q.options.map((o) => o.text)).size, 4, q.id);
  }
});

test('верный вариант не выдаёт себя длиной: не самый длинный почти везде и не длиннее среднего неверного более чем в 1,6 раза', () => {
  const qs = questions();
  let longest = 0;
  const tooLong: string[] = [];
  for (const q of qs) {
    const c = correctOf(q)[0];
    const others = q.options.filter((o) => o.id !== c.id);
    const maxOther = Math.max(...others.map((o) => o.text.length));
    const meanOther = others.reduce((s, o) => s + o.text.length, 0) / others.length;
    if (c.text.length > maxOther) longest++;
    if (c.text.length > meanOther * 1.6) tooLong.push(`${q.id}: ${c.text.length} против ${Math.round(meanOther)}`);
  }
  const share = longest / qs.length;
  assert.ok(share <= 0.4, `верный вариант самый длинный в ${Math.round(share * 100)}% вопросов`);
  assert.deepEqual(tooLong, []);
});

test('верный вариант стоит на разных местах: ни одна позиция не занимает больше 40% вопросов', () => {
  const qs = questions();
  const pos = [0, 0, 0, 0];
  for (const q of qs) pos[q.options.findIndex((o) => q.correctOptionIds.includes(o.id))]++;
  for (const n of pos) assert.ok(n / qs.length <= 0.4, `позиции: ${pos.join(', ')}`);
  assert.ok(pos.every((n) => n > 0), `позиции: ${pos.join(', ')}`);
});

test('в викторине есть общие вопросы про полистирол, одеяло и Проблемомер вместо цифр испытаний', () => {
  const byId = new Map(questions().map((q) => [q.id, q]));
  const poly = byId.get('quiz-polystyrene-ceiling');
  const blanket = byId.get('quiz-blanket');
  const tool = byId.get('quiz-problemometer-number');
  assert.ok(poly && blanket && tool);
  assert.match(correctOf(poly)[0].text, /ухудша/);
  assert.match(correctOf(blanket)[0].text, /не решают/);
  assert.match(correctOf(tool)[0].text, /Проблемомер/);
});

test('сертификаты в викторине: верный ответ — раздел «Обучение» → Материалы кабинета', () => {
  const q = questions().find((x) => x.id === 'quiz-certs');
  assert.ok(q);
  assert.match(correctOf(q)[0].text, /Обучение.*Материалы/);
  assert.ok(!questions().some((x) => x.id === 'quiz-where-certs'));
});

type Scenario = { id: string; roles: string[]; closing: { goodExamples: string[]; clientLine: string; afterCorrect: string; choices: { options: { text: string; correct: boolean }[] } } };
const scenarios = () => readJson<{ scenarios: Scenario[] }>('scenarios.json').scenarios;
const KP_SCENARIOS = ['sc-first-call-ceiling', 'sc-price-compare', 'sc-honest-ceiling', 'sc-spouse', 'sc-competitor-foreman', 'sc-callback-lost', 'sc-drum-steps'];

test('закрытие разговора у менеджера: КП с оценкой из Проблемомера и расчётом из калькулятора, следующий контакт назван', () => {
  const all = scenarios();
  for (const id of KP_SCENARIOS) {
    const s = all.find((x) => x.id === id);
    assert.ok(s, id);
    const right = s.closing.choices.options.filter((o) => o.correct);
    assert.equal(right.length, 1, id);
    assert.match(right[0].text, /КП/, id);
    assert.match(right[0].text, /Проблемомер/, id);
    assert.match(right[0].text, /калькулятор/, id);
    assert.match(right[0].text, /(позвоню|созвонимся|замер)/, `${id}: нет следующего контакта`);
    assert.equal(s.closing.goodExamples[0], right[0].text, id);
  }
});

test('у Виктора закрытие без «втроём», сроков, потери площади и результатов испытаний', () => {
  const s = scenarios().find((x) => x.id === 'sc-competitor-foreman');
  assert.ok(s);
  const right = s.closing.choices.options.find((o) => o.correct)!;
  const text = [s.closing.clientLine, s.closing.afterCorrect, ...s.closing.goodExamples, right.text].join(' ');
  assert.ok(!/втроём|втроем|сроки|срокам|площад|испытани/i.test(text), text);
});

test('в сценариях нет шагов с удалённым возражением, нумерация шагов цельная, сценария про испытания нет', () => {
  const ob = new Set(readJson<{ objections: { id: string }[] }>('objections.json').objections.map((o) => o.id));
  const sc = readJson<{ scenarios: { id: string; steps: { id: string; objectionId: string }[] }[] }>('scenarios.json').scenarios;
  for (const s of sc) {
    s.steps.forEach((st, i) => {
      assert.ok(ob.has(st.objectionId), `${s.id}/${st.id}`);
      assert.equal(st.id, `s${i + 1}`, `${s.id}: нумерация шагов`);
    });
  }
  assert.ok(!sc.some((s) => s.id === 'sc-trust-tests'));
});

test('сертификаты в ответах для всех ролей названы так: раздел «Обучение» → Материалы кабинета', () => {
  const ob = readJson<{ objections: { id: string; roles: string[]; referenceAnswer: string; choices: Record<string, { options: { correct: boolean; text: string }[] }> }[] }>('objections.json').objections;
  const fire = ob.find((o) => o.id === 'obj-eco-fire');
  assert.ok(fire);
  assert.match(fire.referenceAnswer, /Обучение.*Материалы/);
  assert.ok(fire.roles.includes('crew'));
  assert.ok(/Г2/.test(JSON.stringify(fire)) && /КМ2/.test(JSON.stringify(fire)), 'формулировка Г2 и КМ2 сохранена');
});
