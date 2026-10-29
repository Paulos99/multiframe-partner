/**
 * Simulation facade: Trofimov + frequency model + in-room source layer.
 * MultiFrame Δ is field_in_situ (object tests: foamblock / Kostroma / Andrianova).
 */
import type {
  ClassLabel,
  ClassStatus,
  ComfortLevel,
  DerivedSimSide,
  DerivedSimulation,
  RoomAnswers,
  ScaleLevel,
  SessionAnswers,
  SlabKey,
} from './types';
import {
  CLASS_TO_LEVEL,
  HYBRID_CLASS_LABELS,
  SCALE_LEVELS,
  SCALE_LEVEL_LABELS,
  SIMULATION_BADGE,
} from './types';
import { buildConstruction, resolveSlab } from './acoustic/construction';
import { applyMultiFrame } from './acoustic/multiframe';
import { buildReceiving, quietFromReceivedAir, quietFromReceivedImpact } from './acoustic/receiving';
import { buildReverbProfile } from './acoustic/reverb';
import { perceivedReductionPct } from './acoustic/soundPressureTable';
import { seriesFromBands } from './spectrum';

export { perceivedReductionPct } from './acoustic/soundPressureTable';

export type { SlabKey };

/** Trofimov bare-slab anchors (no floor, no drum) — lookup / debug. */
export const SLABS: Record<SlabKey, { Rw: number; Lnw: number }> = {
  '140': { Rw: 50, Lnw: 80 },
  '160': { Rw: 52, Lnw: 78 },
  '180': { Rw: 54, Lnw: 76 },
  '200': { Rw: 55, Lnw: 74 },
  pk220: { Rw: 52, Lnw: 74 },
  mono250: { Rw: 56, Lnw: 74 },
};

export const NORMS = {
  A: { Rw: 54, Lnw: 55 },
  B: { Rw: 52, Lnw: 58 },
  V: { Rw: 50, Lnw: 60 },
} as const;

/** Typical centre for ordinary concrete (Kostroma-like) — not a flat delta. */
export const DELTA = { Rw: 2, Lnw: -6 } as const;

export const SIM_META = {
  source: 'field_in_situ' as const,
  disclaimer: 'field_objects' as const,
  deltaRange: {
    Rw: [1, 12] as const,
    Lnw: [1, 11] as const,
  },
};

const CLASS_ORDER = ['A', 'B', 'V'] as const;

export function resolveSlabKey(room: RoomAnswers): SlabKey {
  return resolveSlab(room).slabKey;
}

export function grade(
  Rw: number,
  Lnw: number,
): { classLabel: ClassLabel; classStatus: ClassStatus; label: string } {
  for (const cls of CLASS_ORDER) {
    const n = NORMS[cls];
    if (Rw >= n.Rw && Lnw <= n.Lnw) {
      return {
        classLabel: cls,
        classStatus: 'ok',
        label: cls === 'A' ? 'высокий комфорт' : 'комфорт',
      };
    }
  }
  for (const cls of CLASS_ORDER) {
    if (Rw >= NORMS[cls].Rw) {
      return {
        classLabel: cls,
        classStatus: 'partial',
        label: 'по воздуху лучше, по удару пока дискомфорт',
      };
    }
  }
  return {
    classLabel: 'below',
    classStatus: 'below',
    label: 'дискомфорт',
  };
}

export function buildSide(Rw: number, Lnw: number): DerivedSimSide {
  const { classLabel, classStatus, label } = grade(Rw, Lnw);
  return { Rw, Lnw, classLabel, classStatus, label };
}

function feelingFromReceived(
  side: DerivedSimSide,
  receivedAir: number,
  loudNeighbors: boolean,
  wishes: RoomAnswers['roomWishes'],
): ComfortLevel {
  const focused =
    wishes.includes('from_above') ||
    wishes.includes('music_recording') ||
    wishes.includes('privacy_out');
  const airLimit = focused ? 54 : 58;
  if (loudNeighbors || receivedAir >= airLimit) {
    if (side.classLabel === 'A' && side.classStatus === 'ok') return 'ok';
    return 'bothers';
  }
  if (side.classStatus === 'ok' && side.classLabel === 'A') return 'quiet';
  if (side.classStatus === 'ok' && side.classLabel === 'B') return 'ok';
  if (side.classStatus === 'partial') return 'ok';
  if (side.Lnw >= 74 || side.Rw < 52) return 'bothers';
  return 'ok';
}

export function comfortScore(Rw: number, Lnw: number): number {
  return Rw - NORMS.V.Rw + (NORMS.V.Lnw - Lnw);
}

export function comfortClassFor(Rw: number, Lnw: number): ClassLabel {
  if (Rw >= NORMS.A.Rw && Lnw <= NORMS.A.Lnw) return 'A';
  const s = comfortScore(Rw, Lnw);
  if (s >= 6) return 'B';
  if (s >= -3) return 'V';
  return 'below';
}

function clampPct(v: number): number {
  return Math.round(Math.min(96, Math.max(4, v)));
}

export function airQuietPct(Rw: number): number {
  return clampPct(((Rw - 45) / (70 - 45)) * 100);
}

export function impactQuietPct(Lnw: number): number {
  return clampPct(((82 - Lnw) / (82 - 58)) * 100);
}

/**
 * Artificial impact baseline. Field ΔLnw stays put; both ends move down by the
 * same amount so MultiFrame always lands on «приемлемо» (Lnw ≤ class В).
 * Lab fixtures do not use this — only the product simulation.
 */
export function liftImpactBaseline(
  beforeLnw: number,
  afterLnw: number,
): { before: number; after: number } {
  const credit = Math.max(0, afterLnw - NORMS.V.Lnw);
  return { before: beforeLnw - credit, after: afterLnw - credit };
}

export function deriveSimulation(answers: SessionAnswers): DerivedSimulation {
  const constr = buildConstruction(answers.room);
  const mf = applyMultiFrame(constr);
  const impact = liftImpactBaseline(constr.Lnw, mf.Lnw);
  const rec = buildReceiving(answers.room, constr, mf);
  const loudNeighbors =
    answers.room.noisyNeighbors === 'often_noisy' ||
    answers.room.noisyNeighbors === 'sometimes_noisy';

  const recAirBefore = rec.airDba.before;
  const recAirAfter = rec.airDba.after;
  const recImpBefore = rec.impactDba.before;
  const recImpAfter = rec.impactDba.after;

  const before = buildSide(constr.Rw, impact.before);
  const after = buildSide(mf.Rw, impact.after);

  const reverb = buildReverbProfile(answers.room);

  return {
    before,
    after,
    delta: { Rw: mf.deltaRw, Lnw: mf.deltaLnw },
    housingClass: after.classLabel,
    source: SIM_META.source,
    disclaimer: SIM_META.disclaimer,
    deltaRange: mf.deltaRange,
    uiLabel: SIMULATION_BADGE,
    slabKey: constr.resolved.slabKey,
    feelingBefore: feelingFromReceived(before, recAirBefore, loudNeighbors, answers.room.roomWishes),
    feelingAfter: feelingFromReceived(after, recAirAfter, false, answers.room.roomWishes),
    honestLines: [
      'Индексы Rw и Lnw зависят от перекрытия, пола сверху и типа дома — не от того, насколько громко шумят соседи.',
      'Громкость в комнате считается по спектру: как шумят сверху, тип комнаты, площадь и мебель.',
      'Потолок смягчает шаги сверху.',
    ],
    // % next to Rw/Lnw must follow those deltas (log loudness), not a floored L2 crumb.
    perceivedAirPct: perceivedReductionPct(Math.abs(mf.deltaRw)),
    perceivedImpactPct: perceivedReductionPct(Math.abs(mf.deltaLnw)),
    airSpectrum: seriesFromBands(constr.R, mf.R, mf.deltaRw),
    impactSpectrum: seriesFromBands(
      constr.impactIsolation,
      mf.impactIsolation,
      Math.abs(mf.deltaLnw),
    ),
    quietAirBefore: quietFromReceivedAir(recAirBefore),
    quietAirAfter: quietFromReceivedAir(recAirAfter),
    quietImpactBefore: quietFromReceivedImpact(recImpBefore),
    quietImpactAfter: quietFromReceivedImpact(recImpAfter),
    receivedAirDb: { before: recAirBefore, after: recAirAfter },
    receivedImpactDb: { before: recImpBefore, after: recImpAfter },
    receivedAirBands: {
      before: [...rec.airBands.before],
      after: [...rec.airBands.after],
    },
    receivedImpactBands: {
      before: [...rec.impactBands.before],
      after: [...rec.impactBands.after],
    },
    reverb,
  };
}

export const CLASS_CYR: Record<'A' | 'B' | 'V', string> = {
  A: 'А',
  B: 'Б',
  V: 'В',
};

export function classCyr(label: ClassLabel): string {
  if (label === 'below') return '';
  return CLASS_CYR[label];
}

export function airClassFor(Rw: number): ClassLabel {
  if (Rw >= NORMS.A.Rw) return 'A';
  if (Rw >= NORMS.B.Rw) return 'B';
  if (Rw >= NORMS.V.Rw) return 'V';
  return 'below';
}

export function impactClassFor(Lnw: number): ClassLabel {
  if (Lnw <= NORMS.A.Lnw) return 'A';
  if (Lnw <= NORMS.B.Lnw) return 'B';
  if (Lnw <= NORMS.V.Lnw) return 'V';
  return 'below';
}

/**
 * Уровни шкалы на экране результата: ровно три (см. SCALE_LEVELS в types.ts).
 * Соответствие порогам СП 51.13330:
 *   воздух (Rw):  ≥ 54 дБ — «Высокий комфорт» (класс А); 50–53 дБ — «Комфорт» (классы Б, В); < 50 дБ — «Дискомфорт»;
 *   удар (Lnw):   ≤ 60 дБ — «Комфорт» (классы А, Б, В); > 60 дБ — «Дискомфорт».
 * По ударному шуму высокий комфорт не обещаем: верхняя ступень шкалы удара — «Комфорт».
 */
export type FeltStep = ScaleLevel;

export const FELT_STEPS: FeltStep[] = [...SCALE_LEVELS];

export const FELT_STEP_LABELS: Record<FeltStep, string> = SCALE_LEVEL_LABELS;

/** Какие ступени показываем на шкале удара: «Высокий комфорт» по удару не обещаем. */
export const IMPACT_SCALE_STEPS: FeltStep[] = ['discomfort', 'comfort'];

/** Уровень по воздуху от Rw. */
export function airFeltFromIndex(Rw: number): FeltStep {
  if (Rw >= NORMS.A.Rw) return 'high';
  if (Rw >= NORMS.V.Rw) return 'comfort';
  return 'discomfort';
}

/** Уровень по удару от Lnw (меньше — лучше). Верхняя ступень — «Комфорт». */
export function impactFeltFromIndex(Lnw: number): FeltStep {
  return Lnw <= NORMS.V.Lnw ? 'comfort' : 'discomfort';
}

/**
 * Правило продукта: результат с MultiFrame не показываем на «Дискомфорте».
 * Цифры Rw и Lnw рядом остаются как есть. Пол «Комфорт» нужен только для слабых перекрытий
 * (деревянные балки, тонкие плиты), где расчётный Rw после монтажа ниже 50 дБ.
 */
export const MULTIFRAME_MIN_LEVEL: FeltStep = 'comfort';

function atLeastMultiFrameLevel(step: FeltStep): FeltStep {
  return FELT_STEPS.indexOf(step) < FELT_STEPS.indexOf(MULTIFRAME_MIN_LEVEL) ? MULTIFRAME_MIN_LEVEL : step;
}

/** Уровень по воздуху «с MultiFrame». */
export function airFeltAfterMultiFrame(Rw: number): FeltStep {
  return atLeastMultiFrameLevel(airFeltFromIndex(Rw));
}

/** Уровень по удару «с MultiFrame». */
export function impactFeltAfterMultiFrame(Lnw: number): FeltStep {
  return atLeastMultiFrameLevel(impactFeltFromIndex(Lnw));
}

/** Класс комнаты «с MultiFrame»: ниже В не показываем (см. MULTIFRAME_MIN_LEVEL). */
export function comfortClassAfterMultiFrame(Rw: number, Lnw: number): ClassLabel {
  const cls = comfortClassFor(Rw, Lnw);
  return cls === 'below' ? 'V' : cls;
}

export const airFeltStep = airFeltFromIndex;
export const impactFeltStep = impactFeltFromIndex;

/** Уровень шкалы для класса СП. Понимает и коды уровней (аналитика после слияния). */
export function comfortLevelOf(value: string | null | undefined): ScaleLevel | null {
  if (!value) return null;
  if ((SCALE_LEVELS as readonly string[]).includes(value)) return value as ScaleLevel;
  return CLASS_TO_LEVEL[value as ClassLabel] ?? null;
}

/** Название уровня для заголовка блока на экране результата и в PDF. */
export function officialComfortLabel(cls: ClassLabel): string {
  return HYBRID_CLASS_LABELS[cls];
}

const LEVEL_RANK: Record<ScaleLevel, number> = { high: 0, comfort: 1, discomfort: 2 };

/** Название уровня по коду класса СП (A/B/V/below) или по коду уровня. */
export function comfortClassLabel(value: string | null | undefined): string {
  if (!value || value === '?' || value === 'unknown') return '';
  const level = comfortLevelOf(value);
  return level ? SCALE_LEVEL_LABELS[level] : value;
}

/** Переход проблемомера: «Дискомфорт → Высокий комфорт». */
export function comfortTransitionLabel(
  before: string | null | undefined,
  after: string | null | undefined,
): string {
  const left = comfortClassLabel(before);
  const right = comfortClassLabel(after);
  if (left && right) return `${left} → ${right}`;
  return left || right;
}

/** Ключ перехода по трём уровням: коды классов СП A/B/V/below сводятся к high/comfort/discomfort. */
export function comfortTransitionKey(key: string): string {
  const parts = key.split('→');
  if (parts.length !== 2) return comfortLevelOf(key) ?? key;
  const left = comfortLevelOf(parts[0]) ?? (parts[0] || '?');
  const right = comfortLevelOf(parts[1]) ?? (parts[1] || '?');
  return `${left}→${right}`;
}

/** Сводит переходы старых четырёх классов к трём уровням: «Б → В» и «В → В» — это «Комфорт → Комфорт». */
export function mergeComfortTransitions<T extends { key: string; count: number }>(
  items: readonly T[],
): T[] {
  const merged = new Map<string, T>();
  for (const item of items) {
    const key = comfortTransitionKey(item.key);
    const prev = merged.get(key);
    merged.set(key, prev ? { ...prev, count: prev.count + item.count } : { ...item, key });
  }
  return [...merged.values()];
}

/** Порядок «было → станет»: сначала по уровню «было», затем по «станет». */
export function comfortTransitionRank(key: string): number {
  const parts = key.split('→');
  if (parts.length !== 2) return 10_000;
  const rank = (value: string) => {
    const level = comfortLevelOf(value);
    return level ? LEVEL_RANK[level] : 50;
  };
  return rank(parts[0] || '') * 100 + rank(parts[1] || '');
}

export function airChip(side: DerivedSimSide): string {
  return FELT_STEP_LABELS[airFeltFromIndex(side.Rw)].toLowerCase();
}

export function impactChip(side: DerivedSimSide): string {
  return FELT_STEP_LABELS[impactFeltFromIndex(side.Lnw)].toLowerCase();
}

/** @deprecated aliases */
export const buildSimulation = deriveSimulation;
export const resolveSlabPreset = resolveSlabKey;

/**
 * Три уровня шкалы Проблемомера и их связь с порогами СП 51.13330.2011.
 * Название блока — уровень шкалы; классы СП (А, Б, В) остаются только в пояснении к порогам.
 */
export const NORM_ROWS: {
  key: string;
  label: string;
  rw: string;
  lnw: string;
  sp: string;
  muted?: boolean;
}[] = [
  {
    key: 'A',
    label: SCALE_LEVEL_LABELS.high,
    rw: `≥ ${NORMS.A.Rw}`,
    lnw: `≤ ${NORMS.A.Lnw}`,
    sp: 'класс А',
  },
  {
    key: 'B',
    label: SCALE_LEVEL_LABELS.comfort,
    rw: `≥ ${NORMS.V.Rw}`,
    lnw: `≤ ${NORMS.V.Lnw}`,
    sp: 'классы Б и В',
  },
  {
    key: 'below',
    label: SCALE_LEVEL_LABELS.discomfort,
    rw: `< ${NORMS.V.Rw}`,
    lnw: `> ${NORMS.V.Lnw}`,
    sp: 'ниже классов СП',
    muted: true,
  },
];

/** Какая строка таблицы подсвечивается для класса СП (Б и В — одна строка «Комфорт»). */
export function normRowKey(cls: ClassLabel): string {
  return cls === 'V' ? 'B' : cls;
}

