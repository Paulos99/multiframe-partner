/**
 * Версии КП. Копирование не подтверждает отправку — только confirm_sent.
 */

import { applyQuoteAction, isSentConfirmed } from '../../../packages/shared/quote.js';

function quoteVisible(user, revision, platform) {
  if (user.role === 'admin') return true;
  if (!user.orgId) return false;
  const project = (platform.projects || []).find((p) => p.id === revision.projectId);
  return Boolean(project && project.orgId === user.orgId);
}

function publicQuote(revision) {
  return {
    id: revision.id,
    projectId: revision.projectId,
    dealId: revision.dealId || null,
    version: revision.version,
    pdfStorageKey: revision.pdfStorageKey || null,
    amount: revision.amount ?? null,
    roomObjectIds: revision.roomObjectIds || [],
    createdAt: revision.createdAt,
    createdBy: revision.createdBy || null,
    sharedAt: revision.sharedAt || null,
    sentConfirmedAt: revision.sentConfirmedAt || null,
    sentComment: revision.sentComment || null,
    lifecycle: revision.lifecycle,
    sentConfirmed: isSentConfirmed(revision),
  };
}

export async function handleQuotes(ctx) {
  const { path, method, requireAuth, json, getBody, savePlatform, uid } = ctx;
  if (!path.includes('/quotes')) return null;

  if (method === 'GET' && path.endsWith('/quotes')) {
    const { platform, user } = await requireAuth();
    const list = (platform.quoteRevisions || [])
      .filter((q) => quoteVisible(user, q, platform))
      .map(publicQuote);
    return json(200, { quotes: list });
  }

  if (method === 'POST' && path.endsWith('/quotes')) {
    const { platform, user } = await requireAuth();
    if (!['owner', 'sales', 'measurer'].includes(user.role)) {
      return json(403, { message: 'Недостаточно прав' });
    }
    const body = getBody();
    const projectId = String(body.projectId || '').trim();
    if (!projectId) return json(400, { message: 'Укажите projectId' });
    const project = (platform.projects || []).find((p) => p.id === projectId);
    if (!project || project.orgId !== user.orgId) {
      return json(400, { message: 'Проект не найден' });
    }
    const siblings = (platform.quoteRevisions || []).filter((q) => q.projectId === projectId);
    const version = siblings.reduce((max, q) => Math.max(max, Number(q.version) || 0), 0) + 1;
    const now = new Date().toISOString();
    const revision = {
      id: body.id || uid('qr'),
      projectId,
      dealId: body.dealId || null,
      version,
      pdfStorageKey: body.pdfStorageKey || null,
      amount: body.amount != null ? Number(body.amount) : null,
      roomObjectIds: Array.isArray(body.roomObjectIds) ? body.roomObjectIds.map(String) : [],
      createdAt: now,
      createdBy: user.id,
      sharedAt: null,
      sentConfirmedAt: null,
      sentComment: null,
      lifecycle: 'quote_created',
    };
    platform.quoteRevisions = [revision, ...(platform.quoteRevisions || [])];
    await savePlatform(platform);
    return json(200, { quote: publicQuote(revision) });
  }

  const actionMatch = path.match(/\/quotes\/([^/]+)\/(share|confirm-sent|copy)$/);
  if (actionMatch && method === 'POST') {
    const [, quoteId, action] = actionMatch;
    const { platform, user } = await requireAuth();
    const idx = (platform.quoteRevisions || []).findIndex((q) => q.id === quoteId);
    if (idx < 0) return json(404, { message: 'КП не найдено' });
    const existing = platform.quoteRevisions[idx];
    if (!quoteVisible(user, existing, platform)) {
      return json(403, { message: 'Недостаточно прав' });
    }
    // copy — no lifecycle change (PRD: копирование ≠ отправка)
    if (action === 'copy') {
      return json(200, { quote: publicQuote(existing), lifecycleUnchanged: true });
    }
    const mapped = action === 'share' ? 'share' : 'confirm_sent';
    const body = getBody();
    let next = applyQuoteAction(existing, mapped);
    if (mapped === 'confirm_sent' && body.comment != null) {
      next = { ...next, sentComment: String(body.comment).slice(0, 500) };
    }
    platform.quoteRevisions[idx] = next;
    await savePlatform(platform);
    return json(200, { quote: publicQuote(next) });
  }

  return null;
}
