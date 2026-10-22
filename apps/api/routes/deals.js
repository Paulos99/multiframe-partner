/**
 * CRUD сделок (Deal). Проверка orgId на сервере.
 */

import { EMPTY_ASSIGNMENTS, applyDealOutcome } from '../../../packages/shared/deal.js';

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

function dealVisible(user, deal) {
  if (user.role === 'admin') return true;
  return Boolean(user.orgId && deal.orgId === user.orgId);
}

function publicDeal(deal) {
  return {
    id: deal.id,
    orgId: deal.orgId,
    projectId: deal.projectId,
    stage: deal.stage,
    ownerUserId: deal.ownerUserId,
    assignments: deal.assignments || { ...EMPTY_ASSIGNMENTS },
    nextActionAt: deal.nextActionAt || null,
    outcome: deal.outcome ?? null,
    lossReason: deal.lossReason ?? null,
    lossComment: deal.lossComment ?? null,
    createdAt: deal.createdAt,
    updatedAt: deal.updatedAt,
  };
}

function writeDeal(body, existing, actor, uid) {
  const now = new Date().toISOString();
  const assignments = {
    ...EMPTY_ASSIGNMENTS,
    ...(existing?.assignments || {}),
    ...(body.assignments && typeof body.assignments === 'object' ? body.assignments : {}),
  };
  return {
    id: existing?.id || body.id || uid('deal'),
    orgId: existing?.orgId || actor.orgId,
    projectId: String(body.projectId || existing?.projectId || '').trim(),
    stage: body.stage || existing?.stage || 'contact',
    ownerUserId:
      body.ownerUserId !== undefined ? body.ownerUserId : existing?.ownerUserId ?? actor.id,
    assignments,
    nextActionAt:
      body.nextActionAt !== undefined ? body.nextActionAt : existing?.nextActionAt ?? null,
    outcome: existing?.outcome ?? null,
    lossReason: existing?.lossReason ?? null,
    lossComment: existing?.lossComment ?? null,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

/**
 * @returns {Promise<object|null>}
 */
export async function handleDeals(ctx) {
  const { path, method, requireAuth, json, getBody, savePlatform, uid } = ctx;
  if (!path.includes('/deals')) return null;

  if (method === 'GET' && path.endsWith('/deals')) {
    const { platform, user } = await requireAuth();
    const list = (platform.deals || [])
      .filter((d) => dealVisible(user, d))
      .map(publicDeal);
    return json(200, { deals: list });
  }

  if (method === 'POST' && path.endsWith('/deals')) {
    const { platform, user } = await requireAuth();
    if (!['owner', 'sales', 'measurer', 'admin'].includes(user.role)) {
      return json(403, { message: 'Недостаточно прав' });
    }
    if (user.role !== 'admin' && !user.orgId) return json(400, { message: 'Нет организации' });
    const body = getBody();
    if (!String(body.projectId || '').trim()) return json(400, { message: 'Укажите projectId' });
    const projects = platform.projects || [];
    const project = projects.find((p) => p.id === body.projectId);
    if (!project || (user.role !== 'admin' && project.orgId !== user.orgId)) {
      return json(400, { message: 'Проект не найден' });
    }
    const deal = writeDeal(body, null, user, uid);
    if (user.role !== 'admin') deal.orgId = user.orgId;
    platform.deals = [deal, ...(platform.deals || [])];
    await savePlatform(platform);
    return json(200, { deal: publicDeal(deal) });
  }

  const match = path.match(/\/deals\/([^/]+)$/);
  if (!match) return null;
  const dealId = match[1];

  if (method === 'GET') {
    const { platform, user } = await requireAuth();
    const deal = (platform.deals || []).find((d) => d.id === dealId);
    if (!deal || !dealVisible(user, deal)) return json(404, { message: 'Сделка не найдена' });
    return json(200, { deal: publicDeal(deal) });
  }

  if (method === 'PATCH') {
    const { platform, user } = await requireAuth();
    const idx = (platform.deals || []).findIndex((d) => d.id === dealId);
    if (idx < 0) return json(404, { message: 'Сделка не найдена' });
    const existing = platform.deals[idx];
    if (!dealVisible(user, existing)) return json(403, { message: 'Недостаточно прав' });
    if (user.role === 'crew') return json(403, { message: 'Недостаточно прав' });
    const body = getBody();
    let next = writeDeal(body, existing, user, uid);
    if (body.outcome) {
      next = applyDealOutcome(next, body.outcome, body.lossReason || null, body.lossComment || null);
    }
    platform.deals[idx] = next;
    await savePlatform(platform);
    return json(200, { deal: publicDeal(next) });
  }

  throw httpError(405, 'Method not allowed');
}
