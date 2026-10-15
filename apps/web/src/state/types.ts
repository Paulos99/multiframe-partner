/** schemaVersion: 2 — MultiFrame Проблемомер (workshop 2026-09-13) */

export type InterestFor = 'self' | 'client';

export type RoomType =
  | 'living'
  | 'bedroom'
  | 'kids'
  | 'kitchen'
  | 'office'
  | 'other';

/** Backend slab keys for deriveSimulation */
export type SlabKey = '140' | '160' | '180' | '200' | 'pk220' | 'mono250';

export type SlabTypeOption = 'monolith' | 'hollow' | 'wood' | 'unknown';

export type SlabThicknessOption =
  | 'up_to_160'
  | 'about_160_200'
  | 'about_200_250'
  | 'over_250'
  | 'unknown';

export type FloorAboveOption = 'unknown' | 'ordinary' | 'floating';

export type HouseTypeOption =
  | 'panel'
  | 'block'
  | 'brick'
  | 'monolith'
  | 'wood'
  | 'unknown';

export type ObjectStageOption = 'newbuild' | 'renovation' | 'occupied' | 'unknown';

/** Ceiling finish the user has or plans (not MultiFrame itself). */
export type PlannedCeilingOption =
  | 'stretch'
  | 'gypsum'
  | 'plaster'
  | 'other_exists'
  | 'unknown';

export type NoisyNeighborsOption = 'unknown' | 'usually_quiet' | 'sometimes_noisy' | 'often_noisy';

/** What kind of noise they hear from above — asked only if neighbors are noisy. */
export type NoiseKindOption = 'impact' | 'airborne' | 'mixed' | 'unknown';

/**
 * Everyday goal — personalizes Result copy and demo accent.
 * Does not change construction Rw/Lnw. Labels avoid MultiFrame brand.
 */
export type RoomWishOption =
  | 'from_above'
  | 'privacy_out'
  | 'music_recording'
  | 'general'
  | 'other';

/** Legacy noise tags — still used for audio demo grouping, not a survey */
export type NoiseScenario =
  | 'steps'
  | 'drop'
  | 'furniture'
  | 'talk'
  | 'tv'
  | 'music'
  | 'repair'
  | 'dog_bark'
  | 'dog_claws'
  | 'kids_run'
  | 'washer'
  | 'vacuum';

export type ComfortLevel = 'quiet' | 'ok' | 'bothers';
export type NoiseType = 'impact' | 'airborne' | 'mixed';

/** Flow: Start → Room → Processing → Result (audio lives inside Result; no separate Сравнение) */
export type WizardStep = 'start' | 'room' | 'processing' | 'result';

/** Sub-steps inside Room (one question block per screen). External first, then internal. */
export type RoomSubstep =
  | 'houseType'
  | 'slabType'
  | 'slabThickness'
  | 'basics'
  | 'plannedCeiling'
  | 'objectStage'
  | 'noisyNeighbors'
  | 'noiseKind'
  | 'roomWish';

export type RoomFactorGroup = 'external' | 'internal';

export const ROOM_SUBSTEPS: RoomSubstep[] = [
  'houseType',
  'slabType',
  'slabThickness',
  'basics',
  'plannedCeiling',
  'objectStage',
  'noisyNeighbors',
  'noiseKind',
  'roomWish',
];

export const ROOM_FACTOR_GROUP: Record<RoomSubstep, RoomFactorGroup> = {
  houseType: 'external',
  slabType: 'external',
  slabThickness: 'external',
  basics: 'internal',
  plannedCeiling: 'internal',
  objectStage: 'internal',
  noisyNeighbors: 'internal',
  noiseKind: 'internal',
  roomWish: 'internal',
};

export const ROOM_FACTOR_GROUP_LABEL: Record<RoomFactorGroup, string> = {
  external: 'Внешние факторы',
  internal: 'Внутренние факторы',
};

export type ClassLabel = 'A' | 'B' | 'V' | 'below';
export type ClassStatus = 'ok' | 'partial' | 'below';

export interface DerivedSimSide {
  Rw: number;
  Lnw: number;
  classLabel: ClassLabel;
  classStatus: ClassStatus;
  label?: string;
}

export interface SpectrumSeries {
  hz: readonly number[];
  before: number[];
  after: number[];
  /** Mean uplift shown on the curve (matches model Δ center) */
  targetDelta: number;
}

export interface DerivedSimulation {
  before: DerivedSimSide;
  after: DerivedSimSide;
  delta: { Rw: number; Lnw: number };
  housingClass: ClassLabel;
  source: 'field_in_situ';
  disclaimer: 'field_objects';
  deltaRange: { Rw: readonly [number, number]; Lnw: readonly [number, number] };
  uiLabel: string;
  slabKey: SlabKey;
  feelingBefore: ComfortLevel;
  feelingAfter: ComfortLevel;
  honestLines: string[];
  /** Perceived loudness reduction % from received Δ (log map, not linear) */
  perceivedAirPct: number;
  perceivedImpactPct: number;
  /** Construction spectra for Result charts (isolation, higher = quieter). */
  airSpectrum: SpectrumSeries;
  impactSpectrum: SpectrumSeries;
  quietAirBefore: number;
  quietAirAfter: number;
  quietImpactBefore: number;
  quietImpactAfter: number;
  receivedAirDb: { before: number; after: number };
  receivedImpactDb: { before: number; after: number };
  /** In-room L2(f) bands (1/3-oct) for truthful audio shaping. */
  receivedAirBands: { before: number[]; after: number[] };
  receivedImpactBands: { before: number[]; after: number[] };
  /** Room echo % (lower is better) and playback tail params (demo, not ISO RT60). */
  reverb: {
    echoInRoomBefore: number;
    echoInRoomAfter: number;
    rt60Before: number;
    rt60After: number;
    wetBefore: number;
    wetAfter: number;
    flutterBefore: number;
    flutterAfter: number;
  };
}

export interface DerivedProfile {
  comfortLevel: ComfortLevel;
  noiseType: NoiseType;
  whyMultiFrame: string[];
  disclaimer: 'expert_not_engineering';
  simulation: DerivedSimulation;
}

export interface AudioPair {
  id: string;
  label: string;
  group: 'air' | 'impact' | 'mixed' | 'echo';
  beforeLabel: string;
  afterLabel: string;
  beforeSrc: string;
  afterSrc: string;
}

export interface AudioState {
  mode: 'demo_stub' | 'mapped';
  pairs: AudioPair[];
  demoSet?: boolean;
}

export interface CtaPayload {
  roomType: RoomType | null;
  ceilingAreaM2: number | null;
}

export interface RoomAnswers {
  roomType: RoomType | null;
  ceilingAreaM2: number | null;
  slabType: SlabTypeOption;
  slabThickness: SlabThicknessOption;
  floorAbove: FloorAboveOption;
  houseType: HouseTypeOption;
  objectStage: ObjectStageOption;
  plannedCeiling: PlannedCeilingOption;
  noisyNeighbors: NoisyNeighborsOption;
  /** Filled when neighbors are noisy; otherwise stays `unknown`. */
  noiseKind: NoiseKindOption;
  /**
   * Everyday goals — multi-select. Empty until the user picks on the wish step.
   * Legacy share links may still send a single `roomWish` string.
   */
  roomWishes: RoomWishOption[];
}

export interface SessionAnswers {
  interestFor: InterestFor;
  room: RoomAnswers;
  scope: 'ceiling';
}

export interface SessionState {
  schemaVersion: 2;
  step: WizardStep;
  /** Active question inside Room; ignored outside step === 'room' */
  roomSubstep: RoomSubstep;
  answers: SessionAnswers;
  derived: DerivedProfile | null;
  audio: AudioState;
  cta: CtaPayload;
}

export const WIZARD_STEPS: WizardStep[] = ['start', 'room', 'result'];

export const ROOM_TYPE_LABELS: Record<RoomType, string> = {
  living: 'Гостиная',
  bedroom: 'Спальня',
  kids: 'Детская',
  kitchen: 'Кухня',
  office: 'Кабинет',
  other: 'Другое',
};

export const SLAB_TYPE_OPTIONS: { id: SlabTypeOption; label: string }[] = [
  { id: 'monolith', label: 'Монолит / сплошная ж/б' },
  { id: 'hollow', label: 'Многопустотная (ПК)' },
  { id: 'wood', label: 'Деревянное / по балкам' },
  { id: 'unknown', label: 'Не знаю' },
];

export const SLAB_THICKNESS_OPTIONS: { id: SlabThicknessOption; label: string }[] = [
  { id: 'up_to_160', label: 'До ~160 мм' },
  { id: 'about_160_200', label: 'Около 160–200 мм' },
  { id: 'about_200_250', label: 'Около 200–250 мм' },
  { id: 'over_250', label: 'Толще ~250 мм' },
  { id: 'unknown', label: 'Не знаю' },
];

export const FLOOR_ABOVE_OPTIONS: { id: FloorAboveOption; label: string }[] = [
  { id: 'unknown', label: 'Не знаю' },
  { id: 'ordinary', label: 'Обычный пол, без шумоизоляции в полу' },
  { id: 'floating', label: 'Есть шумоизоляция в полу сверху' },
];

export const HOUSE_TYPE_OPTIONS: { id: HouseTypeOption; label: string; hint?: string }[] = [
  { id: 'panel', label: 'Панельный' },
  { id: 'block', label: 'Блочный' },
  { id: 'brick', label: 'Кирпичный' },
  { id: 'monolith', label: 'Монолит (в т.ч. монолит-кирпич)' },
  { id: 'wood', label: 'Деревянный / по балкам' },
  { id: 'unknown', label: 'Не знаю' },
];

export const OBJECT_STAGE_OPTIONS: { id: ObjectStageOption; label: string }[] = [
  { id: 'newbuild', label: 'Новостройка / до заселения' },
  { id: 'renovation', label: 'Идёт ремонт' },
  { id: 'occupied', label: 'Уже живут' },
  { id: 'unknown', label: 'Не знаю' },
];

export const PLANNED_CEILING_OPTIONS: { id: PlannedCeilingOption; label: string }[] = [
  { id: 'stretch', label: 'Натяжной' },
  { id: 'gypsum', label: 'Гипсокартон / подвесной' },
  { id: 'plaster', label: 'Штукатурка или покраска' },
  { id: 'other_exists', label: 'Другой потолок уже есть' },
  { id: 'unknown', label: 'Не знаю' },
];

export const NOISY_NEIGHBORS_OPTIONS: { id: NoisyNeighborsOption; label: string }[] = [
  { id: 'unknown', label: 'Не знаю' },
  { id: 'usually_quiet', label: 'Обычно тихо' },
  { id: 'sometimes_noisy', label: 'Сверху бывает шумно' },
  { id: 'often_noisy', label: 'Сверху часто шумно' },
];

export const NOISE_KIND_OPTIONS: { id: NoiseKindOption; label: string; hint?: string }[] = [
  {
    id: 'impact',
    label: 'Топот и шаги',
    hint: 'бег, передвижение мебели, падения',
  },
  {
    id: 'airborne',
    label: 'Голоса и музыка',
    hint: 'разговоры, ТВ, колонки',
  },
  {
    id: 'mixed',
    label: 'И то, и другое',
    hint: 'и шаги, и голоса сверху',
  },
  { id: 'unknown', label: 'Сложно сказать' },
];

/** Selectable on the wish step — «general» kept in type for legacy links only. */
export const ROOM_WISH_OPTIONS: { id: RoomWishOption; label: string }[] = [
  { id: 'from_above', label: 'Чтобы не слышать шум сверху' },
  { id: 'privacy_out', label: 'Чтобы сверху не слышали вас' },
  { id: 'music_recording', label: 'Чтобы в комнате было меньше эха' },
  { id: 'other', label: 'Пока не определился' },
];

export const ROOM_WISH_ALL_LABELS: Record<RoomWishOption, string> = {
  from_above: 'Чтобы не слышать шум сверху',
  privacy_out: 'Чтобы сверху не слышали вас',
  music_recording: 'Чтобы в комнате было меньше эха',
  general: 'Общий акустический комфорт',
  other: 'Пока не определился',
};

/** Slab options that make sense for a given house type (logical canvas). */
export function allowedSlabTypes(houseType: HouseTypeOption): SlabTypeOption[] {
  switch (houseType) {
    case 'panel':
    case 'block':
      return ['hollow', 'unknown'];
    case 'brick':
    case 'monolith':
      return ['monolith', 'hollow', 'unknown'];
    case 'wood':
      return ['wood', 'unknown'];
    case 'unknown':
    default:
      return ['monolith', 'hollow', 'wood', 'unknown'];
  }
}

/** Ask noise-kind follow-up only when the user reports noise from above. */
export function shouldAskNoiseKind(noisy: NoisyNeighborsOption): boolean {
  return noisy === 'sometimes_noisy' || noisy === 'often_noisy';
}

/** Everyday first-layer labels (workshop 2026-09-16). SP letters stay secondary. */
export const EVERYDAY_COMFORT_LABELS: Record<ClassLabel, string> = {
  A: 'Тихо',
  B: 'Комфортно',
  V: 'Допустимо',
  below: 'Некомфортно',
};

/** Hybrid comfort class labels (UI) */
export const HYBRID_CLASS_LABELS: Record<ClassLabel, string> = {
  A: 'Высокий комфорт (А)',
  B: 'Комфорт (Б)',
  V: 'Допустимый (В)',
  below: 'Дискомфорт',
};

/** Partner portal: open embedded calculator (same origin). */
export const CALCULATOR_URL = `${typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL ? import.meta.env.BASE_URL : '/'}calculator/`;

/** StP site contact block («Связаться с нами») at the bottom of the page. */
export const CONSULTATION_URL = 'https://stp-multiframe.ru/#section-partner';

export const DISCLAIMER_EXPERT =
  'Это экспертная оценка, не инженерный расчёт и не гарантия цифр.';

export const SIMULATION_BADGE = 'Эффект MultiFrame';

export const DISCLAIMER_SIMULATION = '';

export const NORM_FOOTNOTE = 'Нормы комфорта жилья · СП 51.13330.2011';

export const LOG_DB_FOOTNOTE =
  'Процент «тише» — по таблице снижения звукового давления (например, −8 дБ ≈ 60%).';
