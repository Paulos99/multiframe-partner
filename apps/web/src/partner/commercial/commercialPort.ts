import type { Deal, RoomAssent } from '../../../../../packages/shared/deal';
import type { JobObject, Project } from '../../../../../packages/shared/partner';
import type { QuoteLifecycle, QuoteRevision } from '../../../../../packages/shared/quote';
import { apiCommercial, hasRemoteApi, type ApiDeal, type ApiQuote } from '../apiClient';
import type { CommercialProject, CommercialRoom, DemoBook } from './demoBook';
import { sessionBook } from './demoBook';

export type OpenedDeal = {
  project: CommercialProject;
  rooms: CommercialRoom[];
  deals: Deal[];
  quotes: QuoteRevision[];
};

export type QuoteActionName = 'copy_text' | 'generate_pdf' | 'share' | 'confirm_sent';

export type CommercialPort = {
  open(projectId: string): Promise<OpenedDeal>;
  createDeal(projectId: string, key: string): Promise<Deal>;
  pause(id: string, version: number | null, body: { reason: string; comment?: string | null; nextActionAt?: string | null }, key: string): Promise<Deal>;
  resume(id: string, version: number | null, key: string): Promise<Deal>;
  decline(id: string, version: number | null, body: { reason: string; comment?: string | null; early?: boolean }, key: string): Promise<Deal>;
  accept(id: string, version: number | null, roomAssent: Record<string, RoomAssent>, key: string): Promise<Deal>;
  followUp(id: string, version: number | null, body: { outcome: 'postponed' | 'no_response'; nextActionAt?: string | null }, key: string): Promise<Deal>;
  createQuote(input: { projectId: string; dealId: string; roomObjectIds: string[] }, key: string): Promise<QuoteRevision>;
  quoteAction(id: string, action: QuoteActionName, version: number | null, key: string, comment?: string | null): Promise<QuoteRevision>;
};

function asDeal(row: ApiDeal): Deal {
  return {
    id: row.id,
    orgId: row.orgId,
    projectId: row.projectId,
    stage: row.stage as Deal['stage'],
    ownerUserId: row.ownerUserId,
    assignments: row.assignments,
    nextActionAt: row.nextActionAt,
    outcome: (row.outcome as Deal['outcome']) ?? null,
    lossReason: (row.lossReason as Deal['lossReason']) ?? null,
    lossComment: row.lossComment ?? null,
    stageAtOutcome: row.stageAtOutcome ?? null,
    roomAssent: row.roomAssent as Deal['roomAssent'],
    acceptedAmount: row.acceptedAmount ?? null,
    closedAt: row.closedAt ?? null,
    recordVersion: row.recordVersion ?? 1,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function asQuote(row: ApiQuote): QuoteRevision {
  return {
    id: row.id,
    projectId: row.projectId,
    dealId: row.dealId,
    version: row.version,
    pdfStorageKey: null,
    amount: row.amount,
    roomObjectIds: row.roomObjectIds || [],
    snapshot: row.snapshot || null,
    createdAt: row.createdAt || row.sentConfirmedAt || row.sharedAt || '',
    createdBy: null,
    sharedAt: row.sharedAt,
    sentConfirmedAt: row.sentConfirmedAt,
    sentComment: row.sentComment,
    lifecycle: row.lifecycle as QuoteLifecycle,
    recordVersion: row.recordVersion ?? 1,
  };
}

function unavailable(): CommercialPort {
  const fail = () => Promise.reject(Object.assign(new Error('Сделки хранятся на сервере. Сейчас нет связи.'), { status: 0 }));
  return {
    open: fail,
    createDeal: fail,
    pause: fail,
    resume: fail,
    decline: fail,
    accept: fail,
    followUp: fail,
    createQuote: fail,
    quoteAction: fail,
  };
}

function wrapBook(book: DemoBook): CommercialPort {
  return {
    open: (projectId) => Promise.resolve(book.open(projectId)),
    createDeal: (projectId, key) => Promise.resolve(book.createDeal(projectId, key)),
    pause: (id, version, body) => Promise.resolve(book.pause(id, version, body)),
    resume: (id, version) => Promise.resolve(book.resume(id, version)),
    decline: (id, version, body) => Promise.resolve(book.decline(id, version, body)),
    accept: (id, version, roomAssent) => Promise.resolve(book.accept(id, version, roomAssent)),
    followUp: (id, version, body) => Promise.resolve(book.followUp(id, version, body)),
    createQuote: (input, key) => Promise.resolve(book.createQuote(input, key)),
    quoteAction: (id, action, version, _key, comment) => Promise.resolve(book.quoteAction(id, action, version, comment)),
  };
}

function httpPort(catalog: { projects: CommercialProject[]; rooms: CommercialRoom[] }): CommercialPort {
  const context = 'work' as const;
  async function deal(path: string, version: number | null, key: string, body: unknown) {
    const data = await apiCommercial<{ deal: ApiDeal }>(path, {
      method: 'POST',
      mutation: true,
      ifMatch: version,
      idempotencyKey: key,
      context,
      body,
    });
    return asDeal(data.deal);
  }
  return {
    async open(projectId) {
      const [dealRes, quoteRes] = await Promise.all([
        apiCommercial<{ deals: ApiDeal[] }>('/deals', { method: 'GET', mutation: false, context }),
        apiCommercial<{ quotes: ApiQuote[] }>('/quotes', { method: 'GET', mutation: false, context }),
      ]);
      const known = catalog.projects.find((item) => item.id === projectId);
      return {
        project: known || { id: projectId, name: 'Проект', place: '' },
        rooms: catalog.rooms.filter((item) => item.projectId === projectId),
        deals: (dealRes.deals || []).map(asDeal).filter((item) => item.projectId === projectId),
        quotes: (quoteRes.quotes || []).map(asQuote).filter((item) => item.projectId === projectId),
      };
    },
    async createDeal(projectId, key) {
      const data = await apiCommercial<{ deal: ApiDeal }>('/deals', {
        method: 'POST',
        mutation: false,
        idempotencyKey: key,
        context,
        body: { projectId },
      });
      return asDeal(data.deal);
    },
    pause: (id, version, body, key) =>
      deal(`/deals/${encodeURIComponent(id)}/pause`, version, key, {
        reason: body.reason,
        lossReason: body.reason,
        comment: body.comment || null,
        nextActionAt: body.nextActionAt || null,
      }),
    resume: (id, version, key) => deal(`/deals/${encodeURIComponent(id)}/resume`, version, key, {}),
    decline: (id, version, body, key) =>
      deal(`/deals/${encodeURIComponent(id)}/decline`, version, key, {
        reason: body.reason,
        lossReason: body.reason,
        comment: body.comment || null,
        outcome: body.early ? 'early_declined' : 'declined',
      }),
    accept: (id, version, roomAssent, key) =>
      deal(`/deals/${encodeURIComponent(id)}/accept`, version, key, { roomAssent }),
    followUp: (id, version, body, key) =>
      deal(`/deals/${encodeURIComponent(id)}/follow-up`, version, key, {
        outcome: body.outcome,
        nextActionAt: body.nextActionAt || null,
        close: false,
      }),
    async createQuote(input, key) {
      const data = await apiCommercial<{ quote: ApiQuote }>('/quotes', {
        method: 'POST',
        mutation: false,
        idempotencyKey: key,
        context,
        body: input,
      });
      return asQuote(data.quote);
    },
    async quoteAction(id, action, version, key, comment) {
      const path =
        action === 'copy_text' ? 'copy' : action === 'generate_pdf' ? 'pdf' : action === 'confirm_sent' ? 'confirm-sent' : 'share';
      const data = await apiCommercial<{ quote: ApiQuote }>(`/quotes/${encodeURIComponent(id)}/${path}`, {
        method: 'POST',
        mutation: true,
        ifMatch: version,
        idempotencyKey: key,
        context,
        body: action === 'confirm_sent' ? { comment: comment || null } : {},
      });
      return asQuote(data.quote);
    },
  };
}

export function commercialPort(
  demo: boolean,
  catalog: { projects: CommercialProject[]; rooms: CommercialRoom[] },
): CommercialPort {
  if (demo) return wrapBook(sessionBook());
  if (!hasRemoteApi()) return unavailable();
  return httpPort(catalog);
}

export function roomsOf(objects: JobObject[]): CommercialRoom[] {
  return objects
    .filter((item) => item.projectId)
    .map((item) => ({
      id: item.id,
      projectId: String(item.projectId),
      name: item.roomName || item.room.roomTypeCustom || 'Комната',
      calcType: null,
      amount: null,
    }));
}

export function projectsOf(projects: Project[]): CommercialProject[] {
  return projects.map((item) => ({
    id: item.id,
    name: item.name,
    place: [item.address, item.city].filter(Boolean).join(' · '),
  }));
}
