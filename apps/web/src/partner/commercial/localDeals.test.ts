/**
 * Локальные сделки/КП: копирование не подтверждает отправку.
 */
import {
  applyLocalQuoteAction,
  createLocalDeal,
  createLocalQuote,
  ensureDealsForProjects,
  listLocalDeals,
  patchLocalDeal,
} from './localDeals.ts';
import type { JobObject, Project } from '../../../../../packages/shared/partner';

const store = new Map<string, string>();
const memory = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => {
    store.set(k, v);
  },
  removeItem: (k: string) => {
    store.delete(k);
  },
};
Object.defineProperty(globalThis, 'localStorage', { value: memory, configurable: true });

function equal(a: unknown, b: unknown, msg?: string) {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error(`${msg || 'assert'}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`);
  }
}

store.clear();
const deal = createLocalDeal({
  orgId: 'org_demo',
  projectId: 'prj_1',
  ownerUserId: 'u_sales',
});
equal(deal.stage, 'contact');
equal(listLocalDeals('org_demo').length, 1);

const quote = createLocalQuote({ projectId: 'prj_1', dealId: deal.id, amount: 1000 });
equal(quote.lifecycle, 'quote_created');
equal(listLocalDeals('org_demo')[0]?.stage, 'quote_created');

const afterCopy = applyLocalQuoteAction(quote.id, 'copy_text');
equal(afterCopy?.lifecycle, 'quote_created', 'copy does not advance lifecycle');
equal(listLocalDeals('org_demo')[0]?.stage, 'quote_created');

const afterSent = applyLocalQuoteAction(quote.id, 'confirm_sent', 'whatsapp');
equal(afterSent?.lifecycle, 'quote_sent_confirmed');
equal(listLocalDeals('org_demo')[0]?.stage, 'quote_sent_confirmed');

const closed = patchLocalDeal(deal.id, { outcome: 'accepted' });
equal(closed?.outcome, 'accepted');
equal(closed?.stage, 'quote_accepted');

store.clear();
const projects = [
  {
    id: 'prj_a',
    orgId: 'org_demo',
    name: 'A',
    clientName: '',
    clientPhone: '',
    address: '',
    city: '',
    createdAt: 't',
    updatedAt: 't',
    createdBy: 'u',
  },
] as Project[];
const objects = [
  {
    id: 'o1',
    orgId: 'org_demo',
    projectId: 'prj_a',
    createdAt: 't',
    updatedAt: 't',
    createdBy: 'u',
    assignedTo: null,
    status: 'draft',
    clientName: '',
    clientPhone: '',
    address: '',
    city: '',
    room: {},
    estimate: null,
    clientSummary: '',
    history: [],
  },
] as JobObject[];
const ensured = ensureDealsForProjects('org_demo', 'u_owner', projects, objects);
equal(ensured.length, 1);
equal(ensureDealsForProjects('org_demo', 'u_owner', projects, objects).length, 1, 'idempotent');

console.log('localDeals: ok');
