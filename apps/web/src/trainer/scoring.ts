/**
 * Автооценка без нейросети. Перенос tools/score_reference.py (эталон) в TypeScript:
 * каждая функция повторяет одноимённую из Python, результаты сверяются тестом по parity.fixtures.json.
 */
import type {
  CriterionId,
  Flag,
  ForbiddenRule,
  Mode,
  Objection,
  RequiredPoint,
  Scores,
  ScoringFile,
} from './types';

export function norm(s: string): string {
  return s.toLowerCase().replace(/ё/g, 'е').replace(/[«»"“”]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function sentences(text: string): string[] {
  return text
    .split(/[.!?\n;]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

export function tokens(s: string): string[] {
  return s.match(/[а-яa-z0-9]+/g) ?? [];
}

const cache = new Map<string, RegExp>();
function re(pattern: string, flags = ''): RegExp {
  const key = `${flags}/${pattern}`;
  let found = cache.get(key);
  if (!found) {
    found = new RegExp(pattern, flags);
    cache.set(key, found);
  }
  return found;
}
const test = (pattern: string, text: string) => re(pattern).test(text);

/** Все правила запрещённого: глобальные и местные (из localForbiddenPatterns). */
export function allForbidden(scoring: ScoringFile): ForbiddenRule[] {
  const local = Object.entries(scoring.localForbiddenPatterns).map(([id, rule]) => ({ id, ...rule }) as ForbiddenRule);
  return [...scoring.globalForbidden, ...local];
}

export function forbiddenHits(text: string, scoring: ScoringFile): Flag[] {
  const neg = new Set(scoring.negationWords);
  const win = scoring.negationWindowTokens;
  const hits: Flag[] = [];
  for (const rule of allForbidden(scoring)) {
    for (const sent of sentences(norm(text))) {
      if ((rule.exceptIfSentenceMatches ?? []).some((e) => test(e, sent))) continue;
      for (const p of rule.patterns) {
        for (const m of sent.matchAll(re(p, 'g'))) {
          if (rule.negationAware) {
            const before = tokens(sent.slice(0, m.index)).slice(-win);
            if (before.some((t) => neg.has(t))) continue;
          }
          hits.push({ id: rule.id, severity: rule.severity, fragment: m[0] });
        }
      }
    }
  }
  return hits;
}

export function pointOk(point: RequiredPoint, text: string): boolean {
  const t = norm(text);
  const need = point.minMatches ?? 1;
  const got = point.anyOf.filter((p) => test(p, t)).length;
  return got >= need;
}

export function coverage(points: RequiredPoint[], text: string): { cov: number; missingCritical: string[] } {
  let tot = 0;
  let got = 0;
  const missingCritical: string[] = [];
  for (const p of points) {
    const w = p.critical ? 2 : 1;
    tot += w;
    if (pointOk(p, text)) got += w;
    else if (p.critical) missingCritical.push(p.id);
  }
  return { cov: tot ? got / tot : 1, missingCritical };
}

export function covToScore(cov: number, missingCritical: string[], scoring: ScoringFile): number {
  let s = 1;
  for (const [th, sc] of scoring.coverageToScore) {
    if (cov >= th) s = sc;
  }
  if (missingCritical.length) s = Math.min(s, scoring.capIfCriticalMissing);
  return s;
}

export type TextScore = { scores: Record<CriterionId, number>; hits: Flag[]; cov: number; missingCritical: string[] };

export function scoreText(text: string, points: RequiredPoint[], clientText: string, scoring: ScoringFile): TextScore {
  const t = norm(text);
  const q = (t.match(/\?/g) ?? []).length;
  const openQ = sentences(t).some((sent) => scoring.openQuestionStarters.some((p) => test(p, sent))) && q > 0;
  const discovery = q === 0 ? 1 : !openQ ? 3 : 5;

  const ack = scoring.ackStarters.some((p) => test(p, t.slice(0, 120)));
  const clientStems = new Set(tokens(norm(clientText)).filter((w) => w.length >= 5).map((w) => w.slice(0, 5)));
  const echo = [...new Set(tokens(t).filter((w) => w.length >= 5).map((w) => w.slice(0, 5)))].some((w) => clientStems.has(w));
  const listening = 1 + (ack ? 2 : 0) + (echo ? 2 : 0);

  const { cov, missingCritical } = coverage(points, text);
  const objection = covToScore(cov, missingCritical, scoring);

  const facts = points.filter((p) => p.quoteIds?.length && pointOk(p, text)).length;
  const link = test(scoring.valueLinkPattern, t);
  const value = facts === 0 ? 1 : !link ? 3 : facts >= 2 ? 5 : 4;

  const hits = forbiddenHits(text, scoring);
  const crit = hits.filter((h) => h.severity === 'critical');
  const warn = hits.filter((h) => h.severity === 'warn');
  const honesty = crit.length ? 1 : Math.max(3, 5 - warn.length);

  const act = scoring.nextStep.action.some((p) => test(p, t));
  const tm = scoring.nextStep.time.some((p) => test(p, t));
  const who = scoring.nextStep.who.some((p) => test(p, t));
  const nextstep = !act ? 1 : !tm ? 3 : who ? 5 : 4;

  return { scores: { discovery, listening, objection, value, honesty, nextstep }, hits, cov, missingCritical };
}

export type StepScore = {
  scores: Record<CriterionId, number>;
  hits: Flag[];
  cov: number;
  missingCritical: string[];
  matchedPointIds: string[];
  missedPointIds: string[];
};

/** Один шаг сценария или карточка быстрой отработки: два ответа (на возражение и на повтор). */
export function scoreStep(beat1: string, beat2: string, obj: Objection, phrasingIdx: number, scoring: ScoringFile): StepScore {
  const p1 = obj.requiredPoints.filter((p) => p.beat === 1);
  const p2 = obj.requiredPoints.filter((p) => p.beat === 2);
  const s1 = scoreText(beat1, p1, obj.clientPhrasing[phrasingIdx], scoring);
  const s2 = scoreText(beat2, p2, obj.pushback, scoring);
  let tot = 0;
  let got = 0;
  const missing: string[] = [];
  const matchedPointIds: string[] = [];
  const missedPointIds: string[] = [];
  for (const p of [...p1, ...p2]) {
    const w = p.critical ? 2 : 1;
    tot += w;
    const ok = pointOk(p, p.beat === 1 ? beat1 : beat2);
    if (ok) {
      got += w;
      matchedPointIds.push(p.id);
    } else {
      missedPointIds.push(p.id);
      if (p.critical) missing.push(p.id);
    }
  }
  const cov = tot ? got / tot : 1;
  const scores: Record<CriterionId, number> = {
    discovery: Math.max(s1.scores.discovery, s2.scores.discovery),
    listening: Math.max(s1.scores.listening, s2.scores.listening),
    objection: covToScore(cov, missing, scoring),
    value: Math.max(s1.scores.value, s2.scores.value),
    honesty: Math.min(s1.scores.honesty, s2.scores.honesty),
    nextstep: Math.max(s1.scores.nextstep, s2.scores.nextstep),
  };
  return { scores, hits: [...s1.hits, ...s2.hits], cov, missingCritical: missing, matchedPointIds, missedPointIds };
}

/** Питон округляет «до чётного» при точном равенстве; для остальных значений совпадает с toFixed. */
export function round2(x: number): number {
  const scaled = x * 100;
  const floor = Math.floor(scaled);
  if (scaled - floor === 0.5) return (floor % 2 === 0 ? floor : floor + 1) / 100;
  return Number(x.toFixed(2));
}

export function total(scores: Scores, mode: Mode, scoring: ScoringFile): number {
  const weights: Partial<Record<CriterionId, number>> = {};
  for (const c of scoring.criteria) if (c.modes.includes(mode)) weights[c.id] = c.weight;
  if (mode === 'objection' && scoring.discoveryOptionalInDrill && (scores.discovery ?? 1) === 1) delete weights.discovery;
  let sum = 0;
  let tw = 0;
  for (const [k, w] of Object.entries(weights) as [CriterionId, number][]) {
    sum += w * (scores[k] ?? 1);
    tw += w;
  }
  let tot = tw ? sum / tw : 0;
  if ((scores.honesty ?? 5) <= scoring.honestyGate.honestyAtMost) tot = Math.min(tot, scoring.honestyGate.capTotalTo);
  return round2(tot);
}
