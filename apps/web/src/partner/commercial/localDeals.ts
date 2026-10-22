/**
 * Локальные сделки и КП для demo / offline (без VITE_API_URL).
 * Ключи в localStorage, изоляция по orgId.
 */

import {
  EMPTY_ASSIGNMENTS,
  applyDealOutcome,
  type Deal,
  type DealOutcome,
  type LossReason,
  type ObjectAssignments,
} from '../../../../../packages/shared/deal';
import {
  applyQuoteAction,
  type QuoteRevision,
  type QuoteUserAction,
} from '../../../../../packages/shared/quote';
import type { JobObject, Project } from '../../../../../packages/shared/partner';

const DEALS_KEY = 'mf_local_deals_v1';
const QUOTES_KEY = 'mf_local_quotes_v1';

function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

function readJson<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as T[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeJson<T>(key: string, value: T[]): void {
  localStorage.setItem(key, JSON.stringify(value));
}

export function listLocalDeals(orgId: string | null): Deal[] {
  if (!orgId) return [];
  return readJson<Deal>(DEALS_KEY).filter((d) => d.orgId === orgId);
}

export function listLocalQuotes(projectIds: Set<string>): QuoteRevision[] {
  return readJson<QuoteRevision>(QUOTES_KEY).filter((q) => projectIds.has(q.projectId));
}

export function upsertLocalDeal(deal: Deal): Deal {
  const all = readJson<Deal>(DEALS_KEY);
  const idx = all.findIndex((d) => d.id === deal.id);
  if (idx >= 0) all[idx] = deal;
  else all.unshift(deal);
  writeJson(DEALS_KEY, all);
  return deal;
}

export function createLocalDeal(input: {
  orgId: string;
  projectId: string;
  ownerUserId: string | null;
  assignments?: ObjectAssignments;
  stage?: Deal['stage'];
}): Deal {
  const now = new Date().toISOString();
  const deal: Deal = {
    id: uid('deal'),
    orgId: input.orgId,
    projectId: input.projectId,
    stage: input.stage || 'contact',
    ownerUserId: input.ownerUserId,
    assignments: input.assignments || { ...EMPTY_ASSIGNMENTS },
    nextActionAt: null,
    outcome: null,
    lossReason: null,
    lossComment: null,
    createdAt: now,
    updatedAt: now,
  };
  return upsertLocalDeal(deal);
}

export function patchLocalDeal(
  id: string,
  patch: Partial<Deal> & {
    outcome?: Exclude<DealOutcome, null>;
    lossReason?: LossReason;
    lossComment?: string | null;
  },
): Deal | null {
  const all = readJson<Deal>(DEALS_KEY);
  const idx = all.findIndex((d) => d.id === id);
  if (idx < 0) return null;
  let next = { ...all[idx], ...patch, updatedAt: new Date().toISOString() } as Deal;
  if (patch.outcome) {
    next = applyDealOutcome(next, patch.outcome, patch.lossReason ?? null, patch.lossComment ?? null);
  }
  all[idx] = next;
  writeJson(DEALS_KEY, all);
  return next;
}

export function createLocalQuote(input: {
  projectId: string;
  dealId: string | null;
  amount?: number | null;
  roomObjectIds?: string[];
  createdBy?: string | null;
}): QuoteRevision {
  const all = readJson<QuoteRevision>(QUOTES_KEY);
  const siblings = all.filter((q) => q.projectId === input.projectId);
  const version = siblings.reduce((max, q) => Math.max(max, Number(q.version) || 0), 0) + 1;
  const now = new Date().toISOString();
  const quote: QuoteRevision = {
    id: uid('qr'),
    projectId: input.projectId,
    dealId: input.dealId,
    version,
    pdfStorageKey: null,
    amount: input.amount ?? null,
    roomObjectIds: input.roomObjectIds || [],
    createdAt: now,
    createdBy: input.createdBy ?? null,
    sharedAt: null,
    sentConfirmedAt: null,
    sentComment: null,
    lifecycle: 'quote_created',
  };
  all.unshift(quote);
  writeJson(QUOTES_KEY, all);
  if (input.dealId) {
    patchLocalDeal(input.dealId, { stage: 'quote_created' });
  }
  return quote;
}

export function applyLocalQuoteAction(
  id: string,
  action: QuoteUserAction,
  comment?: string | null,
): QuoteRevision | null {
  const all = readJson<QuoteRevision>(QUOTES_KEY);
  const idx = all.findIndex((q) => q.id === id);
  if (idx < 0) return null;
  let next = applyQuoteAction(all[idx], action);
  if (action === 'confirm_sent' && comment != null) {
    next = { ...next, sentComment: String(comment).slice(0, 500) };
  }
  all[idx] = next;
  writeJson(QUOTES_KEY, all);
  if (next.dealId && action === 'confirm_sent') {
    patchLocalDeal(next.dealId, { stage: 'quote_sent_confirmed' });
  }
  if (next.dealId && action === 'share') {
    patchLocalDeal(next.dealId, { stage: 'quote_shared' });
  }
  return next;
}

/**
 * Гарантирует сделку на каждый проект с объектами компании.
 * Идемпотентно: не создаёт дубликаты.
 */
export function ensureDealsForProjects(
  orgId: string,
  ownerUserId: string | null,
  projects: Project[],
  objects: JobObject[],
): Deal[] {
  const existing = listLocalDeals(orgId);
  const byProject = new Set(existing.map((d) => d.projectId));
  const projectIds = new Set(
    objects.map((o) => o.projectId).filter((id): id is string => Boolean(id)),
  );
  for (const project of projects) {
    if (project.orgId !== orgId) continue;
    projectIds.add(project.id);
  }
  for (const projectId of projectIds) {
    if (byProject.has(projectId)) continue;
    const project = projects.find((p) => p.id === projectId);
    if (project && project.orgId !== orgId) continue;
    createLocalDeal({ orgId, projectId, ownerUserId });
    byProject.add(projectId);
  }
  return listLocalDeals(orgId);
}
