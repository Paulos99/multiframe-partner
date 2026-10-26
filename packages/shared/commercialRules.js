/**
 * Доменные правила сделки, КП, расчёта и монтажа.
 * Чистые функции: без YDB, без JSON-файла, без сети.
 * Утверждено Gate B (A-06, A-09, A-11, A-12, Pause, M-assent) и концепция 1.0.
 */

export function httpError(status, message, fields) {
  return Object.assign(new Error(message), { status, ...(fields || {}) });
}

const AUTO_STAGES = new Set([
  'assessed',
  'calculated',
  'quote_created',
  'quote_shared',
  'quote_sent_confirmed',
]);

const STAGE_RANK = {
  contact: 0,
  offered: 1,
  assessed: 2,
  calculated: 3,
  quote_created: 4,
  quote_shared: 5,
  quote_sent_confirmed: 6,
  quote_accepted: 7,
  quote_declined: 7,
  quote_postponed: 7,
  install: 8,
  closed: 9,
};

export const LOSS_REASONS = [
  'expensive',
  'no_need',
  'doubts_efficacy',
  'chose_other',
  'postponed_repair',
  'technical',
  'other',
  'unknown',
];

const WRITE_ROLES = {
  inquiry: ['owner', 'sales', 'measurer'],
  'deal.write': ['owner', 'sales', 'measurer'],
  'deal.outcome': ['owner', 'sales'],
  'deal.close': ['owner', 'sales'],
  'quote.write': ['owner', 'sales', 'measurer'],
  'quote.confirm': ['owner', 'sales'],
  'calc.write': ['owner', 'sales', 'measurer'],
  readiness: ['owner', 'sales', 'measurer'],
  'checklist.write': ['owner', 'sales', 'measurer', 'crew'],
  'blocker.open': ['owner', 'sales', 'measurer', 'crew'],
  'blocker.resolve': ['owner', 'sales', 'measurer'],
  'room.close': ['owner', 'sales', 'crew'],
};

export function assertRole(user, action) {
  if (!user) throw httpError(401, 'Нужна авторизация');
  if (action === 'read') {
    if (['admin', 'owner', 'sales', 'measurer', 'crew'].includes(user.role)) return;
    throw httpError(403, 'Недостаточно прав');
  }
  if (user.role === 'admin') throw httpError(403, 'Недостаточно прав');
  const allowed = WRITE_ROLES[action];
  if (!allowed || !allowed.includes(user.role)) throw httpError(403, 'Недостаточно прав');
}

export function assertSameOrg(user, orgId) {
  if (user.role === 'admin') return;
  if (!user.orgId || user.orgId !== orgId) throw httpError(404, 'Не найдено');
}

export function assertWorkContext(body, headerValue) {
  const ctx = (body && body.context) || headerValue || 'work';
  if (ctx === 'training' || ctx === 'demo') {
    throw httpError(400, 'Учебные и демо-данные не создают рабочую сделку');
  }
}

export function isDealActive(deal) {
  return Boolean(deal) && !deal.closedAt;
}

export function advanceAuto(deal, target, at) {
  if (!deal || deal.closedAt) return deal;
  if (deal.outcome === 'early_paused') return deal;
  if (!AUTO_STAGES.has(target)) return deal;
  if ((STAGE_RANK[deal.stage] ?? 0) >= (STAGE_RANK[target] ?? 0)) return deal;
  return { ...deal, stage: target, updatedAt: at };
}

function requireReason(reason) {
  if (!reason || !LOSS_REASONS.includes(reason)) {
    throw httpError(400, 'Укажите причину из справочника');
  }
}

export function pauseDeal(deal, { reason, comment, nextActionAt, at }) {
  if (!isDealActive(deal)) throw httpError(409, 'Сделка закрыта');
  if (deal.outcome === 'accepted' || deal.outcome === 'declined' || deal.outcome === 'early_declined') {
    throw httpError(409, 'Исход уже зафиксирован');
  }
  requireReason(reason);
  return {
    ...deal,
    outcome: 'early_paused',
    stageAtOutcome: deal.stage,
    lossReason: reason,
    lossComment: comment || null,
    nextActionAt: nextActionAt || null,
    closedAt: null,
    updatedAt: at,
  };
}

export function resumeDeal(deal, at) {
  if (deal.closedAt) throw httpError(409, 'Закрытую сделку нельзя возобновить');
  if (deal.outcome !== 'early_paused') throw httpError(409, 'Сделка не на паузе');
  return {
    ...deal,
    outcome: null,
    stage: deal.stageAtOutcome || deal.stage,
    stageAtOutcome: null,
    lossReason: null,
    lossComment: null,
    updatedAt: at,
  };
}

export function declineDeal(deal, { reason, comment, early, at }) {
  if (!isDealActive(deal)) throw httpError(409, 'Сделка закрыта');
  requireReason(reason);
  return {
    ...deal,
    outcome: early ? 'early_declined' : 'declined',
    stageAtOutcome: deal.stage,
    stage: 'closed',
    lossReason: reason,
    lossComment: comment || null,
    closedAt: at,
    updatedAt: at,
  };
}

export function followUpDeal(deal, { outcome, nextActionAt, close, at }) {
  if (outcome !== 'postponed' && outcome !== 'no_response') {
    throw httpError(400, 'Ожидается postponed или no_response');
  }
  if (!isDealActive(deal)) throw httpError(409, 'Сделка закрыта');
  if (close) {
    return {
      ...deal,
      outcome,
      stageAtOutcome: deal.stage,
      stage: 'closed',
      nextActionAt: nextActionAt || null,
      closedAt: at,
      updatedAt: at,
    };
  }
  return {
    ...deal,
    outcome,
    nextActionAt: nextActionAt || null,
    closedAt: null,
    updatedAt: at,
  };
}

function lineAmount(line) {
  return line && line.amount != null && Number.isFinite(Number(line.amount)) ? Number(line.amount) : null;
}

export function sumOrdered(quote, assent) {
  const lines = quote?.snapshot?.lines || [];
  const orderedIds = Object.entries(assent).filter(([, value]) => value === 'ordered').map(([id]) => id);
  if (!orderedIds.length) throw httpError(400, 'Нужна хотя бы одна заказанная комната');
  const seen = new Set();
  let sum = 0;
  let priced = 0;
  for (const line of lines) {
    if (seen.has(line.roomId)) throw httpError(400, 'Комната указана в КП дважды');
    seen.add(line.roomId);
    if (assent[line.roomId] !== 'ordered') continue;
    const amount = lineAmount(line);
    if (amount == null) continue;
    sum += amount;
    priced += 1;
  }
  if (priced === orderedIds.length) return sum;
  const allOrdered = lines.length > 0 && lines.every((line) => assent[line.roomId] === 'ordered');
  if (allOrdered && quote.amount != null && Number.isFinite(Number(quote.amount))) return Number(quote.amount);
  throw httpError(400, 'Для частичного согласия нужны суммы по комнатам');
}

export function acceptDeal(deal, quote, assentInput, at) {
  if (!isDealActive(deal)) throw httpError(409, 'Сделка закрыта');
  const lines = quote?.snapshot?.lines || [];
  const roomIds = lines.map((line) => line.roomId).filter(Boolean);
  if (!roomIds.length) throw httpError(400, 'Нужна хотя бы одна заказанная комната');
  /** @type {Record<string, string>} */
  const assent = {};
  if (assentInput && typeof assentInput === 'object') {
    for (const id of roomIds) {
      const value = assentInput[id];
      if (value !== 'ordered' && value !== 'deferred' && value !== 'out_of_scope') {
        throw httpError(400, 'Для каждой комнаты КП укажите ordered, deferred или out_of_scope');
      }
      assent[id] = value;
    }
  } else {
    for (const id of roomIds) assent[id] = 'ordered';
  }
  const amount = sumOrdered(quote, assent);
  return {
    ...deal,
    outcome: 'accepted',
    stage: 'quote_accepted',
    roomAssent: assent,
    acceptedAmount: amount,
    closedAt: null,
    lossReason: null,
    lossComment: null,
    stageAtOutcome: null,
    updatedAt: at,
  };
}

export function closeFulfilledDeal(deal, rooms, at) {
  if (!isDealActive(deal)) throw httpError(409, 'Сделка уже закрыта');
  if (deal.outcome !== 'accepted') throw httpError(409, 'Закрытие после монтажа только для принятой сделки');
  const ordered = (rooms || []).filter((room) => deal.roomAssent?.[room.id] === 'ordered');
  if (!ordered.length) throw httpError(409, 'Нет заказанных комнат');
  if (ordered.some((room) => room.workStatus !== 'closed')) {
    throw httpError(409, 'Не все заказанные комнаты смонтированы');
  }
  if (ordered.some((room) => (room.blockers || []).some((item) => item.status === 'open'))) {
    throw httpError(409, 'Есть открытое препятствие');
  }
  return { ...deal, stage: 'closed', closedAt: at, updatedAt: at, outcome: 'accepted' };
}

export function currentRevision(calcs, calcType) {
  const rows = (calcs || []).filter((row) => row.calcType === calcType && !row.divergent);
  rows.sort((a, b) => Number(a.revisionSeq) - Number(b.revisionSeq));
  return rows.length ? rows[rows.length - 1] : null;
}

export function roomContribution(calcs) {
  const detailed = currentRevision(calcs, 'detailed');
  if (detailed) {
    return { calcType: 'detailed', amount: Number(detailed.amount), calculationId: detailed.id };
  }
  const preliminary = currentRevision(calcs, 'preliminary');
  if (preliminary) {
    return { calcType: 'preliminary', amount: Number(preliminary.amount), calculationId: preliminary.id };
  }
  return null;
}

export function snapshotFromCalcs(roomIds, calcsByRoom) {
  const lines = [];
  for (const roomId of roomIds) {
    const chosen = roomContribution(calcsByRoom[roomId] || []);
    if (!chosen) throw httpError(400, 'Нет расчёта комнаты');
    const current = currentRevision(calcsByRoom[roomId] || [], chosen.calcType);
    lines.push({
      roomId,
      calcType: chosen.calcType,
      calculationId: chosen.calculationId,
      revisionSeq: current ? current.revisionSeq : null,
      amount: chosen.amount,
    });
  }
  return {
    lines,
    amount: lines.reduce((sum, line) => sum + Number(line.amount || 0), 0),
    legacyTotal: false,
  };
}

export function planCalculation(existing, input) {
  if (input.calcType !== 'preliminary' && input.calcType !== 'detailed') {
    throw httpError(400, 'Тип расчёта: preliminary или detailed');
  }
  if (input.amount == null || !Number.isFinite(Number(input.amount))) {
    throw httpError(400, 'Укажите сумму расчёта');
  }
  const current = currentRevision(existing, input.calcType);
  const currentSeq = current ? Number(current.revisionSeq) : 0;
  const expected = input.expectedRevision;
  const hasExpected = expected != null && expected !== '';
  const mismatch = current
    ? !hasExpected || Number(expected) !== currentSeq
    : hasExpected && Number(expected) !== 0;
  const maxSeq = (existing || []).reduce((max, row) => Math.max(max, Number(row.revisionSeq) || 0), 0);
  const saved = {
    calcType: input.calcType,
    amount: Number(input.amount),
    savedBy: input.savedBy || null,
    savedAt: input.savedAt,
    revisionSeq: mismatch ? maxSeq + 1 : currentSeq + 1,
    divergent: Boolean(mismatch),
    conflictWith: mismatch ? current?.id || null : null,
    baseRevisionId: mismatch ? input.baseRevisionId || null : current?.id || null,
  };
  return { conflict: Boolean(mismatch), saved, current };
}

export function isQuoteFrozen(quote) {
  return Boolean(quote?.sentConfirmedAt) || quote?.lifecycle === 'quote_sent_confirmed';
}

export function applyQuoteDocument(quote, action, at) {
  if (action === 'copy_text' || action === 'generate_pdf') {
    return { quote, changed: false };
  }
  if (action === 'share') {
    if (isQuoteFrozen(quote)) return { quote, changed: false };
    const lifecycle = quote.lifecycle === 'quote_created' ? 'quote_shared' : quote.lifecycle;
    return {
      quote: { ...quote, lifecycle, sharedAt: quote.sharedAt || at },
      changed: lifecycle !== quote.lifecycle || !quote.sharedAt,
    };
  }
  if (action === 'confirm_sent') {
    if (isQuoteFrozen(quote)) return { quote, changed: false, idempotent: true };
    return {
      quote: {
        ...quote,
        lifecycle: 'quote_sent_confirmed',
        sentConfirmedAt: at,
        frozen: true,
      },
      changed: true,
    };
  }
  throw httpError(400, 'Неизвестное действие с КП');
}

export function isTechReady(room, calcs) {
  if (!room) return false;
  if (!currentRevision(calcs, 'detailed')) return false;
  if (!room.materialsComplete) return false;
  if (!room.crewUserId) return false;
  return true;
}

export function inInstallPool(deal, room, calcs) {
  if (!deal || deal.outcome !== 'accepted') return false;
  if (deal.roomAssent?.[room.id] !== 'ordered') return false;
  return isTechReady(room, calcs);
}

export function checklistComplete(items) {
  if (!Array.isArray(items) || !items.length) return false;
  return items.every((item) => {
    if (item.state === 'done') return true;
    if (item.state === 'na') return Boolean(String(item.reason || '').trim());
    return false;
  });
}

export function assertRoomCloseable(room) {
  if (!checklistComplete(room.checklist)) throw httpError(409, 'Чек-лист не заполнен');
  if ((room.blockers || []).some((item) => item.status === 'open')) {
    throw httpError(409, 'Есть открытое препятствие');
  }
}

function quoteSent(quote) {
  return Boolean(quote?.sentConfirmedAt) || quote?.lifecycle === 'quote_sent_confirmed' || quote?.lifecycle === 'sent';
}

function latestSent(quotes) {
  return [...(quotes || [])]
    .filter(quoteSent)
    .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')))
    .pop() || null;
}

/**
 * Ленивое сопоставление legacy JobObject/Project/Deal/Quote.
 * Ничего не записывает. quote_sent не становится согласием.
 * @param {{ projects?: any[], objects?: any[], deals?: any[], quotes?: any[] }} snapshot
 */
export function migrateLegacyCommercial(snapshot) {
  const projects = snapshot.projects || [];
  const objects = snapshot.objects || [];
  const deals = snapshot.deals || [];
  const quotes = snapshot.quotes || [];
  const dealsByProject = new Map();
  for (const deal of deals) {
    const list = dealsByProject.get(deal.projectId) || [];
    list.push(deal);
    dealsByProject.set(deal.projectId, list);
  }

  const migratedQuotes = quotes.map((quote) => {
    const next = { ...quote, legacy: { lifecycle: quote.lifecycle, dealId: quote.dealId ?? null } };
    if (next.dealId) return next;
    const siblings = dealsByProject.get(quote.projectId) || [];
    if (siblings.length === 1) {
      next.dealId = siblings[0].id;
      next.dealIdBackfill = 'single_deal';
      return next;
    }
    next.migration = 'needs_review';
    return next;
  });

  const byDeal = new Map();
  for (const quote of migratedQuotes) {
    if (!quote.dealId || quote.migration === 'needs_review') continue;
    const list = byDeal.get(quote.dealId) || [];
    list.push(quote);
    byDeal.set(quote.dealId, list);
  }
  for (const list of byDeal.values()) {
    list.sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
    list.forEach((quote, index) => {
      quote.version = index + 1;
    });
  }

  const migratedDeals = deals.map((deal) => {
    const rooms = objects.filter((room) => room.projectId === deal.projectId);
    const related = (byDeal.get(deal.id) || []).slice();
    const sent = latestSent(related);
    const inQuote = new Set(sent?.roomObjectIds || []);
    const evidence = deal.evidence || null;
    const accepted = deal.outcome === 'accepted' || deal.stage === 'quote_accepted';
    const declined =
      deal.outcome === 'declined' ||
      deal.outcome === 'early_declined' ||
      deal.stage === 'quote_declined';
    /** @type {Record<string, string>} */
    const roomAssent = {};
    let acceptedAmount = 0;
    let includeInAmount = false;

    if (declined) {
      for (const room of rooms) roomAssent[room.id] = 'out_of_scope';
    } else if (!accepted) {
      for (const room of rooms) {
        if (inQuote.has(room.id) || room.status === 'quote_sent') roomAssent[room.id] = 'unknown';
      }
    } else {
      const orderedIds = Array.isArray(evidence?.orderedRoomIds) ? evidence.orderedRoomIds : null;
      const vague = Boolean(evidence?.note) && !orderedIds;
      if (!orderedIds || vague) {
        for (const room of rooms) {
          if (!sent || inQuote.has(room.id)) roomAssent[room.id] = 'needs_review';
        }
        for (const id of inQuote) roomAssent[id] = 'needs_review';
      } else {
        const deferred = new Set(evidence.deferredRoomIds || []);
        const outside = new Set(evidence.outOfScopeRoomIds || []);
        includeInAmount = true;
        for (const room of rooms) {
          if (orderedIds.includes(room.id)) roomAssent[room.id] = 'ordered';
          else if (deferred.has(room.id)) roomAssent[room.id] = 'deferred';
          else if (outside.has(room.id)) roomAssent[room.id] = 'out_of_scope';
          else if (inQuote.has(room.id)) roomAssent[room.id] = 'needs_review';
        }
        for (const id of orderedIds) {
          if (!roomAssent[id]) roomAssent[id] = 'ordered';
        }
        const lineByRoom = new Map((sent?.snapshot?.lines || []).map((line) => [line.roomId, line]));
        for (const [id, value] of Object.entries(roomAssent)) {
          if (value !== 'ordered') continue;
          const line = lineByRoom.get(id);
          if (line && line.amount != null) acceptedAmount += Number(line.amount);
          else includeInAmount = false;
        }
        if (!includeInAmount) acceptedAmount = null;
      }
    }

    const terminal = declined || deal.stage === 'closed' || Boolean(deal.closedAt);
    return {
      ...deal,
      roomAssent,
      acceptedAmount: includeInAmount ? acceptedAmount : null,
      closedAt: terminal ? deal.closedAt || deal.updatedAt || deal.createdAt || null : null,
      legacy: {
        outcome: deal.outcome ?? null,
        stage: deal.stage,
        jobQuoteSent: rooms.some((room) => room.status === 'quote_sent'),
      },
    };
  });

  return {
    projects,
    rooms: objects,
    deals: migratedDeals,
    quotes: migratedQuotes,
  };
}

export function installPoolFromMigration(deal, rooms) {
  if (deal.outcome !== 'accepted' || deal.closedAt) return [];
  return (rooms || []).filter((room) => deal.roomAssent?.[room.id] === 'ordered').map((room) => room.id);
}
