import { resolveSyncUi } from './syncLabels.ts';
import { nextActionsForRole } from './nextActions.ts';
import { WORK_ENTRIES } from './entryPoints.ts';
import type { JobObject } from '../../../../../packages/shared/partner';

function equal(actual: unknown, expected: unknown, msg?: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${msg || 'assert'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

equal(resolveSyncUi({ online: true, pending: 0, authHold: false }).label, 'Синхронизировано');
equal(resolveSyncUi({ online: true, pending: 2, authHold: false }).label, 'Выгружается');
equal(resolveSyncUi({ online: false, pending: 1, authHold: false }).label, 'Сохранено на устройстве');
equal(resolveSyncUi({ online: true, pending: 1, authHold: false, failed: true }).label, 'Требуется повторить');
equal(resolveSyncUi({ online: true, pending: 3, authHold: true }).label, 'Сохранено на устройстве');

equal(WORK_ENTRIES.length, 2);
equal(WORK_ENTRIES.map((e) => e.id), ['consultation', 'quick_calc']);
equal(WORK_ENTRIES.map((e) => e.route), ['problemomer', 'calculator']);
if (new Set(WORK_ENTRIES.map((e) => e.route)).size !== 2) {
  throw new Error('входы должны вести в разные инструменты');
}

const objects = [
  {
    id: 'o1',
    orgId: 'org',
    createdAt: 't',
    updatedAt: 't',
    createdBy: 'u',
    assignedTo: 'm1',
    status: 'measured',
    clientName: 'Клиент',
    clientPhone: '',
    address: 'ул. 1',
    city: '',
    room: {},
    estimate: null,
    clientSummary: '',
    history: [],
  },
  {
    id: 'o2',
    orgId: 'org',
    createdAt: 't',
    updatedAt: 't',
    createdBy: 'u',
    assignedTo: 'c1',
    status: 'install',
    clientName: '',
    clientPhone: '',
    address: 'ул. 2',
    city: '',
    room: {},
    estimate: null,
    clientSummary: '',
    history: [],
  },
] as JobObject[];

const sales = nextActionsForRole('sales', objects);
if (!sales.some((a) => a.title.includes('КП'))) throw new Error('sales should suggest quote');
const crew = nextActionsForRole('crew', objects);
if (!crew.some((a) => a.objectId === 'o2')) throw new Error('crew should see install');

console.log('commercial sync/entry/nextActions: ok');
