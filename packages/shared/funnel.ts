/**
 * Воронка кабинета: уникальные проходы, а не сырые события.
 *
 * Сервер (apps/api) не грузит TypeScript, поэтому тот же алгоритм
 * лежит в funnel.js. Правьте оба файла вместе: тест сверяет их на одних фикстурах.
 */

export type FunnelEvent = {
  id?: string;
  at?: string;
  orgId?: string | null;
  userId?: string | null;
  login?: string;
  tool?: string | null;
  action?: string | null;
  /** Id одного прохода. См. apps/web/src/analytics/sessionId.ts. */
  sessionId?: string | null;
};

export type AnalyticsFunnelCounts = {
  problemomer: { open: number; result: number; pdf: number; share: number };
  calculator: { open: number; calcDone: number; pdf: number };
};

const PROBLEM_STAGES = ['open', 'result', 'pdf', 'share'];
const CALC_STAGES = ['open', 'calc_done', 'pdf'];

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** Календарный день из строки ISO, без перевода в часовой пояс рантайма. */
function dayStamp(at: unknown): string {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(text(at));
  return match ? match[1] : 'noday';
}

/**
 * Ключ одного прохода инструмента.
 * Есть sessionId — это id вкладки, один на инструмент.
 * Нет sessionId (старые события, демо, глубокая ссылка без поля) —
 * организация + пользователь + инструмент + день из `at`.
 * Повторные расчёты и PDF внутри ключа схлопываются.
 */
export function funnelPassKey(event: FunnelEvent, tool: string): string {
  const sessionId = text(event.sessionId);
  if (sessionId) return `${tool}\u0000s\u0000${sessionId}`;
  const org = text(event.orgId);
  const user = text(event.userId) || text(event.login) || 'anonymous';
  return `${tool}\u0000f\u0000${org}\u0000${user}\u0000${dayStamp(event.at)}`;
}

function countReached(events: readonly unknown[], tool: string, stages: readonly string[]): number[] {
  const reached = new Map<string, number>();
  for (const raw of events) {
    if (!raw || typeof raw !== 'object') continue;
    const event = raw as FunnelEvent;
    if (event.tool !== tool) continue;
    const stage = stages.indexOf(text(event.action));
    if (stage < 0) continue;
    const key = funnelPassKey(event, tool);
    const prev = reached.get(key) ?? -1;
    if (stage > prev) reached.set(key, stage);
  }
  const counts = stages.map(() => 0);
  for (const maxStage of reached.values()) {
    for (let index = 0; index <= maxStage; index += 1) {
      counts[index] += 1;
    }
  }
  return counts;
}

/** Уникальные монотонные проходы. Сырые KPI (всего PDF, всего расчётов) здесь не считаются. */
export function computeAnalyticsFunnel(
  events: readonly unknown[] | null | undefined,
): AnalyticsFunnelCounts {
  const list = Array.isArray(events) ? events : [];
  const problemomer = countReached(list, 'problemomer', PROBLEM_STAGES);
  const calculator = countReached(list, 'calculator', CALC_STAGES);
  return {
    problemomer: {
      open: problemomer[0] ?? 0,
      result: problemomer[1] ?? 0,
      pdf: problemomer[2] ?? 0,
      share: problemomer[3] ?? 0,
    },
    calculator: {
      open: calculator[0] ?? 0,
      calcDone: calculator[1] ?? 0,
      pdf: calculator[2] ?? 0,
    },
  };
}

/** Доля этапа от всех открытий. Ноль открытий не делит на ноль. Больше 100% не бывает. */
export function funnelStepPercent(part: unknown, whole: unknown): string {
  const base = typeof whole === 'number' && Number.isFinite(whole) ? whole : 0;
  const value = typeof part === 'number' && Number.isFinite(part) ? part : 0;
  if (base <= 0) return '—';
  const ratio = Math.min(1, Math.max(0, value / base));
  return `${Math.round(ratio * 100)}%`;
}

/**
 * «Где остановились»: доля проходов, которые закончились на каждом этапе. В сумме ровно 100%.
 * Остановились на этапе i = дошли до i − дошли до i+1; на последнем = дошли до него.
 * Счётчики сначала выравниваются по невозрастанию, чтобы не было отрицательных долей.
 * Округление методом наибольшего остатка (при равенстве остатка выигрывает более ранний этап).
 * Ноль открытий: везде «—».
 */
export function funnelStopPercents(counts: readonly unknown[]): string[] {
  const clamped: number[] = [];
  for (const raw of counts) {
    const value = typeof raw === 'number' && Number.isFinite(raw) ? Math.max(0, raw) : 0;
    clamped.push(clamped.length ? Math.min(value, clamped[clamped.length - 1]) : value);
  }
  const total = clamped[0] ?? 0;
  if (total <= 0) return clamped.map(() => '—');
  const stopped = clamped.map((value, index) =>
    index + 1 < clamped.length ? value - clamped[index + 1] : value,
  );
  const exact = stopped.map((value) => (value * 100) / total);
  const percents = exact.map((value) => Math.floor(value));
  let rest = 100 - percents.reduce((sum, value) => sum + value, 0);
  const order = exact
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (const { index } of order) {
    if (rest <= 0) break;
    percents[index] += 1;
    rest -= 1;
  }
  return percents.map((value) => `${value}%`);
}
