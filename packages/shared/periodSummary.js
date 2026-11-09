/**
 * «Сводка за период»: выводы по правилам, без языковых моделей.
 * Один и тот же код считает сводку в интерфейсе (демо, запасной путь) и на сервере (GET /analytics/summary).
 *
 * Вход — уже отфильтрованные по правам комнаты, события аналитики и сотрудники.
 * Права проверяет вызывающий код (сервер), здесь только арифметика и тексты.
 *
 * Каждый вывод: { id, tone, text, action }.
 *   tone: 'good' | 'bad' | 'neutral' | 'info'
 *   text: что видно в данных, простым русским
 *   action: «что сделать», одна строка
 * На маленькой выборке правило молчит; если не сработало ни одно — один вывод «мало данных».
 */

import { computeClientJourney, groupJourneySteps } from './clientJourney.js';
import { closedOutcomeRates, isRefused, refusalStats } from './refusal.js';

export const SUMMARY_LIMITS = Object.freeze({
  /** Меньше комнат за период — доли по комнатам не считаем. */
  minRooms: 5,
  /** Меньше событий инструмента — динамику не сравниваем. */
  minEvents: 10,
  /** Меньше закрытых комнат — долю отказов не оцениваем. */
  minClosed: 3,
  /** Меньше отказов — главную причину не называем. */
  minRefusals: 3,
  /** Комнат или прохождений у сотрудника, чтобы сравнивать его с другими. */
  minPerPerson: 5,
  /** Изменение меньше этого (в процентах или п. п.) считаем «без изменений». */
  flatPct: 5,
  /** Комната без движения дольше — «зависла». */
  staleDays: 7,
  /** Партнёр без активности дольше — «неактивен». */
  inactiveDays: 14,
  /** Отказов больше среднего по сети на столько п. п. — «аномально». */
  refusalGapPp: 20,
  maxConclusions: 7,
});

const DAY_MS = 24 * 60 * 60 * 1000;

const STATUS_ORDER = ['draft', 'measured', 'quote_sent', 'install', 'closed'];
const STATUS_RANK = Object.fromEntries(STATUS_ORDER.map((s, i) => [s, i]));
const STATUS_TITLES = {
  draft: 'Черновик',
  measured: 'Замер',
  quote_sent: 'КП отправлено',
  install: 'Монтаж',
};

/** Что делать, если на этапе воронки теряется больше всего. */
const STAGE_ACTIONS = {
  problemomer: 'Проходите Проблемомер с клиентом при первом контакте: он сразу слышит свою проблему и результат.',
  calculator: 'Сразу после Проблемомера считайте смету в калькуляторе и отправляйте клиенту PDF.',
  offer: 'Делайте предложение в тот же день, пока клиент помнит результат Проблемомера.',
  measure_quote: 'Назначайте замер в течение двух дней и отправляйте КП сразу после замера.',
  install: 'Перезванивайте клиенту через 2–3 дня после КП: снимите сомнения и назначьте монтаж.',
};

/** Что делать, если комнаты дольше всего стоят в статусе. */
const STATUS_ACTIONS = {
  draft: 'Назначайте замер сразу после расчёта, не оставляйте комнату черновиком.',
  measured: 'Отправляйте КП в день замера: цифры ещё свежие и у вас, и у клиента.',
  quote_sent: 'Через 2–3 дня после КП звоните клиенту и договаривайтесь о монтаже.',
  install: 'Проверьте загрузку бригад и ставьте монтаж на ближайшие свободные дни.',
};

/** Что делать с главной причиной отказа. Ключи — из refusal.js. */
const REFUSAL_ACTIONS = {
  price_too_high: 'Показывайте, из чего складывается цена, и потренируйте ответ на «Дорого» в тренажёре продаж.',
  cheaper_alternative: 'Сравнивайте с дешёвым материалом по результату Проблемомера, а не по цене за метр.',
  other_solution: 'Объясняйте, чем MultiFrame отличается от каркаса и многослойных решений: высота, сроки, монтаж.',
  doubt_effect: 'Показывайте результат Проблемомера и фото выполненных работ, разберите возражение в тренажёре.',
  unrealistic_expectation: 'На первой встрече честно говорите, какой результат реален, по данным Проблемомера.',
  doubt_safety: 'Держите под рукой сертификаты и описание материала из раздела «Материалы».',
  install_too_long: 'Рассказывайте, сколько длится монтаж на самом деле, и предлагайте удобную дату.',
  postpone_decision: 'Договаривайтесь о дате следующего звонка прямо при отправке КП.',
  not_needed: 'Проводите Проблемомер до разговора о цене: клиент сам увидит проблему.',
  lose_space: 'Показывайте, сколько высоты реально уходит, на схеме из калькулятора.',
  decision_maker: 'Приглашайте на замер и показ КП всех, кто принимает решение.',
  need_details: 'Отправляйте вместе с КП ответы на частые вопросы из раздела «Материалы».',
  other: 'Прочитайте комментарии к отказам «Другая причина» и добавьте частые в список.',
};

/* —— мелочи —— */

function ms(iso) {
  const t = Date.parse(String(iso || ''));
  return Number.isNaN(t) ? null : t;
}

function inRange(iso, from, to) {
  const t = ms(iso);
  if (t == null) return false;
  if (from && t < Date.parse(from)) return false;
  if (to && t > Date.parse(to)) return false;
  return true;
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

/** Склонение: plural(5, ['комната', 'комнаты', 'комнат']). */
export function plural(n, forms) {
  const a = Math.abs(Math.trunc(n)) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}

/** 1234567 → «1 234 567 ₽» (обычные пробелы, чтобы текст одинаково читался везде). */
export function formatRub(n) {
  const v = Math.round(num(n));
  const s = String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${v < 0 ? '−' : ''}${s} ₽`;
}

function formatDays(d) {
  const v = round1(d);
  const whole = Number.isInteger(v);
  return `${String(v).replace('.', ',')} ${whole ? plural(v, ['день', 'дня', 'дней']) : 'дня'}`;
}

/** Изменение в процентах к прошлому периоду; null — сравнивать не с чем. */
export function changePct(current, previous) {
  if (previous == null || !(previous > 0)) return null;
  return Math.round(((current - previous) / previous) * 100);
}

function changeWords(pct) {
  if (pct == null) return '';
  if (Math.abs(pct) < SUMMARY_LIMITS.flatPct) return 'примерно как в прошлом периоде';
  return pct > 0 ? `на ${pct}% больше, чем в прошлом периоде` : `на ${Math.abs(pct)}% меньше, чем в прошлом периоде`;
}

/** Предыдущий период той же длины, вплотную перед выбранным. null — «всё время». */
export function previousRange(from, to) {
  const a = ms(from);
  const b = ms(to);
  if (a == null || b == null || b < a) return null;
  const prevTo = a - 1;
  const prevFrom = prevTo - (b - a);
  return { from: new Date(prevFrom).toISOString(), to: new Date(prevTo).toISOString() };
}

function roomClosedAt(room) {
  if (room?.refusal?.at) return room.refusal.at;
  const hist = Array.isArray(room?.history) ? room.history : [];
  const close = hist
    .filter((h) => h && h.action === 'status' && /→closed$/.test(String(h.detail || '')))
    .map((h) => h.at)
    .sort()
    .pop();
  return close || room?.updatedAt || null;
}

function lastMovementAt(room) {
  let best = ms(room?.updatedAt) ?? ms(room?.createdAt) ?? null;
  for (const h of Array.isArray(room?.history) ? room.history : []) {
    const t = ms(h?.at);
    if (t != null && (best == null || t > best)) best = t;
  }
  return best;
}

/**
 * Сколько дней комната пробыла в каждом статусе. Берутся переходы из истории («status», «a→b»),
 * которые закончились в периоде. Возвращает Map статус → массив длительностей в днях.
 */
function statusDurations(rooms, from, to) {
  const out = new Map();
  for (const room of rooms) {
    const hist = (Array.isArray(room?.history) ? room.history : [])
      .filter((h) => h && ms(h.at) != null)
      .slice()
      .sort((x, y) => ms(x.at) - ms(y.at));
    let enteredAt = ms(room.createdAt);
    let current = null;
    const create = hist.find((h) => h.action === 'create');
    if (create) {
      enteredAt = ms(create.at);
      current = STATUS_RANK[String(create.detail || '')] != null ? String(create.detail) : 'draft';
    }
    for (const h of hist) {
      if (h.action !== 'status') continue;
      const [a, b] = String(h.detail || '').split('→');
      const leaving = a && STATUS_RANK[a] != null ? a : current;
      const t = ms(h.at);
      if (leaving && leaving !== 'closed' && enteredAt != null && t != null && t >= enteredAt && inRange(h.at, from, to)) {
        if (!out.has(leaving)) out.set(leaving, []);
        out.get(leaving).push((t - enteredAt) / DAY_MS);
      }
      current = b && STATUS_RANK[b] != null ? b : current;
      enteredAt = t;
    }
  }
  return out;
}

function avg(list) {
  return list.length ? list.reduce((s, v) => s + v, 0) / list.length : null;
}

function countEvents(events, tool, action, from, to) {
  let n = 0;
  for (const e of events) {
    if (!e || (tool && e.tool !== tool) || e.action !== action) continue;
    if (!inRange(e.at, from, to)) continue;
    n += 1;
  }
  return n;
}

function personOf(users, id) {
  return (users || []).find((x) => x && (String(x.id) === String(id) || String(x.login || '') === String(id))) || null;
}

function personName(users, id) {
  const u = personOf(users, id);
  return (u && (u.displayName || u.login)) || null;
}

function personRole(users, id, fallback) {
  const u = personOf(users, id);
  return String((u && u.role) || fallback || '');
}

/* —— показатели периода —— */

/**
 * Все числа, из которых строятся выводы. Считается для текущего и для прошлого периода.
 * @param {{ rooms?: object[], events?: object[], users?: object[], from?: string|null, to?: string|null, now?: string|number|Date }} input
 */
export function periodMetrics({ rooms = [], events = [], users = [], from = null, to = null, now = Date.now() } = {}) {
  const roomList = (Array.isArray(rooms) ? rooms : []).filter((r) => r && typeof r === 'object');
  const eventList = (Array.isArray(events) ? events : []).filter((e) => e && typeof e === 'object');
  const nowMs = typeof now === 'number' ? now : ms(now instanceof Date ? now.toISOString() : now) ?? Date.now();

  const journey = computeClientJourney({ rooms: roomList, events: eventList, users, from, to });
  const { groups } = groupJourneySteps(journey.steps);
  // Этап не может пройти меньше клиентов, чем следующий за ним: если шаг не отслеживался
  // (например, «Поделился» в конце группы «Калькулятор»), берём число со следующего этапа.
  const stages = groups.map((g) => ({ id: g.id, label: g.label, count: g.count }));
  for (let i = stages.length - 2; i >= 0; i -= 1) {
    const next = stages[i + 1].count;
    if (next != null && (stages[i].count == null || stages[i].count < next)) stages[i].count = next;
  }

  const created = roomList.filter((r) => inRange(r.createdAt || r.updatedAt, from, to));
  const reachedQuote = created.filter((r) => (STATUS_RANK[String(r.status || '')] ?? -1) >= STATUS_RANK.quote_sent).length;

  const outcome = closedOutcomeRates(roomList, { from, to });
  const completedRooms = roomList.filter(
    (r) => r.status === 'closed' && !isRefused(r) && inRange(roomClosedAt(r), from, to),
  );
  const salesSum = completedRooms.reduce((s, r) => s + num(r.estimate?.totalCost), 0);
  const areaSum = completedRooms.reduce((s, r) => s + num(r.room?.areaM2), 0);
  const cycleDays = completedRooms
    .map((r) => {
      const a = ms(r.createdAt);
      const b = ms(roomClosedAt(r));
      return a != null && b != null && b >= a ? (b - a) / DAY_MS : null;
    })
    .filter((v) => v != null);

  const openRooms = roomList.filter((r) => r.status !== 'closed');
  const pipelineSum = openRooms
    .filter((r) => r.status === 'quote_sent' || r.status === 'install')
    .reduce((s, r) => s + num(r.estimate?.totalCost), 0);

  // «Зависшие» — снимок на конец периода (или на сегодня, если период ещё идёт).
  const endMs = Math.min(nowMs, ms(to) ?? nowMs);
  const staleRooms = openRooms.filter((r) => {
    if ((ms(r.createdAt) ?? 0) > endMs) return false;
    const last = lastMovementAt(r);
    return last != null && endMs - last > SUMMARY_LIMITS.staleDays * DAY_MS;
  });
  const staleProjects = new Set(staleRooms.map((r) => r.projectId || r.id));

  const durations = statusDurations(roomList, from, to);
  const stageDays = [...durations.entries()]
    .map(([status, list]) => ({ status, title: STATUS_TITLES[status] || status, avgDays: round1(avg(list)), n: list.length }))
    .sort((a, b) => b.avgDays - a.avgDays);

  const refusals = refusalStats(roomList, { from, to });

  // Сотрудники: доля комнат, дошедших до КП, по автору комнаты.
  const byPerson = new Map();
  for (const r of created) {
    const id = String(r.createdBy || '');
    if (!id) continue;
    const row = byPerson.get(id) || { id, rooms: 0, quote: 0 };
    row.rooms += 1;
    if ((STATUS_RANK[String(r.status || '')] ?? -1) >= STATUS_RANK.quote_sent) row.quote += 1;
    byPerson.set(id, row);
  }
  // Запасной путь — инструменты: сколько прохождений Проблемомера дошли до расчёта в калькуляторе.
  const toolByPerson = new Map();
  for (const e of eventList) {
    if (!inRange(e.at, from, to)) continue;
    const id = String(e.userId || e.login || '');
    if (!id) continue;
    const row = toolByPerson.get(id) || { id, login: e.login || '', role: String(e.role || ''), pm: 0, calc: 0 };
    if (e.tool === 'problemomer' && e.action === 'result') row.pm += 1;
    if (e.tool === 'calculator' && e.action === 'calc_done') row.calc += 1;
    toolByPerson.set(id, row);
  }

  return {
    from,
    to,
    stages,
    roomsCreated: created.length,
    reachedQuote,
    closed: outcome.closed,
    refused: outcome.refused,
    completed: outcome.completed,
    refusedPct: outcome.refusedPct,
    salesSum: Math.round(salesSum),
    areaSum: round1(areaSum),
    pipelineSum: Math.round(pipelineSum),
    avgCycleDays: cycleDays.length ? round1(avg(cycleDays)) : null,
    cycleSample: cycleDays.length,
    stageDays,
    staleRooms: staleRooms.length,
    staleProjects: staleProjects.size,
    refusalsTotal: refusals.total,
    refusalReasons: refusals.byReason,
    problemomer: countEvents(eventList, 'problemomer', 'result', from, to),
    calculator: countEvents(eventList, 'calculator', 'calc_done', from, to),
    pdf: countEvents(eventList, null, 'pdf', from, to),
    people: [...byPerson.values()].map((p) => ({ ...p, name: personName(users, p.id), role: personRole(users, p.id) })),
    toolPeople: [...toolByPerson.values()].map((p) => ({
      ...p,
      name: personName(users, p.id) || p.login || null,
      role: personRole(users, p.id, p.role),
    })),
    lastActiveAt: (() => {
      let best = null;
      for (const e of eventList) {
        const t = ms(e.at);
        if (t != null && t <= endMs && (best == null || t > best)) best = t;
      }
      for (const r of roomList) {
        const t = lastMovementAt(r);
        if (t != null && t <= endMs && (best == null || t > best)) best = t;
      }
      return best == null ? null : new Date(best).toISOString();
    })(),
  };
}

/* —— правила —— */

function passRate(stages, index) {
  const prev = stages[index - 1]?.count;
  const cur = stages[index]?.count;
  if (prev == null || cur == null || !(prev > 0)) return null;
  return Math.min(100, Math.round((cur / prev) * 100));
}

/** Правило 1. Этап воронки, где теряем больше всего, и сравнение с прошлым периодом. */
function ruleBiggestDrop(cur, prev) {
  const L = SUMMARY_LIMITS;
  let worst = null;
  for (let i = 1; i < cur.stages.length; i += 1) {
    const base = cur.stages[i - 1].count;
    const rate = passRate(cur.stages, i);
    if (rate == null || base < L.minRooms) continue;
    if (!worst || rate < worst.rate) worst = { i, rate, stage: cur.stages[i] };
  }
  if (!worst || worst.rate >= 100) return null;
  const prevRate = prev && (prev.stages[worst.i - 1]?.count ?? 0) >= L.minRooms ? passRate(prev.stages, worst.i) : null;
  let tail = '';
  let tone = 'bad';
  if (prevRate != null) {
    const diff = worst.rate - prevRate;
    if (Math.abs(diff) < L.flatPct) tail = `, как и в прошлом периоде (${prevRate}%)`;
    else if (diff > 0) {
      tail = `, но это лучше прошлого периода (${prevRate}%)`;
      tone = 'neutral';
    } else tail = `, хуже прошлого периода (${prevRate}%)`;
  }
  return {
    id: 'biggest_drop',
    tone,
    text: `Больше всего клиентов теряется перед этапом «${worst.stage.label}»: доходит ${worst.rate}% с предыдущего этапа${tail}.`,
    action: STAGE_ACTIONS[worst.stage.id] || 'Разберите с командой, что мешает клиенту перейти на этот этап.',
  };
}

/** Правило 2. Конверсия комнат в КП и её изменение. */
function ruleConversion(cur, prev) {
  const L = SUMMARY_LIMITS;
  if (cur.roomsCreated < L.minRooms) return null;
  const pct = Math.round((cur.reachedQuote / cur.roomsCreated) * 100);
  const prevPct = prev && prev.roomsCreated >= L.minRooms ? Math.round((prev.reachedQuote / prev.roomsCreated) * 100) : null;
  let tone = 'neutral';
  let tail = '';
  if (prevPct != null) {
    const diff = pct - prevPct;
    if (Math.abs(diff) < L.flatPct) tail = ` Это на уровне прошлого периода (${prevPct}%).`;
    else if (diff > 0) {
      tone = 'good';
      tail = ` Это на ${diff} п. п. лучше прошлого периода (${prevPct}%).`;
    } else {
      tone = 'bad';
      tail = ` Это на ${Math.abs(diff)} п. п. хуже прошлого периода (${prevPct}%).`;
    }
  }
  const roomsWord = plural(cur.roomsCreated, ['комнаты', 'комнат', 'комнат']);
  return {
    id: 'conversion',
    tone,
    text: `До КП дошли ${cur.reachedQuote} из ${cur.roomsCreated} ${roomsWord}, созданных за период, — ${pct}%.${tail}`,
    action:
      tone === 'bad'
        ? 'Посмотрите комнаты, которые остановились до КП, и назначьте по каждой следующий шаг.'
        : 'Сохраняйте темп: по каждой новой комнате сразу назначайте замер.',
  };
}

/** Правило 3. Деньги и площадь по завершённым комнатам, плюс сумма в работе. */
function ruleSales(cur, prev) {
  if (!cur.completed && !cur.pipelineSum) return null;
  const pct = prev ? changePct(cur.salesSum, prev.salesSum) : null;
  let tone = 'neutral';
  if (pct != null && Math.abs(pct) >= SUMMARY_LIMITS.flatPct) tone = pct > 0 ? 'good' : 'bad';
  const parts = [];
  if (cur.completed) {
    parts.push(
      `Завершено комнат: ${cur.completed} на ${formatRub(cur.salesSum)}, ${String(cur.areaSum).replace('.', ',')} м²`,
    );
    if (pct != null) parts[0] += ` — ${changeWords(pct)}`;
  } else {
    parts.push('Завершённых комнат за период нет');
  }
  if (cur.pipelineSum) parts.push(`в работе (КП и монтаж) ещё ${formatRub(cur.pipelineSum)}`);
  return {
    id: 'sales',
    tone,
    text: `${parts.join('; ')}.`,
    action: cur.pipelineSum
      ? 'Пройдитесь по комнатам «КП отправлено» и «Монтаж»: это ближайшие деньги.'
      : 'Добавляйте новые комнаты: без КП в работе следующего периода не будет.',
  };
}

/** Правило 4. Средний срок сделки и этап, где теряется время. */
function ruleCycle(cur, prev) {
  const slow = cur.stageDays.find((s) => s.n >= 2 && s.avgDays >= 1);
  if (cur.avgCycleDays == null && !slow) return null;
  const parts = [];
  let tone = 'neutral';
  if (cur.avgCycleDays != null) {
    let s = `От создания комнаты до завершения в среднем ${formatDays(cur.avgCycleDays)}`;
    if (prev && prev.avgCycleDays != null && prev.cycleSample >= 2 && cur.cycleSample >= 2) {
      const diff = round1(cur.avgCycleDays - prev.avgCycleDays);
      if (Math.abs(diff) >= 1) {
        tone = diff < 0 ? 'good' : 'bad';
        s += diff < 0 ? ` (быстрее на ${formatDays(-diff)})` : ` (дольше на ${formatDays(diff)})`;
      }
    }
    parts.push(s);
  }
  if (slow) parts.push(`дольше всего комнаты стоят в статусе «${slow.title}» — ${formatDays(slow.avgDays)}`);
  return {
    id: 'cycle',
    tone,
    text: `${parts.join('; ')}.`,
    action: slow ? STATUS_ACTIONS[slow.status] : 'Следите, чтобы у каждой комнаты был назначен следующий шаг.',
  };
}

/** Правило 5. Отказы: доля и главная причина. */
function ruleRefusals(cur, prev) {
  const L = SUMMARY_LIMITS;
  if (cur.closed < L.minClosed && cur.refusalsTotal < L.minRefusals) return null;
  const parts = [];
  let tone = 'neutral';
  if (cur.closed >= L.minClosed && cur.refusedPct != null) {
    let s = `Отказом закрыто ${cur.refused} из ${cur.closed} закрытых комнат (${cur.refusedPct}%)`;
    if (prev && prev.closed >= L.minClosed && prev.refusedPct != null) {
      const diff = cur.refusedPct - prev.refusedPct;
      if (Math.abs(diff) >= L.flatPct) {
        tone = diff > 0 ? 'bad' : 'good';
        s += diff > 0 ? `, больше прошлого периода (${prev.refusedPct}%)` : `, меньше прошлого периода (${prev.refusedPct}%)`;
      }
    } else if (cur.refusedPct >= 50) tone = 'bad';
    parts.push(s);
  }
  const top = cur.refusalsTotal >= L.minRefusals ? cur.refusalReasons[0] : null;
  if (top) {
    parts.push(`главная причина — «${top.title}» (${top.count} из ${cur.refusalsTotal})`);
    if (tone === 'neutral') tone = 'bad';
  }
  if (!parts.length) return null;
  return {
    id: 'refusals',
    tone,
    text: `${parts.join('; ')}.`,
    action: top
      ? REFUSAL_ACTIONS[top.key] || REFUSAL_ACTIONS.other
      : `Причины отказов — во вкладке «Комнаты». Когда их наберётся ${L.minRefusals} и больше, здесь появится главная.`,
  };
}

/** Самая большая группа сотрудников одной роли, где хотя бы двое набрали выборку. */
function sameRoleGroup(list, enough) {
  const byRole = new Map();
  for (const p of list) {
    if (!p.name || !enough(p)) continue;
    const key = p.role || '?';
    if (!byRole.has(key)) byRole.set(key, []);
    byRole.get(key).push(p);
  }
  return [...byRole.values()].filter((g) => g.length >= 2).sort((a, b) => b.length - a.length)[0] || null;
}

/** Правило 6. Лучший и отстающий сотрудник по конверсии. Сравниваем только людей одной роли. */
function rulePeople(cur) {
  const L = SUMMARY_LIMITS;
  const byRooms = sameRoleGroup(cur.people, (p) => p.rooms >= L.minPerPerson);
  if (byRooms) {
    const rated = byRooms
      .map((p) => ({ ...p, pct: Math.round((p.quote / p.rooms) * 100) }))
      .sort((a, b) => b.pct - a.pct || b.rooms - a.rooms);
    const best = rated[0];
    const worst = rated[rated.length - 1];
    if (best.pct - worst.pct >= L.flatPct) {
      return {
        id: 'people',
        tone: 'neutral',
        text: `Чаще всего доводит комнаты до КП ${best.name}: ${best.pct}% (${best.quote} из ${best.rooms}). Реже всех — ${worst.name}: ${worst.pct}% (${worst.quote} из ${worst.rooms}).`,
        action: 'Пусть лучший сотрудник покажет команде, как ведёт клиента от Проблемомера до КП, а с отстающим разберите его последние комнаты.',
      };
    }
  }
  const byTools = sameRoleGroup(cur.toolPeople, (p) => p.pm >= L.minPerPerson);
  if (byTools) {
    const rated = byTools
      .map((p) => ({ ...p, pct: Math.min(100, Math.round((p.calc / p.pm) * 100)) }))
      .sort((a, b) => b.pct - a.pct || b.pm - a.pm);
    const best = rated[0];
    const worst = rated[rated.length - 1];
    if (best.pct - worst.pct >= L.flatPct) {
      return {
        id: 'people',
        tone: 'neutral',
        text: `После Проблемомера чаще всех считает смету ${best.name}: ${best.pct}% прохождений. Реже всех — ${worst.name}: ${worst.pct}%.`,
        action: 'Договоритесь, что после каждого Проблемомера сразу открывается калькулятор; лучший сотрудник может показать, как это делает.',
      };
    }
  }
  return null;
}

/** Правило 7. Комнаты без движения. */
function ruleStale(cur) {
  if (!cur.staleRooms) return null;
  return {
    id: 'stale',
    tone: 'bad',
    text: `${cur.staleProjects} ${plural(cur.staleProjects, ['проект', 'проекта', 'проектов'])} (${cur.staleRooms} ${plural(cur.staleRooms, ['комната', 'комнаты', 'комнат'])}) без движения больше ${SUMMARY_LIMITS.staleDays} дней.`,
    action: 'Откройте их на доске и решите по каждому: позвонить, перенести этап или закрыть с причиной.',
  };
}

/** Правило 8. Работа с инструментами: Проблемомер и калькулятор к прошлому периоду. */
function ruleActivity(cur, prev) {
  const L = SUMMARY_LIMITS;
  if (cur.problemomer + cur.calculator < L.minEvents && !(prev && prev.problemomer + prev.calculator >= L.minEvents)) return null;
  const pmPct = prev && prev.problemomer >= L.minEvents ? changePct(cur.problemomer, prev.problemomer) : null;
  let tone = 'neutral';
  if (pmPct != null && Math.abs(pmPct) >= L.flatPct) tone = pmPct > 0 ? 'good' : 'bad';
  let text = `Проблемомер пройден ${cur.problemomer} ${plural(cur.problemomer, ['раз', 'раза', 'раз'])}, расчётов в калькуляторе — ${cur.calculator}`;
  if (pmPct != null) text += `. Проблемомер — ${changeWords(pmPct)}`;
  return {
    id: 'activity',
    tone,
    text: `${text}.`,
    action:
      tone === 'bad'
        ? 'Напомните команде начинать каждую встречу с Проблемомера: это вход в воронку.'
        : 'Проблемомер — главный вход в воронку; следите, чтобы после него шёл расчёт.',
  };
}

const TONE_ORDER = { bad: 0, neutral: 1, good: 2, info: 3 };

/**
 * Сводка за период для владельца компании (или по всей сети у админа StP).
 * @returns {{ conclusions: Array<{id:string,tone:string,text:string,action:string}>, enoughData: boolean, current: object, previous: object|null }}
 */
export function buildPeriodSummary({ rooms = [], events = [], users = [], from = null, to = null, now = Date.now() } = {}) {
  const current = periodMetrics({ rooms, events, users, from, to, now });
  const prevRange = previousRange(from, to);
  const previous = prevRange ? periodMetrics({ rooms, events, users, from: prevRange.from, to: prevRange.to, now }) : null;

  const rules = [ruleBiggestDrop, ruleConversion, ruleSales, ruleCycle, ruleRefusals, rulePeople, ruleStale, ruleActivity];
  const found = [];
  for (const rule of rules) {
    const c = rule(current, previous);
    if (c) found.push(c);
  }
  // Порядок: сначала проблемы, потом нейтральное, потом хорошее. Внутри — порядок правил.
  const conclusions = found
    .map((c, i) => ({ c, i }))
    .sort((a, b) => TONE_ORDER[a.c.tone] - TONE_ORDER[b.c.tone] || a.i - b.i)
    .map(({ c }) => c)
    .slice(0, SUMMARY_LIMITS.maxConclusions);

  if (!conclusions.length) {
    conclusions.push({
      id: 'not_enough',
      tone: 'info',
      text: `Мало данных за период: ${current.roomsCreated} ${plural(current.roomsCreated, ['комната', 'комнаты', 'комнат'])}, ${current.problemomer} ${plural(current.problemomer, ['прохождение', 'прохождения', 'прохождений'])} Проблемомера.`,
      action: `Выберите период подлиннее: выводы появятся, когда наберётся хотя бы ${SUMMARY_LIMITS.minRooms} комнат или ${SUMMARY_LIMITS.minEvents} прохождений.`,
    });
  }
  return {
    conclusions,
    enoughData: conclusions[0].id !== 'not_enough',
    current,
    previous,
    previousRange: prevRange,
  };
}

/* —— сравнение партнёров (админ StP) —— */

function trend(cur, prev) {
  if (prev == null) return null;
  if (!(prev > 0)) return cur > 0 ? 'up' : 'flat';
  const pct = ((cur - prev) / prev) * 100;
  if (Math.abs(pct) < SUMMARY_LIMITS.flatPct) return 'flat';
  return pct > 0 ? 'up' : 'down';
}

/**
 * Таблица партнёров и выводы по сети.
 * @param {{ orgs: Array<{ id: string, name: string, city?: string }>, rooms?: object[], events?: object[], from?: string|null, to?: string|null, now?: number|string }} input
 */
export function buildPartnerComparison({ orgs = [], rooms = [], events = [], from = null, to = null, now = Date.now() } = {}) {
  const L = SUMMARY_LIMITS;
  const nowMs = typeof now === 'number' ? now : ms(now) ?? Date.now();
  const endMs = Math.min(nowMs, ms(to) ?? nowMs);
  const prevRange = previousRange(from, to);
  const rows = (orgs || []).map((org) => {
    const orgRooms = (rooms || []).filter((r) => r && r.orgId === org.id);
    const orgEvents = (events || []).filter((e) => e && e.orgId === org.id);
    const cur = periodMetrics({ rooms: orgRooms, events: orgEvents, from, to, now });
    const prev = prevRange ? periodMetrics({ rooms: orgRooms, events: orgEvents, from: prevRange.from, to: prevRange.to, now }) : null;
    const lastMs = ms(cur.lastActiveAt);
    return {
      orgId: org.id,
      name: org.name || org.id,
      city: org.city || '',
      rooms: cur.roomsCreated,
      problemomer: cur.problemomer,
      quotePct: cur.roomsCreated ? Math.round((cur.reachedQuote / cur.roomsCreated) * 100) : null,
      completed: cur.completed,
      salesSum: cur.salesSum,
      avgCycleDays: cur.avgCycleDays,
      closed: cur.closed,
      refusedPct: cur.refusedPct,
      lastActiveAt: cur.lastActiveAt,
      inactiveDays: lastMs == null ? null : Math.floor((endMs - lastMs) / DAY_MS),
      trendRooms: prev ? trend(cur.roomsCreated, prev.roomsCreated) : null,
      trendActivity: prev ? trend(cur.problemomer + cur.calculator, prev.problemomer + prev.calculator) : null,
      trendSales: prev ? trend(cur.salesSum, prev.salesSum) : null,
    };
  });
  rows.sort((a, b) => b.salesSum - a.salesSum || b.rooms - a.rooms || b.problemomer - a.problemomer);

  const conclusions = [];
  const active = rows.filter((r) => r.rooms > 0 || r.problemomer > 0);
  if (active.length < 2) {
    conclusions.push({
      id: 'partners_few',
      tone: 'info',
      text:
        active.length === 1
          ? `Данные за период есть только у одного партнёра («${active[0].name}»): сравнивать пока не с кем.`
          : 'За период ни у одного партнёра нет комнат и прохождений Проблемомера.',
      action:
        active.length === 1
          ? 'Когда данные появятся хотя бы у двух партнёров, здесь будут лидер, отстающие и партнёры с необычно частыми отказами.'
          : 'Выберите период подлиннее или напомните партнёрам заносить комнаты в кабинет.',
    });
  } else {
    const leader = active[0];
    const leaderBy = leader.salesSum > 0 ? `${formatRub(leader.salesSum)} по завершённым комнатам` : `${leader.rooms} ${plural(leader.rooms, ['комната', 'комнаты', 'комнат'])}, ${leader.problemomer} Проблемомеров`;
    conclusions.push({
      id: 'partners_leader',
      tone: 'good',
      text: `Лидер периода — «${leader.name}»: ${leaderBy}.`,
      action: 'Узнайте, что у них работает, и расскажите остальным партнёрам.',
    });
    const rated = active.filter((r) => r.rooms >= L.minRooms && r.quotePct != null).sort((a, b) => a.quotePct - b.quotePct);
    if (rated.length >= 2 && rated[rated.length - 1].quotePct - rated[0].quotePct >= L.flatPct) {
      const lag = rated[0];
      const avgPct = Math.round(rated.reduce((s, r) => s + r.quotePct, 0) / rated.length);
      conclusions.push({
        id: 'partners_lagging',
        tone: 'bad',
        text: `Отстаёт «${lag.name}»: до КП доходит ${lag.quotePct}% комнат при среднем по сети ${avgPct}%.`,
        action: 'Созвонитесь с владельцем: посмотрите вместе воронку и предложите обучение менеджеров.',
      });
    }
  }
  const inactive = rows.filter((r) => r.inactiveDays == null || r.inactiveDays >= L.inactiveDays);
  if (inactive.length) {
    const names = inactive.slice(0, 5).map((r) => `«${r.name}»`).join(', ');
    const more = inactive.length > 5 ? ` и ещё ${inactive.length - 5}` : '';
    conclusions.push({
      id: 'partners_inactive',
      tone: 'bad',
      text: `Без активности ${L.inactiveDays} дней и больше: ${names}${more}.`,
      action: 'Позвоните им: узнайте, нужна ли помощь со входом, обучением или материалами.',
    });
  }
  const withClosed = rows.filter((r) => r.closed >= L.minClosed && r.refusedPct != null);
  if (withClosed.length) {
    const totalClosed = withClosed.reduce((s, r) => s + r.closed, 0);
    const avgRefused = Math.round(withClosed.reduce((s, r) => s + (r.refusedPct * r.closed) / 100, 0) / totalClosed * 100);
    const odd = withClosed.filter((r) => r.refusedPct >= Math.max(50, avgRefused + L.refusalGapPp));
    if (odd.length) {
      conclusions.push({
        id: 'partners_refusals',
        tone: 'bad',
        text: `Много отказов: ${odd.map((r) => `«${r.name}» — ${r.refusedPct}%`).join(', ')} при среднем по сети ${avgRefused}%.`,
        action: 'Посмотрите причины отказов у этих партнёров и разберите их возражения в тренажёре продаж.',
      });
    }
  }
  return { rows, conclusions };
}
