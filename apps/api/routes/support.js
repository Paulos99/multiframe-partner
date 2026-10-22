/**
 * Обращения партнёров и вмешательства StP. Без ПД конечного клиента.
 */

import {
  createSupportCase,
  isSupportPayloadSafe,
  interventionResultFromSamples,
  linkInterventionToSignal,
} from '../../../packages/shared/support.js';

function caseVisible(user, item) {
  if (user.role === 'admin') return true;
  return Boolean(user.orgId && item.orgId === user.orgId);
}

export async function handleSupport(ctx) {
  const { path, method, requireAuth, json, getBody, savePlatform, uid } = ctx;
  if (!path.includes('/support') && !path.includes('/interventions')) return null;

  if (method === 'GET' && path.endsWith('/support/cases')) {
    const { platform, user } = await requireAuth();
    const list = (platform.supportCases || []).filter((c) => caseVisible(user, c));
    return json(200, { cases: list });
  }

  if (method === 'POST' && path.endsWith('/support/cases')) {
    const { platform, user } = await requireAuth();
    if (!user.orgId && user.role !== 'admin') return json(400, { message: 'Нет организации' });
    const body = getBody();
    if (!isSupportPayloadSafe(body)) {
      return json(400, { message: 'Нельзя прикладывать персональные данные клиента' });
    }
    const item = createSupportCase({
      id: uid('sc'),
      orgId: user.orgId || body.orgId,
      openedByUserId: user.id,
      role: user.role,
      category: body.category || 'other',
      module: body.module || null,
    });
    platform.supportCases = [item, ...(platform.supportCases || [])];
    await savePlatform(platform);
    return json(200, { case: item });
  }

  if (method === 'GET' && path.endsWith('/interventions')) {
    const { platform, user } = await requireAuth();
    if (user.role !== 'admin' && user.role !== 'owner') {
      return json(403, { message: 'Недостаточно прав' });
    }
    const list = (platform.interventions || []).filter((i) => caseVisible(user, i));
    return json(200, { interventions: list });
  }

  if (method === 'POST' && path.endsWith('/interventions')) {
    const { platform, user } = await requireAuth();
    if (user.role !== 'admin') return json(403, { message: 'Только StP' });
    const body = getBody();
    const now = new Date().toISOString();
    let item = {
      id: uid('iv'),
      orgId: body.orgId,
      supportCaseId: body.supportCaseId || null,
      problemType: String(body.problemType || '').slice(0, 120),
      actionType: String(body.actionType || '').slice(0, 120),
      startedAt: now,
      reviewAt: body.reviewAt || null,
      result: null,
      signalId: body.signalId || null,
    };
    if (body.signalId) {
      item = linkInterventionToSignal(item, body.signalId, body.reviewAt || now);
    }
    if (body.beforeCount != null && body.afterCount != null) {
      item.result = interventionResultFromSamples(Number(body.beforeCount), Number(body.afterCount));
    }
    platform.interventions = [item, ...(platform.interventions || [])];
    await savePlatform(platform);
    return json(200, { intervention: item });
  }

  return null;
}
