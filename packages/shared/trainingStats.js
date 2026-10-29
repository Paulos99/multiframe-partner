/**
 * Обучение в аналитике: сжатая запись одного подхода тренажёра и сводки по сотруднику и компании.
 * Файл общий для сервера и кабинета. Cloud Function не грузит TypeScript, поэтому это чистый JS.
 *
 * Сервер хранит не ответы человека, а только итог подхода: долю верных с первой попытки,
 * баллы по критериям и тип ошибки там, где ошиблись. Свободная практика (набранный текст)
 * на сервер не уходит.
 */

/** Те же пороги, что в `trainer/content/scoring.json` → `choiceMode.passThresholds.levels` (сверяет тест). */
export const TRAINING_LEVELS = [
  { id: 'new', title: 'Начинающий', minShare: 0 },
  { id: 'basic', title: 'Уверенный', minShare: 0.75 },
  { id: 'pro', title: 'Мастер', minShare: 0.9 },
];

/** Критерии из `scoring.json` → `criteria` (сверяет тест). */
export const TRAINING_CRITERIA = [
  { id: 'discovery', title: 'Выяснение потребности' },
  { id: 'listening', title: 'Слышу клиента (признание возражения)' },
  { id: 'objection', title: 'Ответ на возражение' },
  { id: 'value', title: 'Ценность для клиента' },
  { id: 'honesty', title: 'Честность утверждений' },
  { id: 'nextstep', title: 'Следующий шаг' },
];

export const ERROR_TYPES = ['false_promise', 'pressure', 'vague', 'ignores_concern'];
export const TRAINING_MODES = ['objection', 'roleplay', 'quiz'];

/** Окно уровня и «слабых мест»: как на экране «Мой прогресс» в тренажёре. */
export const LEVEL_WINDOW = 10;
export const WEAK_WINDOW = 30;
export const WEAK_CRITERION_BELOW = 3.5;
export const MAX_ATTEMPTS_PER_USER = 300;
export const MAX_MATERIAL_OPENS = 100;
export const MAX_BATCH = 50;

const DAY_MS = 24 * 60 * 60 * 1000;
const ID_RE = /^[A-Za-z0-9_.:-]{1,80}$/;
const CRITERION_IDS = new Set(TRAINING_CRITERIA.map((c) => c.id));
const MODE_ITEM = { objection: 'objection', roleplay: 'scenario', quiz: 'quiz' };

function cleanId(value) {
  const text = String(value ?? '').trim();
  return ID_RE.test(text) ? text : null;
}

function cleanShort(value, max = 80) {
  const text = String(value ?? '').trim();
  return text ? text.slice(0, max) : null;
}

function isoOrNull(value, nowMs, { clampFuture = true } = {}) {
  const stamp = Date.parse(String(value ?? ''));
  if (Number.isNaN(stamp)) return null;
  const capped = clampFuture ? Math.min(stamp, nowMs) : stamp;
  return new Date(capped).toISOString();
}

function round(value, digits) {
  const k = 10 ** digits;
  return Math.round(value * k) / k;
}

/** Сжатая запись подхода из того, что прислал кабинет. Негодная запись → null. */
export function normalizeTrainingAttempt(raw, nowMs = Date.now()) {
  if (!raw || typeof raw !== 'object') return null;
  const id = cleanId(raw.id);
  if (!id) return null;
  const mode = TRAINING_MODES.includes(raw.mode) ? raw.mode : null;
  if (!mode) return null;
  if (mode !== 'quiz' && raw.scheme !== 2) return null;
  const finishedAt = isoOrNull(raw.finishedAt, nowMs);
  if (!finishedAt) return null;
  const startedAt = isoOrNull(raw.startedAt, nowMs) || finishedAt;
  const itemIds = (Array.isArray(raw.itemIds) ? raw.itemIds : [])
    .map((x) => cleanId(x))
    .filter(Boolean)
    .slice(0, 60);
  const share = Number(raw.firstTryCorrect);
  const quizPercent = Number(raw.quizPercent);
  const total = Number(raw.total);
  const count = Number(raw.count);
  const criteria = {};
  for (const [key, value] of Object.entries(raw.criteria && typeof raw.criteria === 'object' ? raw.criteria : {})) {
    if (!CRITERION_IDS.has(key)) continue;
    const n = Number(value);
    criteria[key] = value != null && Number.isFinite(n) && n >= 1 && n <= 5 ? round(n, 2) : null;
  }
  const misses = (Array.isArray(raw.misses) ? raw.misses : []).slice(0, 60).map((m) => ({
    objectionId: cleanId(m?.objectionId),
    reasonKey: cleanId(m?.reasonKey),
    errorType: ERROR_TYPES.includes(m?.errorType) ? m.errorType : null,
    violates: CRITERION_IDS.has(m?.violates) ? m.violates : null,
  }));
  const quizMisses = (Array.isArray(raw.quizMisses) ? raw.quizMisses : []).slice(0, 60).map((m) => ({
    questionId: cleanId(m?.questionId),
    topic: cleanId(m?.topic),
  }));
  return {
    id,
    mode,
    itemType: MODE_ITEM[mode],
    itemIds,
    contentVersion: cleanShort(raw.contentVersion, 40),
    startedAt,
    finishedAt,
    firstTryCorrect: mode !== 'quiz' && Number.isFinite(share) ? round(Math.min(1, Math.max(0, share)), 3) : null,
    count: Number.isInteger(count) && count >= 0 && count <= 200 ? count : 0,
    quizPercent: mode === 'quiz' && Number.isFinite(quizPercent) ? round(Math.min(100, Math.max(0, quizPercent)), 1) : null,
    total: Number.isFinite(total) ? round(Math.min(5, Math.max(0, total)), 2) : 0,
    passed: raw.passed === true,
    criteria,
    misses,
    quizMisses,
  };
}

/** Одно открытие материала. */
export function normalizeMaterialOpen(raw, nowMs = Date.now()) {
  if (!raw || typeof raw !== 'object') return null;
  const id = cleanId(raw.id);
  const materialId = cleanId(raw.materialId);
  const at = isoOrNull(raw.at, nowMs);
  if (!id || !materialId || !at) return null;
  return { id, materialId, title: cleanShort(raw.title, 120) || 'Материал', at };
}

export function levelFor(share) {
  let level = TRAINING_LEVELS[0];
  if (share == null) return level;
  for (const l of TRAINING_LEVELS) if (share >= l.minShare) level = l;
  return level;
}

const byFinishedDesc = (a, b) => String(b.finishedAt).localeCompare(String(a.finishedAt));

function countBy(items, keyOf) {
  const map = new Map();
  for (const item of items) {
    const key = keyOf(item);
    if (key) map.set(key, (map.get(key) || 0) + 1);
  }
  return map;
}

const topCounts = (map, limit) =>
  [...map.entries()]
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
    .slice(0, limit);

/**
 * Сводка по одному человеку. `attempts` — сжатые записи, `materials` — открытия материалов.
 * Уровень и доля считаются так же, как в тренажёре: среднее «верно с первой попытки» по последним десяти подходам выбора.
 */
export function summarizeUserTraining(attempts, materials = []) {
  const all = [...(attempts || [])].sort(byFinishedDesc);
  const choice = all.filter((a) => a.mode !== 'quiz');
  const quiz = all.filter((a) => a.mode === 'quiz');
  const recent = choice.slice(0, LEVEL_WINDOW).filter((a) => typeof a.firstTryCorrect === 'number');
  const levelShare = recent.length ? round(recent.reduce((s, a) => s + a.firstTryCorrect, 0) / recent.length, 3) : null;
  const quizRecent = quiz.slice(0, LEVEL_WINDOW).filter((a) => typeof a.quizPercent === 'number');
  const criteria = TRAINING_CRITERIA.map((c) => {
    const vals = choice
      .slice(0, LEVEL_WINDOW)
      .map((a) => a.criteria?.[c.id])
      .filter((v) => typeof v === 'number');
    const avg = vals.length ? round(vals.reduce((s, v) => s + v, 0) / vals.length, 1) : null;
    return { id: c.id, title: c.title, avg, weak: avg !== null && avg < WEAK_CRITERION_BELOW };
  });
  const window = choice.slice(0, WEAK_WINDOW);
  const reasonCounts = countBy(window.flatMap((a) => a.misses || []), (m) => m.reasonKey);
  const objectionCounts = countBy(window.flatMap((a) => a.misses || []), (m) => m.objectionId);
  const quizCounts = countBy(quiz.slice(0, WEAK_WINDOW).flatMap((a) => a.quizMisses || []), (m) => m.topic);
  const weakTopics = [
    ...[...reasonCounts.entries()].map(([key, count]) => ({ kind: 'reason', key, count })),
    ...[...quizCounts.entries()].map(([key, count]) => ({ kind: 'quiz', key, count })),
  ]
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
    .slice(0, 6);
  const mats = [...(materials || [])].sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const lastAt = all[0]?.finishedAt || null;
  const lastMaterialAt = mats[0]?.at || null;
  const lastActivityAt = [lastAt, lastMaterialAt].filter(Boolean).sort().pop() || null;
  return {
    sets: all.length,
    choiceSets: choice.length,
    quizSets: quiz.length,
    passedSets: all.filter((a) => a.passed).length,
    levelShare,
    level: levelFor(levelShare),
    quizShare: quizRecent.length ? round(quizRecent.reduce((s, a) => s + a.quizPercent, 0) / quizRecent.length / 100, 3) : null,
    criteria,
    weakCriteria: criteria.filter((c) => c.weak).sort((a, b) => a.avg - b.avg),
    weakTopics,
    weakObjections: topCounts(objectionCounts, 5).map(([objectionId, count]) => ({ objectionId, count })),
    lastAt,
    lastMaterialAt,
    lastActivityAt,
    materialsOpened: new Set(mats.map((m) => m.materialId)).size,
    materialOpens: mats.length,
    recentMaterials: mats.slice(0, 5).map((m) => ({ materialId: m.materialId, title: m.title, at: m.at })),
  };
}

/** Последние подходы для страницы сотрудника (без списка ошибок). */
export function recentAttempts(attempts, limit = 20) {
  return [...(attempts || [])]
    .sort(byFinishedDesc)
    .slice(0, limit)
    .map((a) => ({
      id: a.id,
      mode: a.mode,
      itemType: a.itemType,
      itemIds: a.itemIds,
      finishedAt: a.finishedAt,
      share: a.mode === 'quiz' ? (a.quizPercent == null ? null : round(a.quizPercent / 100, 3)) : a.firstTryCorrect,
      passed: a.passed,
      count: a.count,
    }));
}

/**
 * Сводка по компании из сводок её сотрудников. `staffTotal` — сколько сотрудников в компании.
 * «Обучены» — те, у кого есть хотя бы один подход.
 */
export function summarizeCompanyTraining(userSummaries, nowMs = Date.now()) {
  const staffTotal = userSummaries.length;
  const trained = userSummaries.filter((s) => s.sets > 0);
  const shares = trained.map((s) => s.levelShare).filter((v) => typeof v === 'number');
  const within = (days) =>
    userSummaries.filter((s) => s.lastActivityAt && nowMs - Date.parse(s.lastActivityAt) <= days * DAY_MS).length;
  const topics = new Map();
  for (const s of userSummaries) {
    for (const t of s.weakTopics) {
      const key = `${t.kind}:${t.key}`;
      topics.set(key, { kind: t.kind, key: t.key, count: (topics.get(key)?.count || 0) + t.count });
    }
  }
  const levels = { new: 0, basic: 0, pro: 0 };
  for (const s of trained) levels[s.level.id] += 1;
  const lastActivityAt = userSummaries.map((s) => s.lastActivityAt).filter(Boolean).sort().pop() || null;
  return {
    staffTotal,
    trained: trained.length,
    avgShare: shares.length ? round(shares.reduce((s, v) => s + v, 0) / shares.length, 3) : null,
    active7: within(7),
    active30: within(30),
    levels,
    weakTopics: [...topics.values()].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key)).slice(0, 5),
    lastActivityAt,
  };
}

/** Объединение записей по id: ничего не теряется, повтор той же записи не плодит дублей. */
export function unionById(first, second, cap) {
  const seen = new Set();
  const out = [];
  for (const item of [...(first || []), ...(second || [])]) {
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return cap ? out.slice(0, cap) : out;
}
