/**
 * HTTP-контракт коммерции. Права проверяются в сервисе, не скрытием кнопок.
 */

import { getCommercialRepository } from '../commercial/repository.js';
import { createCommercialService } from '../commercial/service.js';

function ifMatch(raw) {
  if (raw == null || String(raw).trim() === '') return null;
  const text = String(raw).trim().replace(/^W\//i, '').replace(/^"|"$/g, '');
  return /^\d+$/.test(text) ? Number(text) : null;
}

function publicDeal(deal, role) {
  if (role === 'crew') {
    return {
      id: deal.id,
      orgId: deal.orgId,
      projectId: deal.projectId,
      rooms: deal.installRooms || [],
      recordVersion: deal.recordVersion ?? 1,
    };
  }
  return {
    id: deal.id,
    orgId: deal.orgId,
    projectId: deal.projectId,
    stage: deal.stage,
    ownerUserId: deal.ownerUserId ?? null,
    assignments: deal.assignments,
    nextActionAt: deal.nextActionAt ?? null,
    outcome: deal.outcome ?? null,
    lossReason: deal.lossReason ?? null,
    lossComment: deal.lossComment ?? null,
    stageAtOutcome: deal.stageAtOutcome ?? null,
    roomAssent: deal.roomAssent || {},
    acceptedAmount: deal.acceptedAmount ?? null,
    closedAt: deal.closedAt ?? null,
    active: !deal.closedAt,
    recordVersion: deal.recordVersion ?? 1,
    createdAt: deal.createdAt,
    updatedAt: deal.updatedAt,
  };
}

function publicQuote(quote, role) {
  const hide = role === 'crew';
  return {
    id: quote.id,
    projectId: quote.projectId,
    dealId: quote.dealId || null,
    version: quote.version,
    pdfStorageKey: quote.pdfStorageKey || null,
    amount: hide ? null : quote.amount ?? null,
    roomObjectIds: quote.roomObjectIds || [],
    snapshot: hide ? null : quote.snapshot || null,
    createdAt: quote.createdAt,
    createdBy: quote.createdBy || null,
    sharedAt: quote.sharedAt || null,
    sentConfirmedAt: quote.sentConfirmedAt || null,
    sentComment: quote.sentComment || null,
    lifecycle: quote.lifecycle,
    sentConfirmed: Boolean(quote.sentConfirmedAt) || quote.lifecycle === 'quote_sent_confirmed',
    recordVersion: quote.recordVersion ?? 1,
  };
}

function send(json, status, body, version) {
  const extra = version != null ? { ETag: `"${version}"` } : undefined;
  return json(status, body, extra);
}

export async function handleCommercial(ctx) {
  const { path, method } = ctx;
  const commercial =
    path.endsWith('/deals') ||
    path.includes('/deals/') ||
    path.endsWith('/quotes') ||
    path.includes('/quotes/') ||
    path.endsWith('/inquiries') ||
    path.endsWith('/drafts') ||
    path.includes('/rooms/') ||
    path.endsWith('/install/inbox');
  if (!commercial) return null;

  const { platform, user } = await ctx.requireAuth();
  const repo = await getCommercialRepository();
  const service = createCommercialService(repo, {
    uid: ctx.uid,
    now: () => new Date().toISOString(),
    orgIds: (platform.orgs || []).map((item) => item.id).filter(Boolean),
  });
  const body = ctx.getBody() || {};
  const contextHeader = ctx.getHeader?.('x-data-context');
  if (!body.context && contextHeader) body.context = contextHeader;
  const expected = ifMatch(ctx.getHeader?.('if-match'));
  const idempotencyKey = ctx.getHeader?.('idempotency-key') || null;
  const role = user.role;

  const legacyProject = (projectId) =>
    (platform.projects || []).find((item) => item.id === projectId) || null;

  if (method === 'POST' && path.endsWith('/drafts')) {
    const result = await service.saveDraft(user, body);
    return ctx.json(200, { draft: result.draft, createdDeal: false });
  }

  if (method === 'POST' && path.endsWith('/inquiries')) {
    const result = await service.createInquiry(user, body, idempotencyKey);
    return ctx.json(result.status || 200, {
      project: result.project,
      room: result.room,
      deal: publicDeal(result.deal, role),
      createdDeal: result.createdDeal !== false,
      replayed: Boolean(result.replayed),
    });
  }

  if (method === 'GET' && path.endsWith('/deals')) {
    if (role === 'measurer') {
      const deals = await service.measurerWork(user);
      return ctx.json(200, { deals });
    }
    const deals = await service.listDeals(user);
    return ctx.json(200, { deals: deals.map((deal) => publicDeal(deal, role)) });
  }

  if (method === 'POST' && path.endsWith('/deals')) {
    const result = await service.createDeal(user, body, legacyProject(body.projectId), idempotencyKey);
    return send(ctx.json, 200, { deal: publicDeal(result.deal, role), replayed: Boolean(result.replayed) }, result.deal.recordVersion);
  }

  const dealAction = path.match(/\/deals\/([^/]+)(?:\/(pause|resume|decline|accept|close|follow-up))?$/);
  if (dealAction && !path.includes('/quotes/')) {
    const [, dealId, action] = dealAction;
    if (method === 'GET' && !action) {
      const deal = await service.getDeal(user, dealId);
      return send(ctx.json, 200, { deal: publicDeal(deal, role) }, deal.recordVersion);
    }
    if (method === 'PATCH' && !action) {
      const mapped = mapOutcomePatch(body);
      const result = mapped
        ? await service.mutateDeal(user, dealId, mapped, body, expected)
        : await service.mutateDeal(user, dealId, 'patch', body, expected);
      return send(ctx.json, 200, { deal: publicDeal(result.deal, role) }, result.deal.recordVersion);
    }
    if (method === 'POST' && action) {
      const name = action === 'follow-up' ? 'follow' : action;
      const result = await service.mutateDeal(user, dealId, name, body, expected);
      return send(ctx.json, 200, { deal: publicDeal(result.deal, role) }, result.deal.recordVersion);
    }
  }

  if (method === 'GET' && path.endsWith('/quotes')) {
    const query = ctx.getQuery?.() || {};
    const quotes = await service.listQuotes(user, query.dealId || body.dealId || null);
    return ctx.json(200, { quotes: quotes.map((quote) => publicQuote(quote, role)) });
  }

  if (method === 'POST' && path.endsWith('/quotes')) {
    const result = await service.createQuote(user, { ...body, idempotencyKey: idempotencyKey || body.idempotencyKey }, legacyProject(body.projectId));
    return send(ctx.json, 200, { quote: publicQuote(result.quote, role), replayed: Boolean(result.replayed) }, result.quote.recordVersion);
  }

  const quoteAction = path.match(/\/quotes\/([^/]+)(?:\/(copy|pdf|share|confirm-sent))?$/);
  if (quoteAction) {
    const [, quoteId, action] = quoteAction;
    if (method === 'PATCH' && !action) {
      await service.quoteAction(user, quoteId, 'replace', body, expected);
    }
    if (method === 'POST' && action) {
      const mapped = action === 'copy' ? 'copy_text' : action === 'pdf' ? 'generate_pdf' : action === 'confirm-sent' ? 'confirm_sent' : 'share';
      const result = await service.quoteAction(user, quoteId, mapped, body, expected);
      return send(
        ctx.json,
        200,
        {
          quote: publicQuote(result.quote, role),
          lifecycleUnchanged: result.lifecycleUnchanged || undefined,
        },
        result.quote.recordVersion,
      );
    }
  }

  const roomAction = path.match(/\/rooms\/([^/]+)\/(calculations|profile|readiness|checklist|blockers|close)$/);
  if (roomAction && method === 'POST') {
    const [, roomId, action] = roomAction;
    if (action === 'calculations') {
      const result = await service.saveCalculation(user, roomId, body, idempotencyKey);
      return ctx.json(result.status, result.body);
    }
    if (action === 'profile') {
      const result = await service.saveProfile(user, roomId, body, expected);
      return send(ctx.json, 200, result, result.room.recordVersion);
    }
    if (action === 'readiness') {
      const result = await service.setReadiness(user, roomId, body, expected);
      return send(ctx.json, 200, result, result.room.recordVersion);
    }
    if (action === 'checklist') {
      const result = await service.setChecklist(user, roomId, body, expected);
      return send(ctx.json, 200, result, result.room.recordVersion);
    }
    if (action === 'blockers') {
      const result = await service.openBlocker(user, roomId, body, expected);
      return send(ctx.json, 200, result, result.room.recordVersion);
    }
    if (action === 'close') {
      const result = await service.closeRoom(user, roomId, expected);
      return send(ctx.json, 200, result, result.room.recordVersion);
    }
  }

  const resolve = path.match(/\/rooms\/([^/]+)\/blockers\/([^/]+)\/resolve$/);
  if (resolve && method === 'POST') {
    const result = await service.resolveBlocker(user, resolve[1], resolve[2], expected);
    return send(ctx.json, 200, result, result.room.recordVersion);
  }

  if (method === 'GET' && path.endsWith('/install/inbox')) {
    const rooms = await service.installInbox(user);
    return ctx.json(200, { rooms });
  }

  return null;
}

function mapOutcomePatch(body) {
  if (!body || !body.outcome) return null;
  if (body.outcome === 'early_paused') return 'pause';
  if (body.outcome === 'accepted') return 'accept';
  if (body.outcome === 'declined' || body.outcome === 'early_declined') return 'decline';
  if (body.outcome === 'postponed' || body.outcome === 'no_response') return 'follow';
  return null;
}
