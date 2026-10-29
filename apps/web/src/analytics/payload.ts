import type { ClassLabel, SessionState } from '../state/types';
import {
  airClassFor,
  comfortClassAfterMultiFrame,
  comfortClassFor,
  impactClassFor,
} from '../state/simulation';
import { withDerived } from '../state/session';
import { channelLabel, getChannel, type ChannelAttribution } from './channel';
import { getAnalyticsSessionId } from './sessionId';

/** «С MultiFrame» ниже класса В не показываем (см. MULTIFRAME_MIN_LEVEL в simulation.ts). */
function classSide(Rw: number, Lnw: number, afterMultiFrame = false) {
  const floor = (cls: ClassLabel): ClassLabel => (afterMultiFrame && cls === 'below' ? 'V' : cls);
  return {
    Rw,
    Lnw,
    air: floor(airClassFor(Rw)),
    impact: floor(impactClassFor(Lnw)),
    hybrid: afterMultiFrame ? comfortClassAfterMultiFrame(Rw, Lnw) : comfortClassFor(Rw, Lnw),
  };
}

/** Anonymous completion payload — no name/phone/contact fields. */
export type AnalyticsPayload = {
  source: 'problemomer';
  sessionId: string;
  channel: ChannelAttribution;
  channelLabel: string;
  timestamp: string;
  room: SessionState['answers']['room'];
  sim: {
    before: ReturnType<typeof classSide>;
    after: ReturnType<typeof classSide>;
    delta: { Rw: number; Lnw: number };
    perceivedAirPct: number;
    perceivedImpactPct: number;
  };
};

export function buildAnalyticsPayload(session: SessionState): AnalyticsPayload | null {
  const full = withDerived(session);
  if (!full.derived) return null;
  const sim = full.derived.simulation;
  const channel = getChannel();
  return {
    source: 'problemomer',
    sessionId: getAnalyticsSessionId(),
    channel,
    channelLabel: channelLabel(channel),
    timestamp: new Date().toISOString(),
    room: full.answers.room,
    sim: {
      before: classSide(sim.before.Rw, sim.before.Lnw),
      after: classSide(sim.after.Rw, sim.after.Lnw, true),
      delta: sim.delta,
      perceivedAirPct: sim.perceivedAirPct,
      perceivedImpactPct: sim.perceivedImpactPct,
    },
  };
}

export function eventParamsFromSession(
  session: SessionState,
): Record<string, string | number | boolean | undefined> {
  const room = session.answers.room;
  const sim = session.derived?.simulation;
  const ch = getChannel();
  return {
    channel: channelLabel(ch),
    houseType: room.houseType,
    objectStage: room.objectStage,
    roomType: room.roomType ?? undefined,
    plannedCeiling: room.plannedCeiling,
    noisyNeighbors: room.noisyNeighbors,
    noiseKind: room.noiseKind,
    roomWishes: room.roomWishes.join('|') || undefined,
    roomSubstep: session.roomSubstep,
    classBefore: sim ? comfortClassFor(sim.before.Rw, sim.before.Lnw) : undefined,
    classAfter: sim ? comfortClassAfterMultiFrame(sim.after.Rw, sim.after.Lnw) : undefined,
  };
}
