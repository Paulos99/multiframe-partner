import {describe,it,expect} from 'vitest';
import {canMoveRoom,KANBAN_STAGES} from './kanban';
describe('kanban permissions',()=>{
 it('keeps all five stages',()=>expect(KANBAN_STAGES).toEqual(['draft','measured','quote_sent','install','closed']));
 it.each(['owner','sales','measurer','admin'] as const)('%s can select every stage',role=>expect(KANBAN_STAGES.every(s=>canMoveRoom(role,s))).toBe(true));
 it('crew can only move into install or closed',()=>expect(KANBAN_STAGES.filter(s=>canMoveRoom('crew',s))).toEqual(['install','closed']));
});
