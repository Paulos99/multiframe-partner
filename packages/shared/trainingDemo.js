/**
 * Демонстрационные данные обучения для демо-компаний («Потолки Столицы» и «Северный Потолок»).
 * Нужны, чтобы в аналитике было что показать без живых подходов. Данные считаются на лету из логина
 * и текущей даты, нигде не хранятся и в базу не пишутся. Настоящие подходы тех же логинов добавляются сверху.
 */
import { normalizeMaterialOpen, normalizeTrainingAttempt } from './trainingStats.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export const DEMO_TRAINING_ORGS = ['org_demo', 'org_demo_spb'];
export const isDemoTrainingOrg = (orgId) => DEMO_TRAINING_ORGS.includes(orgId);

/** Возражения и их темы отказа (из `objections.json`), на которых «ошибаются» демо-сотрудники. */
const OBJECTIONS = {
  price: [
    { id: 'obj-price-expensive', reason: 'price_too_high' },
    { id: 'obj-price-material-only', reason: 'price_too_high' },
  ],
  effect: [
    { id: 'obj-effect-guarantee', reason: 'doubt_effect' },
    { id: 'obj-effect-steps', reason: 'doubt_effect' },
  ],
  silence: [{ id: 'obj-effect-silence', reason: 'unrealistic_expectation' }],
  safety: [{ id: 'obj-eco-safe', reason: 'doubt_safety' }],
  time: [{ id: 'obj-time-long', reason: 'install_too_long' }],
  later: [{ id: 'obj-timing-later', reason: 'postpone_decision' }],
  need: [{ id: 'obj-need-not-bothering', reason: 'not_needed' }],
};

const ERRORS = ['vague', 'ignores_concern', 'false_promise', 'pressure'];

const MATERIALS = [
  { id: 'demo-mat-install', title: 'Монтаж панелей STP MultiFrame' },
  { id: 'demo-mat-tests', title: 'Испытания на звукоизоляцию' },
  { id: 'demo-mat-price', title: 'Как говорить с клиентом о цене' },
  { id: 'demo-mat-safety', title: 'Состав и безопасность материала' },
  { id: 'demo-mat-panels', title: 'Панели Wave и Flat' },
  { id: 'demo-mat-scheme', title: 'Схемы раскладки на потолке' },
];

/** Профиль по логину: сколько подходов, насколько уверенно, как давно, где ошибаются. */
const PROFILES = {
  sales1: { sets: 14, quiz: 2, base: 0.93, spread: 0.06, lastDays: 1, weak: ['price'], crit: ['value'], materials: 6 },
  exec1: { sets: 9, quiz: 1, base: 0.76, spread: 0.08, lastDays: 3, weak: ['effect', 'silence'], crit: ['honesty', 'objection'], materials: 3 },
  crew1: { sets: 5, quiz: 0, base: 0.58, spread: 0.12, lastDays: 9, weak: ['safety', 'time'], crit: ['listening', 'nextstep', 'honesty'], materials: 1 },
  sales2: { sets: 11, quiz: 2, base: 0.8, spread: 0.08, lastDays: 2, weak: ['price', 'later'], crit: ['value', 'nextstep'], materials: 4 },
  exec2: { sets: 4, quiz: 0, base: 0.6, spread: 0.1, lastDays: 24, weak: ['need'], crit: ['discovery'], materials: 0 },
};

function seeded(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return () => {
    h = (Math.imul(h ^ (h >>> 15), 2246822507) + 0x6d2b79f5) >>> 0;
    return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
  };
}

/** Подходы и открытия материалов демо-сотрудника. У логина без профиля данных нет. */
export function demoTrainingFor(login, nowMs = Date.now()) {
  const p = PROFILES[login];
  if (!p) return { attempts: [], materials: [] };
  const rnd = seeded(login);
  const pool = p.weak.flatMap((key) => OBJECTIONS[key]);
  const attempts = [];
  for (let i = 0; i < p.sets; i += 1) {
    const age = p.lastDays + Math.round((i * Math.max(2, 26 - p.lastDays)) / Math.max(1, p.sets));
    const at = nowMs - age * DAY_MS - Math.round(rnd() * 5) * 3600000;
    const share = Math.min(1, Math.max(0.25, p.base + (rnd() - 0.5) * 2 * p.spread));
    const count = [4, 8, 4][i % 3];
    const wrong = Math.round((1 - share) * count);
    const misses = Array.from({ length: wrong }, (_, k) => {
      const o = pool[(i + k) % pool.length];
      return { objectionId: o.id, reasonKey: o.reason, errorType: ERRORS[(i + k) % ERRORS.length], violates: p.crit[(i + k) % p.crit.length] };
    });
    const criteria = {};
    for (const id of ['discovery', 'listening', 'objection', 'value', 'honesty', 'nextstep']) {
      const v = misses.filter((m) => m.violates === id).length;
      criteria[id] = Math.max(1, 5 - 3 * v);
    }
    const role = i % 3 === 1 ? 'roleplay' : 'objection';
    attempts.push(
      normalizeTrainingAttempt(
        {
          id: `demo-${login}-${i}`,
          mode: role,
          scheme: 2,
          itemIds: [role === 'roleplay' ? 'demo-scenario' : pool[i % pool.length].id],
          startedAt: new Date(at - 240000).toISOString(),
          finishedAt: new Date(at).toISOString(),
          firstTryCorrect: Math.round((1 - wrong / count) * 1000) / 1000,
          count,
          total: Math.round(((1 - wrong / count) * 5) * 100) / 100,
          passed: 1 - wrong / count >= 0.75,
          criteria,
          misses,
        },
        nowMs,
      ),
    );
  }
  for (let i = 0; i < p.quiz; i += 1) {
    const at = nowMs - (p.lastDays + 4 + i * 6) * DAY_MS;
    const percent = Math.round((p.base * 100 + (rnd() - 0.5) * 20) * 10) / 10;
    attempts.push(
      normalizeTrainingAttempt(
        {
          id: `demo-${login}-q${i}`,
          mode: 'quiz',
          itemIds: ['demo-quiz'],
          startedAt: new Date(at - 300000).toISOString(),
          finishedAt: new Date(at).toISOString(),
          count: 10,
          quizPercent: Math.min(100, percent),
          total: Math.round(Math.min(100, percent) * 5) / 100,
          passed: percent >= 70,
          quizMisses: percent < 90 ? [{ questionId: 'quiz-demo-1', topic: i % 2 ? 'honesty' : 'safety' }] : [],
        },
        nowMs,
      ),
    );
  }
  const materials = [];
  for (let i = 0; i < p.materials; i += 1) {
    const m = MATERIALS[i % MATERIALS.length];
    materials.push(
      normalizeMaterialOpen(
        { id: `demo-${login}-m${i}`, materialId: m.id, title: m.title, at: new Date(nowMs - (p.lastDays + i * 2) * DAY_MS - 3600000).toISOString() },
        nowMs,
      ),
    );
  }
  return { attempts: attempts.filter(Boolean), materials: materials.filter(Boolean) };
}
