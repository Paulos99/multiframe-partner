/**
 * В ?demo=1 очередь менеджера не должна быть пустой,
 * если в живых данных нет срочных задач. Комнаты только в памяти экрана.
 */

import type { JobObject, SessionUser } from '../../../../../packages/shared/partner';
import { buildLocalDemoObjects } from '../demoSeed';
import { nextActionsForRole } from './nextActions';

export function overlayDemoSalesRooms(
  objects: JobObject[],
  user: Pick<SessionUser, 'id' | 'orgId' | 'role'>,
  demo: boolean,
): JobObject[] {
  if (!demo || user.role !== 'sales') return objects;
  if (nextActionsForRole('sales', objects, []).length > 0) return objects;
  const orgId = user.orgId || 'org_demo';
  const actionable = buildLocalDemoObjects().filter(
    (obj) => obj.status === 'measured' || obj.status === 'quote_sent',
  );
  const own = actionable.filter((obj) => obj.orgId === orgId);
  const rows = (own.length ? own : actionable.filter((obj) => obj.orgId === 'org_demo')).slice(0, 6);
  const have = new Set(objects.map((obj) => obj.id));
  const extras = rows
    .filter((obj) => !have.has(obj.id))
    .map((obj) => ({
      ...obj,
      orgId,
      createdBy: user.id,
      assignedTo: user.id,
      projectId: obj.status === 'quote_sent' ? 'demo-sales-quote' : 'demo-sales-measure',
      roomName: obj.clientName,
    }));
  return extras.length ? [...objects, ...extras] : objects;
}
