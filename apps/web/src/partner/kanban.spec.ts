import { describe, it, expect } from 'vitest';
import { canMoveRoom, KANBAN_STAGES } from './kanban';
describe('kanban permissions', () => {
  it('keeps all five stages', () =>
    expect(KANBAN_STAGES).toEqual([
      'draft',
      'measured',
      'quote_sent',
      'install',
      'closed',
    ]));
  it.each(['owner', 'sales'] as const)(
    '%s can move a room through every stage',
    (role) =>
      expect(KANBAN_STAGES.every((s) => canMoveRoom(role, s))).toBe(true),
  );
  it.each(['measurer', 'crew', 'admin'] as const)(
    '%s does not move rooms',
    (role) =>
      expect(KANBAN_STAGES.filter((s) => canMoveRoom(role, s))).toEqual([]),
  );
});
