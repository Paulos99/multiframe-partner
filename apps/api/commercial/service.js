/**
 * Сценарии коммерции. Пишет только через репозиторий (YDB или мок).
 */

import {
  acceptDeal,
  advanceAuto,
  applyQuoteDocument,
  assertRole,
  assertRoomCloseable,
  assertSameOrg,
  assertWorkContext,
  checklistComplete,
  closeFulfilledDeal,
  currentRevision,
  declineDeal,
  followUpDeal,
  httpError,
  inInstallPool,
  isDealActive,
  isQuoteFrozen,
  isTechReady,
  pauseDeal,
  planCalculation,
  resumeDeal,
  roomContribution,
  snapshotFromCalcs,
} from '../../../packages/shared/commercialRules.js';

function entity(row) {
  if (!row) return null;
  return { ...row.payload, id: row.id, orgId: row.orgId, recordVersion: row.version };
}

function publicChecklist(items) {
  return (items || []).map((item) => ({
    id: String(item.id),
    title: String(item.title || ''),
    state: item.state === 'done' || item.state === 'na' ? item.state : 'pending',
    reason: item.reason || null,
  }));
}

function publicBlockers(items) {
  return (items || []).map((item) => ({
    id: String(item.id),
    status: item.status === 'resolved' ? 'resolved' : 'open',
    text: String(item.text || ''),
  }));
}

function calcSlot(row) {
  if (!row) return null;
  return { revisionSeq: Number(row.revisionSeq) || 0, amount: Number(row.amount) };
}

function positiveOrNull(value, asInteger) {
  if (value == null || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  return asInteger ? Math.round(number) : Math.round(number * 10) / 10;
}

/** Только картинка чертежа. PDF со сметой сюда не кладём: в нём есть цены. */
function schemeImageOf(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  const ok = text.startsWith('data:image/png;base64,') || text.startsWith('data:image/jpeg;base64,');
  if (!ok || text.length > 700000) return null;
  return text;
}

/** Состав для бригады: чертёж, площадь и количество, без сумм. */
function compositionOf(row) {
  if (!row) return null;
  const schemeImage = schemeImageOf(row.schemeImage);
  return {
    areaM2: positiveOrNull(row.areaM2, false),
    panels: positiveOrNull(row.panels, true),
    dowels: positiveOrNull(row.dowels, true),
    hasScheme: Boolean(row.hasScheme) || Boolean(schemeImage),
    schemeImage,
  };
}

function compositionFrom(body) {
  return compositionOf(body || {});
}

function idemId(scope, key) {
  const raw = String(key || '').trim();
  if (!raw) return '';
  return `${scope}:${raw.slice(0, 200)}`;
}

export function createCommercialService(repo, { uid, now, orgIds = [] }) {
  const at = () => now();

  async function replay(tx, orgId, scope, key) {
    const id = idemId(scope, key);
    if (!id) return null;
    const row = await tx.get(orgId, 'idem', id);
    return row ? row.payload : null;
  }

  async function remember(tx, orgId, scope, key, payload) {
    const id = idemId(scope, key);
    if (!id) return;
    await tx.insert({
      orgId,
      kind: 'idem',
      id,
      projectId: '',
      parentId: '',
      updatedAt: at(),
      payload,
    });
  }

  async function load(tx, orgId, kind, id) {
    const row = await tx.get(orgId, kind, id);
    if (!row) throw httpError(404, 'Не найдено');
    return row;
  }

  function requireMatch(expected) {
    if (expected == null || expected === '') throw httpError(428, 'Нужен заголовок If-Match');
  }

  function guardVersion(row, expected) {
    requireMatch(expected);
    if (Number(expected) !== Number(row.version)) {
      throw httpError(409, 'Конфликт версии', { recordVersion: row.version });
    }
  }

  async function write(tx, row, payload, expected) {
    guardVersion(row, expected);
    payload.recordVersion = Number(row.version) + 1;
    const saved = await tx.update(
      {
        orgId: row.orgId,
        kind: row.kind,
        id: row.id,
        projectId: row.projectId,
        parentId: row.parentId,
        updatedAt: payload.updatedAt || at(),
        payload,
      },
      row.version,
    );
    return entity(saved);
  }

  async function projectRow(tx, user, projectId, legacy) {
    const wanted = String(projectId || '').trim();
    if (!wanted) throw httpError(400, 'Укажите projectId');
    const orgHint = user.role === 'admin' ? legacy?.orgId || user.orgId : user.orgId;
    if (!orgHint) throw httpError(400, 'Нет организации');
    let row = await tx.get(orgHint, 'project', wanted);
    if (!row && legacy && legacy.id === wanted) {
      assertSameOrg(user, legacy.orgId);
      const stamp = at();
      row = await tx.insert({
        orgId: legacy.orgId,
        kind: 'project',
        id: legacy.id,
        projectId: legacy.id,
        parentId: '',
        updatedAt: stamp,
        payload: {
          id: legacy.id,
          orgId: legacy.orgId,
          name: legacy.name || 'Проект',
          clientName: legacy.clientName || '',
          clientPhone: legacy.clientPhone || '',
          address: legacy.address || '',
          city: legacy.city || '',
          createdAt: legacy.createdAt || stamp,
          updatedAt: stamp,
          createdBy: legacy.createdBy || user.id,
          legacy: true,
        },
      });
    }
    if (!row) throw httpError(400, 'Проект не найден');
    assertSameOrg(user, row.orgId);
    return row;
  }

  async function activeDeal(tx, orgId, projectId) {
    const rows = await tx.list({ orgId, kind: 'deal', projectId });
    return rows.map(entity).filter(isDealActive);
  }

  async function dealsOf(tx, user) {
    const orgs = user.role === 'admin' ? orgIds : [user.orgId].filter(Boolean);
    const all = [];
    for (const orgId of orgs) {
      const rows = await tx.list({ orgId, kind: 'deal' });
      all.push(...rows.map(entity));
    }
    return all;
  }

  async function crewInstallDeals(tx, user) {
    const deals = (await tx.list({ orgId: user.orgId, kind: 'deal' })).map(entity);
    const visible = [];
    for (const deal of deals) {
      if (deal.outcome !== 'accepted') continue;
      const rooms = (await tx.list({ orgId: deal.orgId, kind: 'room', projectId: deal.projectId })).map(entity);
      const mine = rooms.filter((room) => room.crewUserId === user.id && (deal.roomAssent || {})[room.id] === 'ordered');
      if (!mine.length) continue;
      visible.push({
        id: deal.id,
        orgId: deal.orgId,
        projectId: deal.projectId,
        recordVersion: deal.recordVersion,
        installRooms: mine.map((room) => ({
          id: room.id,
          roomName: room.roomName || '',
          workStatus: room.workStatus || null,
        })),
      });
    }
    return visible;
  }

  async function rowById(tx, user, kind, id, missing) {
    if (user.role === 'admin') {
      for (const orgId of orgIds) {
        const row = await tx.get(orgId, kind, id);
        if (row) return row;
      }
      throw httpError(404, missing);
    }
    if (!user.orgId) throw httpError(404, missing);
    const row = await tx.get(user.orgId, kind, id);
    if (!row) throw httpError(404, missing);
    return row;
  }

  async function calcsFor(tx, orgId, roomId) {
    const rows = await tx.list({ orgId, kind: 'calc', parentId: roomId });
    return rows.map(entity);
  }

  function blankDeal(user, project, stamp) {
    return {
      id: uid('deal'),
      orgId: project.orgId,
      projectId: project.id,
      stage: 'contact',
      outcome: null,
      stageAtOutcome: null,
      lossReason: null,
      lossComment: null,
      roomAssent: {},
      acceptedAmount: null,
      closedAt: null,
      ownerUserId: user.id,
      assignments: { salesUserId: user.role === 'sales' ? user.id : null, measurerUserId: null, crewUserId: null },
      nextActionAt: null,
      createdAt: stamp,
      updatedAt: stamp,
    };
  }

  async function assertMeasurerRoom(tx, user, room) {
    if (user.role !== 'measurer') return;
    const deals = (await tx.list({ orgId: room.orgId, kind: 'deal', projectId: room.projectId })).map(entity);
    const assigned = deals.some((deal) => deal.assignments?.measurerUserId === user.id);
    if (!assigned) throw httpError(404, 'Комната не найдена');
  }

  async function measurerCards(tx, user) {
    const deals = (await dealsOf(tx, user)).filter((deal) => deal.assignments?.measurerUserId === user.id);
    const out = [];
    for (const deal of deals) {
      const project = entity(await tx.get(deal.orgId, 'project', deal.projectId));
      const quotes = (await tx.list({ orgId: deal.orgId, kind: 'quote', parentId: deal.id })).map(entity);
      const quoteSent = quotes.some((quote) => quote.sentConfirmedAt || quote.lifecycle === 'quote_sent_confirmed');
      const rooms = (await tx.list({ orgId: deal.orgId, kind: 'room', projectId: deal.projectId })).map(entity);
      const cards = [];
      for (const room of rooms) {
        if (room.workStatus === 'closed') continue;
        const calcs = await calcsFor(tx, room.orgId, room.id);
        cards.push({
          id: room.id,
          roomName: room.roomName || '',
          projectId: room.projectId,
          projectName: project?.name || '',
          place: project?.address || '',
          recordVersion: room.recordVersion ?? 1,
          workStatus: room.workStatus || 'draft',
          profileUsable: Boolean(room.profileUsable),
          materialsComplete: Boolean(room.materialsComplete),
          crewUserId: room.crewUserId || null,
          preliminary: calcSlot(currentRevision(calcs, 'preliminary')),
          detailed: calcSlot(currentRevision(calcs, 'detailed')),
          contribution: roomContribution(calcs),
          techReady: isTechReady(room, calcs),
          quoteSent,
          blockers: publicBlockers(room.blockers),
        });
      }
      out.push({
        id: deal.id,
        orgId: deal.orgId,
        projectId: deal.projectId,
        recordVersion: deal.recordVersion ?? 1,
        rooms: cards,
      });
    }
    return out;
  }

  return {
    async listDeals(user) {
      assertRole(user, 'read');
      return repo.transaction(async (tx) => (
        user.role === 'crew' ? crewInstallDeals(tx, user) : dealsOf(tx, user)
      ));
    },

    async getDeal(user, id) {
      assertRole(user, 'read');
      return repo.transaction(async (tx) => {
        if (user.role === 'crew') {
          const deal = (await crewInstallDeals(tx, user)).find((item) => item.id === id);
          if (!deal) throw httpError(404, 'Сделка не найдена');
          return deal;
        }
        if (user.role === 'measurer') {
          const deal = (await measurerCards(tx, user)).find((item) => item.id === id);
          if (!deal) throw httpError(404, 'Сделка не найдена');
          return deal;
        }
        const row = await rowById(tx, user, 'deal', id, 'Сделка не найдена');
        assertSameOrg(user, row.orgId);
        return entity(row);
      });
    },

    async saveDraft(user, body) {
      assertRole(user, 'inquiry');
      assertWorkContext(body, null);
      if (!user.orgId) throw httpError(400, 'Нет организации');
      const draftId = String(body.draftId || body.id || '').trim();
      if (!draftId) throw httpError(400, 'Укажите draftId');
      return repo.transaction(async (tx) => {
        const existing = await tx.get(user.orgId, 'draft', draftId);
        if (existing) return { draft: entity(existing), createdDeal: false };
        const stamp = at();
        const row = await tx.insert({
          orgId: user.orgId,
          kind: 'draft',
          id: draftId,
          projectId: '',
          parentId: '',
          updatedAt: stamp,
          payload: {
            id: draftId,
            orgId: user.orgId,
            label: String(body.label || body.roomName || '').slice(0, 120),
            bound: false,
            createdAt: stamp,
            createdBy: user.id,
          },
        });
        return { draft: entity(row), createdDeal: false };
      });
    },

    async createInquiry(user, body, idempotencyKey) {
      assertRole(user, 'inquiry');
      assertWorkContext(body, null);
      if (!user.orgId) throw httpError(400, 'Нет организации');
      const key = idempotencyKey || body.draftId || body.idempotencyKey;
      if (!key) throw httpError(400, 'Нужен Idempotency-Key или draftId');
      const roomName = String(body.roomName || '').trim();
      const name = String(body.name || body.clientName || roomName || '').trim();
      if (!name || !roomName) throw httpError(400, 'Укажите название проекта и комнату');
      return repo.transaction(async (tx) => {
        const cached = await replay(tx, user.orgId, 'inquiry', key);
        if (cached) return { ...cached.body, replayed: true, status: cached.status };
        const stamp = at();
        const projectId = uid('prj');
        const roomId = uid('room');
        const project = {
          id: projectId,
          orgId: user.orgId,
          name: name.slice(0, 250),
          clientName: String(body.clientName || '').slice(0, 250),
          clientPhone: String(body.clientPhone || '').slice(0, 80),
          address: String(body.address || '').slice(0, 250),
          city: String(body.city || '').slice(0, 120),
          createdAt: stamp,
          updatedAt: stamp,
          createdBy: user.id,
        };
        const room = {
          id: roomId,
          orgId: user.orgId,
          projectId,
          roomName: roomName.slice(0, 120),
          workStatus: 'draft',
          profileUsable: false,
          materialsComplete: false,
          crewUserId: null,
          checklist: [],
          blockers: [],
          createdAt: stamp,
          updatedAt: stamp,
          createdBy: user.id,
        };
        const deal = blankDeal(user, project, stamp);
        await tx.insert({
          orgId: user.orgId, kind: 'project', id: projectId, projectId, parentId: '', updatedAt: stamp, payload: project,
        });
        await tx.insert({
          orgId: user.orgId, kind: 'room', id: roomId, projectId, parentId: projectId, updatedAt: stamp, payload: room,
        });
        await tx.insert({
          orgId: user.orgId, kind: 'deal', id: deal.id, projectId, parentId: projectId, updatedAt: stamp, payload: deal,
        });
        const draft = body.draftId ? await tx.get(user.orgId, 'draft', String(body.draftId)) : null;
        if (draft) {
          await tx.update(
            {
              ...draft,
              updatedAt: stamp,
              payload: { ...draft.payload, bound: true, projectId, dealId: deal.id, updatedAt: stamp },
            },
            draft.version,
          );
        }
        const bodyOut = { project, room, deal, createdDeal: true };
        await remember(tx, user.orgId, 'inquiry', key, { status: 200, body: bodyOut, at: stamp });
        return bodyOut;
      });
    },

    async createDeal(user, body, legacyProject, idempotencyKey) {
      assertRole(user, 'deal.write');
      assertWorkContext(body, null);
      return repo.transaction(async (tx) => {
        const cached = await replay(tx, user.orgId, 'deal', idempotencyKey);
        if (cached) return { ...cached.body, replayed: true };
        const project = entity(await projectRow(tx, user, body.projectId, legacyProject));
        const active = await activeDeal(tx, project.orgId, project.id);
        if (active.length) throw httpError(409, 'На проекте уже есть активная сделка');
        const deal = blankDeal(user, project, at());
        if (body.assignments && typeof body.assignments === 'object') {
          deal.assignments = {
            salesUserId: body.assignments.salesUserId || null,
            measurerUserId: body.assignments.measurerUserId || null,
            crewUserId: body.assignments.crewUserId || null,
          };
        }
        const row = await tx.insert({
          orgId: project.orgId,
          kind: 'deal',
          id: deal.id,
          projectId: project.id,
          parentId: project.id,
          updatedAt: deal.updatedAt,
          payload: deal,
        });
        const saved = entity(row);
        await remember(tx, project.orgId, 'deal', idempotencyKey, { status: 200, body: { deal: saved } });
        return { deal: saved };
      });
    },

    async mutateDeal(user, id, action, body, expected) {
      assertWorkContext(body, null);
      const writers = {
        pause: 'deal.outcome',
        resume: 'deal.outcome',
        decline: 'deal.outcome',
        accept: 'deal.outcome',
        follow: 'deal.outcome',
        close: 'deal.close',
        patch: 'deal.write',
      };
      assertRole(user, writers[action]);
      requireMatch(expected);
      return repo.transaction(async (tx) => {
        const row = await rowById(tx, user, 'deal', id, 'Сделка не найдена');
        assertSameOrg(user, row.orgId);
        const deal = entity(row);
        const stamp = at();
        if (action === 'patch') {
          if (body.outcome || body.stage || body.roomAssent || body.closedAt) {
            throw httpError(400, 'Исход, стадия и согласие фиксируются отдельным действием');
          }
          const next = {
            ...deal,
            assignments: body.assignments ? { ...deal.assignments, ...body.assignments } : deal.assignments,
            nextActionAt: body.nextActionAt !== undefined ? body.nextActionAt : deal.nextActionAt,
            updatedAt: stamp,
          };
          return { deal: await write(tx, row, next, expected) };
        }
        const quotes = (await tx.list({ orgId: row.orgId, kind: 'quote', parentId: deal.id })).map(entity);
        const frozen = quotes.some(isQuoteFrozen);
        let next = deal;
        if (action === 'pause') {
          next = pauseDeal(deal, {
            reason: body.lossReason || body.reason,
            comment: body.lossComment || body.comment || null,
            nextActionAt: body.nextActionAt || null,
            at: stamp,
          });
        } else if (action === 'resume') {
          next = resumeDeal(deal, stamp);
        } else if (action === 'decline') {
          next = declineDeal(deal, {
            reason: body.lossReason || body.reason,
            comment: body.lossComment || body.comment || null,
            early: body.outcome === 'early_declined' || !frozen,
            at: stamp,
          });
        } else if (action === 'accept') {
          const quote = [...quotes].filter(isQuoteFrozen).sort((a, b) => a.version - b.version).pop();
          if (!quote) throw httpError(409, 'Сначала подтвердите отправку КП');
          next = acceptDeal(deal, quote, body.roomAssent, stamp);
        } else if (action === 'follow') {
          next = followUpDeal(deal, {
            outcome: body.outcome,
            nextActionAt: body.nextActionAt || null,
            close: Boolean(body.close),
            at: stamp,
          });
        } else if (action === 'close') {
          const rooms = (await tx.list({ orgId: row.orgId, kind: 'room', projectId: deal.projectId })).map(entity);
          next = closeFulfilledDeal(deal, rooms, stamp);
        }
        if (next.closedAt && action === 'pause') throw httpError(409, 'Пауза не закрывает сделку');
        return { deal: await write(tx, row, next, expected) };
      });
    },

    async listQuotes(user, dealId) {
      assertRole(user, 'read');
      return repo.transaction(async (tx) => {
        const orgs = user.role === 'admin' ? orgIds : [user.orgId].filter(Boolean);
        const rows = [];
        for (const orgId of orgs) {
          const part = dealId
            ? await tx.list({ orgId, kind: 'quote', parentId: dealId })
            : await tx.list({ orgId, kind: 'quote' });
          rows.push(...part);
        }
        return rows.map(entity);
      });
    },

    async createQuote(user, body, legacyProject) {
      assertRole(user, 'quote.write');
      assertWorkContext(body, null);
      return repo.transaction(async (tx) => {
        const cached = await replay(tx, user.orgId, 'quote', body.idempotencyKey);
        if (cached) return { ...cached.body, replayed: true };
        const project = entity(await projectRow(tx, user, body.projectId, legacyProject));
        let dealId = String(body.dealId || '').trim();
        if (!dealId) {
          const active = await activeDeal(tx, project.orgId, project.id);
          if (active.length !== 1) throw httpError(400, 'Укажите сделку');
          dealId = active[0].id;
        }
        const dealRow = await load(tx, project.orgId, 'deal', dealId);
        if (dealRow.projectId !== project.id) throw httpError(400, 'Сделка другого проекта');
        let deal = entity(dealRow);
        if (!isDealActive(deal)) throw httpError(409, 'Сделка закрыта');
        const roomIds = Array.isArray(body.roomObjectIds) ? body.roomObjectIds.map(String) : [];
        const calcsByRoom = {};
        let anyCalc = false;
        for (const roomId of roomIds) {
          calcsByRoom[roomId] = await calcsFor(tx, project.orgId, roomId);
          if (calcsByRoom[roomId].length) anyCalc = true;
        }
        let snapshot;
        let amount;
        if (roomIds.length && anyCalc) {
          snapshot = snapshotFromCalcs(roomIds, calcsByRoom);
          amount = snapshot.amount;
        } else {
          snapshot = {
            lines: roomIds.map((roomId) => ({
              roomId,
              calcType: 'unspecified',
              calculationId: null,
              revisionSeq: null,
              amount: null,
            })),
            legacyTotal: true,
          };
          amount = body.amount != null && Number.isFinite(Number(body.amount)) ? Number(body.amount) : null;
        }
        const siblings = await tx.list({ orgId: project.orgId, kind: 'quote', parentId: deal.id });
        const version = siblings.reduce((max, row) => Math.max(max, Number(row.payload.version) || 0), 0) + 1;
        const stamp = at();
        const quote = {
          id: uid('qr'),
          orgId: project.orgId,
          projectId: project.id,
          dealId: deal.id,
          version,
          pdfStorageKey: null,
          amount,
          roomObjectIds: roomIds,
          snapshot,
          createdAt: stamp,
          createdBy: user.id,
          sharedAt: null,
          sentConfirmedAt: null,
          sentComment: null,
          lifecycle: 'quote_created',
          frozen: false,
        };
        const saved = entity(await tx.insert({
          orgId: project.orgId,
          kind: 'quote',
          id: quote.id,
          projectId: project.id,
          parentId: deal.id,
          updatedAt: stamp,
          payload: quote,
        }));
        deal = advanceAuto(deal, 'quote_created', stamp);
        await write(tx, dealRow, deal, dealRow.version);
        const out = { quote: saved };
        await remember(tx, project.orgId, 'quote', body.idempotencyKey, { status: 200, body: out });
        return out;
      });
    },

    async quoteAction(user, id, action, body, expected) {
      assertWorkContext(body, null);
      if (action === 'confirm_sent') assertRole(user, 'quote.confirm');
      else assertRole(user, 'quote.write');
      requireMatch(expected);
      return repo.transaction(async (tx) => {
        const row = await rowById(tx, user, 'quote', id, 'КП не найдено');
        const quote = entity(row);
        assertSameOrg(user, quote.orgId);
        const stamp = at();
        if (action === 'replace') throw httpError(409, 'Отправленная версия не меняется. Создайте версию N+1');
        const applied = applyQuoteDocument(quote, action, stamp);
        let next = applied.quote;
        if (action === 'confirm_sent' && applied.changed && body?.comment != null) {
          next = { ...next, sentComment: String(body.comment).slice(0, 500) };
        }
        const dealRow = await load(tx, quote.orgId, 'deal', quote.dealId);
        let deal = entity(dealRow);
        if (action === 'confirm_sent' && deal.outcome === 'early_paused') {
          throw httpError(409, 'Сделка на паузе');
        }
        if (applied.changed || (action === 'confirm_sent' && body?.comment != null && !isQuoteFrozen(quote))) {
          next = await write(tx, row, { ...next, updatedAt: stamp }, expected);
        } else {
          guardVersion(row, expected);
          next = quote;
        }
        if (action === 'share') deal = advanceAuto(deal, 'quote_shared', stamp);
        if (action === 'confirm_sent') deal = advanceAuto(deal, 'quote_sent_confirmed', stamp);
        if (deal !== entity(dealRow) && deal.updatedAt === stamp) await write(tx, dealRow, deal, dealRow.version);
        return { quote: next, lifecycleUnchanged: action === 'copy_text' || action === 'generate_pdf' };
      });
    },

    async saveCalculation(user, roomId, body, idempotencyKey) {
      assertRole(user, 'calc.write');
      assertWorkContext(body, null);
      return repo.transaction(async (tx) => {
        const roomRow = await rowById(tx, user, 'room', roomId, 'Комната не найдена');
        await assertMeasurerRoom(tx, user, entity(roomRow));
        const cached = await replay(tx, user.orgId, 'calc', idempotencyKey);
        if (cached) return cached;
        const existing = await calcsFor(tx, roomRow.orgId, roomId);
        const plan = planCalculation(existing, {
          calcType: body.type || body.calcType,
          amount: body.amount,
          expectedRevision: body.expectedRevision,
          baseRevisionId: body.baseRevisionId || null,
          savedBy: user.id,
          savedAt: at(),
        });
        const stamp = plan.saved.savedAt;
        const saved = {
          ...plan.saved,
          ...compositionFrom(body),
          id: uid('calc'),
          orgId: roomRow.orgId,
          roomId,
          projectId: roomRow.projectId,
        };
        await tx.insert({
          orgId: roomRow.orgId,
          kind: 'calc',
          id: saved.id,
          projectId: roomRow.projectId,
          parentId: roomId,
          updatedAt: stamp,
          payload: saved,
        });
        const active = await activeDeal(tx, roomRow.orgId, roomRow.projectId);
        if (active.length === 1) {
          const dealRow = await load(tx, roomRow.orgId, 'deal', active[0].id);
          const deal = advanceAuto(entity(dealRow), 'calculated', stamp);
          if (deal.updatedAt === stamp) await write(tx, dealRow, deal, dealRow.version);
        }
        const contribution = roomContribution([...existing, saved]);
        const result = plan.conflict
          ? {
            status: 409,
            body: {
              message: 'Конфликт версии расчёта',
              saved,
              current: plan.current,
              contribution,
            },
          }
          : { status: 200, body: { calculation: saved, contribution } };
        await remember(tx, roomRow.orgId, 'calc', idempotencyKey, result);
        return result;
      });
    },

    async saveProfile(user, roomId, body, expected) {
      assertRole(user, 'calc.write');
      assertWorkContext(body, null);
      requireMatch(expected);
      return repo.transaction(async (tx) => {
        const roomRow = await rowById(tx, user, 'room', roomId, 'Комната не найдена');
        await assertMeasurerRoom(tx, user, entity(roomRow));
        const stamp = at();
        const room = {
          ...entity(roomRow),
          profileUsable: Boolean(body.usable),
          updatedAt: stamp,
        };
        const saved = await write(tx, roomRow, room, expected);
        if (body.usable) {
          const active = await activeDeal(tx, roomRow.orgId, roomRow.projectId);
          if (active.length === 1) {
            const dealRow = await load(tx, roomRow.orgId, 'deal', active[0].id);
            const deal = advanceAuto(entity(dealRow), 'assessed', stamp);
            if (deal.updatedAt === stamp) await write(tx, dealRow, deal, dealRow.version);
          }
        }
        return { room: saved };
      });
    },

    async setReadiness(user, roomId, body, expected) {
      assertRole(user, 'readiness');
      requireMatch(expected);
      return repo.transaction(async (tx) => {
        const roomRow = await rowById(tx, user, 'room', roomId, 'Комната не найдена');
        await assertMeasurerRoom(tx, user, entity(roomRow));
        const stamp = at();
        const room = {
          ...entity(roomRow),
          materialsComplete: body.materialsComplete != null ? Boolean(body.materialsComplete) : entity(roomRow).materialsComplete,
          crewUserId: body.crewUserId !== undefined ? body.crewUserId || null : entity(roomRow).crewUserId,
          updatedAt: stamp,
        };
        const calcs = await calcsFor(tx, room.orgId, room.id);
        if (isTechReady(room, calcs) && room.workStatus !== 'closed') room.workStatus = 'tech_ready';
        return { room: await write(tx, roomRow, room, expected), techReady: isTechReady(room, calcs) };
      });
    },

    async setChecklist(user, roomId, body, expected) {
      assertRole(user, 'checklist.write');
      requireMatch(expected);
      const items = Array.isArray(body.items) ? body.items : null;
      if (!items) throw httpError(400, 'Укажите пункты чек-листа');
      return repo.transaction(async (tx) => {
        const roomRow = await rowById(tx, user, 'room', roomId, 'Комната не найдена');
        await assertMeasurerRoom(tx, user, entity(roomRow));
        const room = {
          ...entity(roomRow),
          checklist: items.map((item) => ({
            id: String(item.id || uid('chk')),
            title: String(item.title || '').slice(0, 200),
            state: item.state === 'done' || item.state === 'na' ? item.state : 'pending',
            reason: item.reason ? String(item.reason).slice(0, 300) : null,
          })),
          updatedAt: at(),
        };
        return { room: await write(tx, roomRow, room, expected), complete: checklistComplete(room.checklist) };
      });
    },

    async openBlocker(user, roomId, body, expected) {
      assertRole(user, 'blocker.open');
      requireMatch(expected);
      const text = String(body.text || '').trim();
      if (!text) throw httpError(400, 'Опишите препятствие');
      return repo.transaction(async (tx) => {
        const roomRow = await rowById(tx, user, 'room', roomId, 'Комната не найдена');
        await assertMeasurerRoom(tx, user, entity(roomRow));
        const room = entity(roomRow);
        const blocker = { id: uid('blk'), status: 'open', text: text.slice(0, 500), openedAt: at(), openedBy: user.id };
        room.blockers = [...(room.blockers || []), blocker];
        if (room.workStatus !== 'closed') room.workStatus = 'blocked';
        room.updatedAt = blocker.openedAt;
        return { blocker, room: await write(tx, roomRow, room, expected) };
      });
    },

    async resolveBlocker(user, roomId, blockerId, expected) {
      assertRole(user, 'blocker.resolve');
      requireMatch(expected);
      return repo.transaction(async (tx) => {
        const roomRow = await rowById(tx, user, 'room', roomId, 'Комната не найдена');
        await assertMeasurerRoom(tx, user, entity(roomRow));
        const room = entity(roomRow);
        const blocker = (room.blockers || []).find((item) => item.id === blockerId);
        if (!blocker) throw httpError(404, 'Препятствие не найдено');
        blocker.status = 'resolved';
        blocker.resolvedAt = at();
        blocker.resolvedBy = user.id;
        if (!(room.blockers || []).some((item) => item.status === 'open') && room.workStatus === 'blocked') {
          const calcs = await calcsFor(tx, room.orgId, room.id);
          room.workStatus = isTechReady(room, calcs) ? 'tech_ready' : 'draft';
        }
        room.updatedAt = blocker.resolvedAt;
        return { room: await write(tx, roomRow, room, expected) };
      });
    },

    async closeRoom(user, roomId, expected) {
      assertRole(user, 'room.close');
      requireMatch(expected);
      return repo.transaction(async (tx) => {
        const roomRow = await rowById(tx, user, 'room', roomId, 'Комната не найдена');
        const room = entity(roomRow);
        if (user.role === 'crew' && room.crewUserId !== user.id) throw httpError(403, 'Недостаточно прав');
        const deals = (await tx.list({ orgId: room.orgId, kind: 'deal', projectId: room.projectId })).map(entity);
        const deal = deals.find(isDealActive);
        const calcs = await calcsFor(tx, room.orgId, room.id);
        if (!deal || !inInstallPool(deal, room, calcs)) {
          throw httpError(409, 'В монтаж попадают только заказанные и технически готовые комнаты');
        }
        assertRoomCloseable(room);
        const stamp = at();
        room.workStatus = 'closed';
        room.updatedAt = stamp;
        const saved = await write(tx, roomRow, room, expected);
        const still = entity(await load(tx, deal.orgId, 'deal', deal.id));
        return { room: saved, dealClosed: Boolean(still.closedAt), dealId: still.id };
      });
    },

    async measurerWork(user) {
      assertRole(user, 'read');
      if (user.role !== 'measurer') throw httpError(403, 'Недостаточно прав');
      return repo.transaction(async (tx) => measurerCards(tx, user));
    },

    async installInbox(user) {
      assertRole(user, 'read');
      if (user.role === 'measurer') throw httpError(403, 'Недостаточно прав');
      return repo.transaction(async (tx) => {
        const deals = (await dealsOf(tx, user)).filter((deal) => deal.outcome === 'accepted');
        const rooms = [];
        for (const deal of deals) {
          const project = entity(await tx.get(deal.orgId, 'project', deal.projectId));
          const list = (await tx.list({ orgId: deal.orgId, kind: 'room', projectId: deal.projectId })).map(entity);
          for (const room of list) {
            if (room.workStatus === 'closed') continue;
            if (user.role === 'crew' && room.crewUserId !== user.id) continue;
            const calcs = await calcsFor(tx, room.orgId, room.id);
            if (!inInstallPool(deal, room, calcs)) continue;
            const detailed = currentRevision(calcs, 'detailed');
            rooms.push({
              id: room.id,
              projectId: room.projectId,
              dealId: deal.id,
              roomName: room.roomName,
              projectName: project?.name || '',
              place: project?.address || '',
              workStatus: room.workStatus,
              crewUserId: room.crewUserId,
              recordVersion: room.recordVersion ?? 1,
              materialsComplete: Boolean(room.materialsComplete),
              checklist: publicChecklist(room.checklist),
              blockers: publicBlockers(room.blockers),
              composition: compositionOf(detailed),
            });
          }
        }
        return rooms;
      });
    },
  };
}
