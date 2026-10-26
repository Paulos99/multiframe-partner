/**
 * Демонстрационные сделки в памяти процесса.
 * Это не источник рабочих данных и не localStorage: обновление страницы
 * возвращает исходный набор. Запись в YDB отсюда не выполняется.
 */
import type { Deal, RoomAssent } from '../../../../../packages/shared/deal';
import { EMPTY_ASSIGNMENTS } from '../../../../../packages/shared/deal';
import type { QuoteRevision } from '../../../../../packages/shared/quote';
import {
  acceptDeal,
  advanceAuto,
  applyQuoteDocument,
  declineDeal,
  followUpDeal,
  httpError,
  pauseDeal,
  resumeDeal,
  snapshotFromCalcs,
} from '../../../../../packages/shared/commercialRules.js';

export type CommercialRoom = {
  id: string;
  projectId: string;
  name: string;
  calcType: 'preliminary' | 'detailed' | null;
  amount: number | null;
};

export type CommercialProject = {
  id: string;
  name: string;
  place: string;
};

type Row<T> = { version: number; payload: T };
type StoredQuote = QuoteRevision & { recordVersion?: number };

const AT = '2026-10-20T10:00:00.000Z';

function room(
  projectId: string,
  id: string,
  name: string,
  calcType: 'preliminary' | 'detailed',
  amount: number,
): CommercialRoom {
  return { id, projectId, name, calcType, amount };
}

function lines(rooms: CommercialRoom[]): NonNullable<QuoteRevision['snapshot']>['lines'] {
  return rooms.map((item) => ({
    roomId: item.id,
    calcType: item.calcType || 'unspecified',
    calculationId: `calc_${item.id}`,
    revisionSeq: 1,
    amount: item.amount,
  }));
}

function quoteOf(
  id: string,
  projectId: string,
  dealId: string,
  rooms: CommercialRoom[],
): StoredQuote {
  const amount = rooms.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  return {
    id,
    projectId,
    dealId,
    version: 1,
    pdfStorageKey: null,
    amount,
    roomObjectIds: rooms.map((item) => item.id),
    snapshot: { lines: lines(rooms), legacyTotal: false },
    createdAt: AT,
    createdBy: 'demo',
    sharedAt: AT,
    sentConfirmedAt: AT,
    sentComment: null,
    lifecycle: 'quote_sent_confirmed',
    recordVersion: 1,
  };
}

function dealOf(partial: Omit<Deal, 'assignments' | 'recordVersion'>): Deal {
  return { recordVersion: 1, assignments: { ...EMPTY_ASSIGNMENTS, salesUserId: 'u_sales1' }, ...partial };
}

export class DemoBook {
  readonly projects: CommercialProject[];
  readonly rooms: CommercialRoom[];
  private deals: Array<Row<Deal>>;
  private quotes: Array<Row<StoredQuote>>;
  private replay = new Map<string, unknown>();
  private n = 40;

  constructor() {
    const before = [
      room('prj_before', 'room_b_kit', 'Кухня', 'preliminary', 100_000),
      room('prj_before', 'room_b_liv', 'Гостиная', 'detailed', 200_000),
      room('prj_before', 'room_b_bed', 'Спальня', 'preliminary', 50_000),
    ];
    const reply = [
      room('prj_reply', 'room_r_kit', 'Кухня', 'preliminary', 100_000),
      room('prj_reply', 'room_r_liv', 'Гостиная', 'detailed', 200_000),
      room('prj_reply', 'room_r_bed', 'Спальня', 'preliminary', 50_000),
    ];
    const again = [
      room('prj_again', 'room_a_kit', 'Кухня', 'detailed', 100_000),
      room('prj_again', 'room_a_liv', 'Гостиная', 'detailed', 200_000),
      room('prj_again', 'room_a_bed', 'Спальня', 'preliminary', 50_000),
    ];
    this.projects = [
      {
        id: 'prj_before',
        name: 'Сорокина · до предложения',
        place: 'Три комнаты, предложение ещё не отправлено',
      },
      {
        id: 'prj_reply',
        name: 'Сорокина · ответ клиента',
        place: 'Предложение отправлено, решение по трём комнатам',
      },
      {
        id: 'prj_again',
        name: 'Сорокина · дозаказ',
        place: 'Кухня заказана, гостиная и спальня отложены',
      },
    ];
    this.rooms = [...before, ...reply, ...again];
    this.deals = [
      {
        version: 1,
        payload: dealOf({
          id: 'deal_before',
          orgId: 'org_demo',
          projectId: 'prj_before',
          stage: 'calculated',
          ownerUserId: 'u_sales1',
          nextActionAt: null,
          outcome: null,
          lossReason: null,
          lossComment: null,
          roomAssent: {},
          acceptedAmount: null,
          closedAt: null,
          createdAt: AT,
          updatedAt: AT,
        }),
      },
      {
        version: 1,
        payload: dealOf({
          id: 'deal_reply',
          orgId: 'org_demo',
          projectId: 'prj_reply',
          stage: 'quote_sent_confirmed',
          ownerUserId: 'u_sales1',
          nextActionAt: null,
          outcome: null,
          lossReason: null,
          lossComment: null,
          roomAssent: {},
          acceptedAmount: null,
          closedAt: null,
          createdAt: AT,
          updatedAt: AT,
        }),
      },
      {
        version: 1,
        payload: dealOf({
          id: 'deal_closed',
          orgId: 'org_demo',
          projectId: 'prj_again',
          stage: 'closed',
          ownerUserId: 'u_sales1',
          nextActionAt: null,
          outcome: 'accepted',
          lossReason: null,
          lossComment: null,
          roomAssent: {
            room_a_kit: 'ordered',
            room_a_liv: 'deferred',
            room_a_bed: 'deferred',
          },
          acceptedAmount: 100_000,
          closedAt: '2026-10-22T10:00:00.000Z',
          createdAt: AT,
          updatedAt: '2026-10-22T10:00:00.000Z',
        }),
      },
    ];
    this.quotes = [
      { version: 1, payload: quoteOf('quote_reply', 'prj_reply', 'deal_reply', reply) },
      { version: 1, payload: quoteOf('quote_closed', 'prj_again', 'deal_closed', again) },
    ];
  }

  listProjects(): CommercialProject[] {
    return this.projects.map((item) => ({ ...item }));
  }

  listDeals(): Deal[] {
    return this.deals.map((row) => structuredClone(row.payload));
  }

  open(projectId: string) {
    const project = this.projects.find((item) => item.id === projectId);
    if (!project) throw httpError(404, 'Проект не найден');
    return {
      project: { ...project },
      rooms: this.rooms.filter((item) => item.projectId === projectId).map((item) => ({ ...item })),
      deals: this.deals
        .filter((row) => row.payload.projectId === projectId)
        .map((row) => structuredClone(row.payload)),
      quotes: this.quotes
        .filter((row) => row.payload.projectId === projectId)
        .map((row) => structuredClone(row.payload)),
    };
  }

  createDeal(projectId: string, key: string): Deal {
    return this.once('deal', key, () => {
      if (!this.projects.some((item) => item.id === projectId)) throw httpError(404, 'Проект не найден');
      if (this.deals.some((row) => row.payload.projectId === projectId && !row.payload.closedAt)) {
        throw httpError(409, 'На проекте уже есть активная сделка');
      }
      const now = new Date().toISOString();
      const deal = dealOf({
        id: this.nid('deal'),
        orgId: 'org_demo',
        projectId,
        stage: 'contact',
        ownerUserId: 'u_sales1',
        nextActionAt: null,
        outcome: null,
        lossReason: null,
        lossComment: null,
        roomAssent: {},
        acceptedAmount: null,
        closedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      this.deals.push({ version: 1, payload: deal });
      return structuredClone(deal);
    });
  }

  pause(
    id: string,
    expected: number | null,
    body: { reason: string; comment?: string | null; nextActionAt?: string | null },
  ): Deal {
    const row = this.dealRow(id);
    this.guard(row.version, expected);
    const next = pauseDeal(row.payload, {
      reason: body.reason,
      comment: body.comment || null,
      nextActionAt: body.nextActionAt || null,
      at: new Date().toISOString(),
    });
    if (next.closedAt) throw httpError(409, 'Пауза не закрывает сделку');
    return this.commit(row, next);
  }

  resume(id: string, expected: number | null): Deal {
    const row = this.dealRow(id);
    this.guard(row.version, expected);
    return this.commit(row, resumeDeal(row.payload, new Date().toISOString()));
  }

  decline(
    id: string,
    expected: number | null,
    body: { reason: string; comment?: string | null; early?: boolean },
  ): Deal {
    const row = this.dealRow(id);
    this.guard(row.version, expected);
    const frozen = this.quotes.some(
      (item) => item.payload.dealId === id && Boolean(item.payload.sentConfirmedAt),
    );
    return this.commit(
      row,
      declineDeal(row.payload, {
        reason: body.reason,
        comment: body.comment || null,
        early: body.early ?? !frozen,
        at: new Date().toISOString(),
      }),
    );
  }

  accept(id: string, expected: number | null, roomAssent: Record<string, RoomAssent>): Deal {
    const row = this.dealRow(id);
    this.guard(row.version, expected);
    const quote = this.quotes
      .filter((item) => item.payload.dealId === id && Boolean(item.payload.sentConfirmedAt))
      .sort((a, b) => a.payload.version - b.payload.version)
      .at(-1);
    if (!quote) throw httpError(409, 'Сначала подтвердите отправку предложения');
    return this.commit(row, acceptDeal(row.payload, quote.payload, roomAssent, new Date().toISOString()));
  }

  followUp(
    id: string,
    expected: number | null,
    body: { outcome: 'postponed' | 'no_response'; nextActionAt?: string | null },
  ): Deal {
    const row = this.dealRow(id);
    this.guard(row.version, expected);
    return this.commit(
      row,
      followUpDeal(row.payload, {
        outcome: body.outcome,
        nextActionAt: body.nextActionAt || null,
        close: false,
        at: new Date().toISOString(),
      }),
    );
  }

  createQuote(
    input: { projectId: string; dealId: string; roomObjectIds: string[] },
    key: string,
  ): StoredQuote {
    return this.once('quote', key, () => {
      const deal = this.dealRow(input.dealId);
      if (deal.payload.projectId !== input.projectId) throw httpError(400, 'Сделка другого проекта');
      if (deal.payload.closedAt) throw httpError(409, 'Сделка закрыта');
      if (!input.roomObjectIds.length) throw httpError(400, 'Выберите комнаты');
      const calcs: Record<string, Array<Record<string, unknown>>> = {};
      for (const roomId of input.roomObjectIds) {
        const found = this.rooms.find((item) => item.id === roomId && item.projectId === input.projectId);
        if (!found?.calcType || found.amount == null) throw httpError(400, 'Нет расчёта комнаты');
        calcs[roomId] = [
          {
            id: `calc_${roomId}`,
            calcType: found.calcType,
            amount: found.amount,
            revisionSeq: 1,
            divergent: false,
          },
        ];
      }
      const snapshot = snapshotFromCalcs(input.roomObjectIds, calcs);
      const version =
        this.quotes
          .filter((item) => item.payload.dealId === deal.payload.id)
          .reduce((max, item) => Math.max(max, item.payload.version), 0) + 1;
      const now = new Date().toISOString();
      const quote: StoredQuote = {
        id: this.nid('qr'),
        projectId: input.projectId,
        dealId: deal.payload.id,
        version,
        pdfStorageKey: null,
        amount: snapshot.amount,
        roomObjectIds: [...input.roomObjectIds],
        snapshot: { lines: snapshot.lines, legacyTotal: false },
        createdAt: now,
        createdBy: 'demo',
        sharedAt: null,
        sentConfirmedAt: null,
        sentComment: null,
        lifecycle: 'quote_created',
        recordVersion: 1,
      };
      this.quotes.push({ version: 1, payload: quote });
      const advanced = advanceAuto(deal.payload, 'quote_created', now);
      if (advanced !== deal.payload) this.commit(deal, advanced);
      return structuredClone(quote);
    });
  }

  quoteAction(
    id: string,
    action: 'copy_text' | 'generate_pdf' | 'share' | 'confirm_sent',
    expected: number | null,
    comment?: string | null,
  ): StoredQuote {
    const row = this.quoteRow(id);
    this.guard(row.version, expected);
    const deal = row.payload.dealId ? this.dealRow(row.payload.dealId) : null;
    if (action === 'confirm_sent' && deal?.payload.outcome === 'early_paused') {
      throw httpError(409, 'Сделка на паузе');
    }
    const applied = applyQuoteDocument(row.payload, action, new Date().toISOString());
    let next = applied.quote;
    if (action === 'confirm_sent' && applied.changed && comment) next = { ...next, sentComment: comment };
    if (!applied.changed) return structuredClone(row.payload);
    const saved = this.commit(row, next);
    if (deal && (action === 'share' || action === 'confirm_sent')) {
      const advanced = advanceAuto(
        deal.payload,
        action === 'share' ? 'quote_shared' : 'quote_sent_confirmed',
        new Date().toISOString(),
      );
      if (advanced !== deal.payload) this.commit(deal, advanced);
    }
    return saved;
  }

  /** Правка отправленной версии запрещена: только новая версия. */
  replaceQuote(id: string, expected: number | null): never {
    const row = this.quoteRow(id);
    this.guard(row.version, expected);
    if (row.payload.sentConfirmedAt || row.payload.lifecycle === 'quote_sent_confirmed') {
      throw httpError(409, 'Отправленная версия не меняется. Создайте версию N+1');
    }
    throw httpError(409, 'Правка только новой версией');
  }

  private nid(prefix: string): string {
    this.n += 1;
    return `${prefix}_n${this.n}`;
  }

  private dealRow(id: string): Row<Deal> {
    const row = this.deals.find((item) => item.payload.id === id);
    if (!row) throw httpError(404, 'Сделка не найдена');
    return row;
  }

  private quoteRow(id: string): Row<StoredQuote> {
    const row = this.quotes.find((item) => item.payload.id === id);
    if (!row) throw httpError(404, 'Предложение не найдено');
    return row;
  }

  private guard(version: number, expected: number | null): void {
    if (expected == null || !Number.isFinite(Number(expected))) throw httpError(428, 'Нужен заголовок If-Match');
    if (Number(expected) !== version) throw httpError(409, 'Данные устарели. Обновите экран.');
  }

  private commit<T extends { recordVersion?: number }>(row: Row<T>, next: T): T {
    row.version += 1;
    const saved = { ...next, recordVersion: row.version };
    row.payload = saved;
    return structuredClone(saved);
  }

  private once<T>(slot: string, key: string | null, build: () => T): T {
    const mapKey = `${slot}:${key || ''}`;
    if (key && this.replay.has(mapKey)) return structuredClone(this.replay.get(mapKey)) as T;
    const value = build();
    if (key) this.replay.set(mapKey, structuredClone(value));
    return value;
  }
}

let session: DemoBook | null = null;

export function createDemoBook(): DemoBook {
  return new DemoBook();
}

export function sessionBook(): DemoBook {
  if (!session) session = createDemoBook();
  return session;
}

export function resetSessionBook(): void {
  session = null;
}
