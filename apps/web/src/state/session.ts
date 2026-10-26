import type {
  AudioState,
  ClassLabel,
  CtaPayload,
  RoomWishOption,
  SessionState,
  WizardStep,
  RoomSubstep,
} from './types';
import {
  DEFAULT_ROOM_WISHES,
  ROOM_SUBSTEPS,
  WIZARD_STEPS,
  CALCULATOR_URL,
  HYBRID_CLASS_LABELS,
  roomTypeLabel,
  shouldAskNoiseKind,
} from './types';
import { deriveProfile } from './derive';
import { DEMO_AUDIO_PAIRS } from '../audio/demoAudio';
import {
  airClassFor,
  comfortClassFor,
  impactClassFor,
} from './simulation';

export type LeadHandoff = {
  source: 'problemomer';
  timestamp: string;
  interestFor: SessionState['answers']['interestFor'];
  name?: string;
  phone?: string;
  room: SessionState['answers']['room'];
  cta: CtaPayload;
  sim: {
    before: { Rw: number; Lnw: number; air: ClassLabel; impact: ClassLabel; hybrid: ClassLabel };
    after: { Rw: number; Lnw: number; air: ClassLabel; impact: ClassLabel; hybrid: ClassLabel };
    delta: { Rw: number; Lnw: number };
    perceivedAirPct: number;
    perceivedImpactPct: number;
  };
  whyMultiFrame: string[];
};

function defaultRoom() {
  return {
    roomType: null as SessionState['answers']['room']['roomType'],
    roomTypeCustom: '',
    ceilingAreaM2: null as number | null,
    slabType: 'unknown' as const,
    slabThickness: 'unknown' as const,
    floorAbove: 'unknown' as const,
    houseType: 'unknown' as const,
    objectStage: 'unknown' as const,
    plannedCeiling: 'stretch' as const,
    noisyNeighbors: 'unknown' as const,
    noiseKind: 'unknown' as const,
    roomWishes: [...DEFAULT_ROOM_WISHES] as RoomWishOption[],
  };
}

export function createInitialSession(): SessionState {
  const audio: AudioState = {
    mode: 'mapped',
    pairs: DEMO_AUDIO_PAIRS,
    demoSet: true,
  };

  return {
    schemaVersion: 2,
    step: 'start',
    roomSubstep: ROOM_SUBSTEPS[0]!,
    answers: {
      interestFor: 'self',
      room: defaultRoom(),
      scope: 'ceiling',
    },
    derived: null,
    audio,
    cta: {
      roomType: null,
      ceilingAreaM2: null,
    },
  };
}

export function roomSubstepIndex(sub: RoomSubstep): number {
  return ROOM_SUBSTEPS.indexOf(sub);
}

/** Substeps the user actually sees (noiseKind only if neighbors are noisy). */
export function visibleRoomSubsteps(
  room: SessionState['answers']['room'],
): RoomSubstep[] {
  return ROOM_SUBSTEPS.filter(
    (s) => s !== 'noiseKind' || shouldAskNoiseKind(room.noisyNeighbors),
  );
}

export function visibleRoomSubstepIndex(
  sub: RoomSubstep,
  room: SessionState['answers']['room'],
): number {
  return visibleRoomSubsteps(room).indexOf(sub);
}

/** Next question, skipping noiseKind when neighbors are quiet / unknown. */
export function nextRoomSubstep(
  sub: RoomSubstep,
  room?: SessionState['answers']['room'],
): RoomSubstep | null {
  const i = roomSubstepIndex(sub);
  if (i < 0 || i >= ROOM_SUBSTEPS.length - 1) return null;
  let next = ROOM_SUBSTEPS[i + 1]!;
  if (
    next === 'noiseKind' &&
    room &&
    !shouldAskNoiseKind(room.noisyNeighbors)
  ) {
    return null;
  }
  return next;
}

/** Previous question, skipping noiseKind when it was not asked. */
export function prevRoomSubstep(
  sub: RoomSubstep,
  room?: SessionState['answers']['room'],
): RoomSubstep | null {
  const i = roomSubstepIndex(sub);
  if (i <= 0) return null;
  let prev = ROOM_SUBSTEPS[i - 1]!;
  if (
    prev === 'noiseKind' &&
    room &&
    !shouldAskNoiseKind(room.noisyNeighbors)
  ) {
    prev = ROOM_SUBSTEPS[i - 2]!;
  }
  return prev ?? null;
}

export function isLastRoomSubstep(sub: RoomSubstep): boolean {
  return roomSubstepIndex(sub) === ROOM_SUBSTEPS.length - 1;
}

export function buildCta(session: SessionState): CtaPayload {
  return {
    roomType: session.answers.room.roomType,
    ceilingAreaM2: session.answers.room.ceilingAreaM2,
  };
}

export function withDerived(session: SessionState): SessionState {
  const derived = deriveProfile(session.answers);
  return {
    ...session,
    derived,
    cta: buildCta(session),
    audio: {
      mode: 'mapped',
      pairs: DEMO_AUDIO_PAIRS,
      demoSet: true,
    },
  };
}

export function stepIndex(step: WizardStep): number {
  // Processing is a one-shot ceremony between room and result — not a progress dot.
  if (step === 'processing') return WIZARD_STEPS.indexOf('result');
  return WIZARD_STEPS.indexOf(step);
}

export function nextStep(step: WizardStep): WizardStep | null {
  const i = stepIndex(step);
  if (i < 0 || i >= WIZARD_STEPS.length - 1) return null;
  return WIZARD_STEPS[i + 1]!;
}

export function prevStep(step: WizardStep): WizardStep | null {
  const i = stepIndex(step);
  if (i <= 0) return null;
  return WIZARD_STEPS[i - 1]!;
}

export function roomBasicsComplete(session: SessionState): boolean {
  const room = session.answers.room;
  if (room.roomType == null) return false;
  if (room.roomType === 'other' && !room.roomTypeCustom.trim()) return false;
  return room.ceilingAreaM2 != null && room.ceilingAreaM2 > 0;
}

export function canProceed(session: SessionState): boolean {
  switch (session.step) {
    case 'start':
      return true;
    case 'room':
      if (session.roomSubstep === 'basics') {
        return roomBasicsComplete(session);
      }
      return true;
    case 'processing':
      return true;
    case 'result':
      return true;
    default:
      return false;
  }
}

export function roomNextHint(session: SessionState): string | null {
  if (session.step !== 'room') return null;
  if (session.roomSubstep !== 'basics') return null;
  if (session.answers.room.roomType == null) return 'выберите тип';
  if (
    session.answers.room.roomType === 'other' &&
    !session.answers.room.roomTypeCustom.trim()
  ) {
    return 'впишите название комнаты';
  }
  if (
    session.answers.room.ceilingAreaM2 == null ||
    session.answers.room.ceilingAreaM2 <= 0
  ) {
    return 'укажите площадь';
  }
  return null;
}

/** Ceiling-only area handoff into MultiFrame calculator (no walls). */
export function buildCalculatorUrl(cta: CtaPayload, base = CALCULATOR_URL): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://local.invalid';
  const url = new URL(base, origin);
  if (cta.ceilingAreaM2 != null && cta.ceilingAreaM2 > 0) {
    url.searchParams.set('area', String(cta.ceilingAreaM2));
    url.searchParams.set('mode', 'area');
    url.searchParams.set('walls', '0');
    url.searchParams.set('source', 'problemomer');
  }
  if (cta.roomType) url.searchParams.set('roomType', cta.roomType);
  return url.toString();
}

export function toSessionJson(session: SessionState): string {
  const full = withDerived(session);
  return JSON.stringify(
    {
      schemaVersion: full.schemaVersion,
      answers: full.answers,
      derived: full.derived,
      audio: full.audio,
      cta: full.cta,
    },
    null,
    2,
  );
}

function classSide(Rw: number, Lnw: number) {
  return {
    Rw,
    Lnw,
    air: airClassFor(Rw),
    impact: impactClassFor(Lnw),
    hybrid: comfortClassFor(Rw, Lnw),
  };
}

/**
 * Digest for PDF / clipboard summary. Not used for CRM.
 * Anonymous analytics: see `buildAnalyticsPayload` in `src/analytics/payload.ts`.
 */
export function buildLeadHandoff(
  session: SessionState,
  contact?: { name?: string; phone?: string },
): LeadHandoff {
  const full = withDerived(session);
  const sim = full.derived!.simulation;
  return {
    source: 'problemomer',
    timestamp: new Date().toISOString(),
    interestFor: full.answers.interestFor,
    name: contact?.name,
    phone: contact?.phone,
    room: full.answers.room,
    cta: full.cta,
    sim: {
      before: classSide(sim.before.Rw, sim.before.Lnw),
      after: classSide(sim.after.Rw, sim.after.Lnw),
      delta: sim.delta,
      perceivedAirPct: sim.perceivedAirPct,
      perceivedImpactPct: sim.perceivedImpactPct,
    },
    whyMultiFrame: full.derived!.whyMultiFrame,
  };
}

/** Plain-text digest for WhatsApp / менеджер (client path). */
export function buildClientSummary(session: SessionState): string {
  const handoff = buildLeadHandoff(session);
  const room = handoff.room;
  const roomName = roomTypeLabel(room);
  const area = room.ceilingAreaM2 != null ? `${room.ceilingAreaM2} м²` : 'площадь н/д';
  const b = handoff.sim.before;
  const a = handoff.sim.after;
  const lines = [
    'Сводка Проблемомер · MultiFrame',
    `${roomName} · ${area}`,
    `Сейчас: воздух ${HYBRID_CLASS_LABELS[b.air]}, удар ${HYBRID_CLASS_LABELS[b.impact]} (Rw ${b.Rw} / Lnw ${b.Lnw})`,
    `С MultiFrame: воздух ${HYBRID_CLASS_LABELS[a.air]}, удар ${HYBRID_CLASS_LABELS[a.impact]} (Rw ${a.Rw} / Lnw ${a.Lnw})`,
    `Δ: +${Math.abs(handoff.sim.delta.Rw)} дБ воздух · −${Math.abs(handoff.sim.delta.Lnw)} дБ удар`,
    `Ощущение: ≈ −${handoff.sim.perceivedAirPct}% воздух · ≈ −${handoff.sim.perceivedImpactPct}% удар`,
    ...handoff.whyMultiFrame.slice(0, 2).map((w) => `• ${w}`),
    'Эффект MultiFrame · Проблемомер',
  ];
  return lines.join('\n');
}
