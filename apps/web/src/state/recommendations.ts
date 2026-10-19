import type {
  NoiseType,
  RoomAnswers,
  RoomWishOption,
} from './types';
import { ROOM_WISH_ALL_LABELS } from './types';

export interface VerdictPcts {
  perceivedAirPct: number;
  perceivedImpactPct: number;
}

/*
 * «Рекомендации» on the Result step — короткий текст для клиента и для
 * консультации (замерщик, монтажник, менеджер пересказывают его своими словами).
 *
 * Структура (не больше 3 предложений):
 *   1) Что не так в этой комнате — одно предложение: проблемы через запятую
 *      + одна причина (перекрытие/потолок) один раз, без повторов.
 *   2) Что сделает MultiFrame — одно предложение с цифрами из симуляции
 *      (perceivedImpactPct / perceivedAirPct, как есть).
 *   3) Честная оговорка про шаги сверху — только когда она уместна.
 *
 * Что такое панель, из чего она и «до 17 дБ» — в блоке «Что такое MultiFrame»,
 * здесь это не повторяем. Этот файл одинаковый в multiframe-partner
 * (apps/web/src/state) и multiframe-problemomer (src/state).
 */

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function sentence(s: string): string {
  const t = s.trim().replace(/\s+/g, ' ');
  if (!t) return t;
  return capitalize(/[.!?…]$/.test(t) ? t : `${t}.`);
}

/** «в спальне», «на кухне» … */
function roomWhere(room: RoomAnswers): string {
  switch (room.roomType) {
    case 'bedroom':
      return 'в спальне';
    case 'kids':
      return 'в детской';
    case 'living':
      return 'в гостиной';
    case 'kitchen':
      return 'на кухне';
    case 'office':
      return 'в кабинете';
    default:
      return 'в комнате';
  }
}

function heardKind(room: RoomAnswers, noiseType: NoiseType): NoiseType {
  if (room.noiseKind === 'impact' || room.noiseKind === 'airborne' || room.noiseKind === 'mixed') {
    return room.noiseKind;
  }
  return noiseType;
}

function hasWish(room: RoomAnswers, id: RoomWishOption): boolean {
  return room.roomWishes.includes(id);
}

function slabNoun(room: RoomAnswers): string {
  const { slabType: slab, houseType: house } = room;
  if (slab === 'hollow' || (slab === 'unknown' && (house === 'panel' || house === 'block'))) {
    return 'пустотная плита';
  }
  if (slab === 'wood' || (slab === 'unknown' && house === 'wood')) {
    return 'деревянное перекрытие';
  }
  if (slab === 'monolith' || (slab === 'unknown' && (house === 'monolith' || house === 'brick'))) {
    return 'бетонная плита';
  }
  return 'перекрытие';
}

/** Why sound passes — named once per text. */
function isolationCause(room: RoomAnswers): string {
  const slab = slabNoun(room);
  switch (room.plannedCeiling) {
    case 'stretch':
      return `${slab} с натяжным потолком гудит, как барабан`;
    case 'gypsum':
      return `${slab} и обычный гипсокартон почти не держат звук`;
    case 'plaster':
      return `${slab} без звукоизоляции почти не держит звук`;
    case 'other_exists':
      return `${slab} и нынешний потолок почти не держат звук`;
    default:
      return `${slab} почти не держит звук`;
  }
}

/** The customer hears neighbours (not «usually quiet») and cares about it. */
function hearsFromAbove(room: RoomAnswers): boolean {
  if (room.noisyNeighbors === 'usually_quiet') return false;
  return (
    hasWish(room, 'from_above') ||
    (!hasWish(room, 'privacy_out') && !hasWish(room, 'music_recording'))
  );
}

/** «a», «a, а b», «a, b, а c». */
function joinProblems(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')}, а ${items[items.length - 1]}`;
}

/** Sentence 1 — what is wrong in this room, in everyday words. */
function factSentence(room: RoomAnswers, noiseType: NoiseType): string {
  const kind = heardKind(room, noiseType);
  const above = hearsFromAbove(room);
  const privacy = hasWish(room, 'privacy_out');
  const echo = hasWish(room, 'music_recording');
  const problems: string[] = [];

  if (above) {
    problems.push(
      kind === 'impact'
        ? 'слышны шаги и стук сверху'
        : kind === 'airborne'
          ? 'слышны голоса и музыка сверху'
          : 'слышны шаги и голоса сверху',
    );
  }
  if (privacy) problems.push(above ? 'соседи слышат вас' : 'соседи сверху слышат вас');
  if (echo) problems.push('звук отдаётся эхом');

  if (problems.length === 0) {
    return `Сверху пока тихо, но ${slabNoun(room)} почти не держит звук, и шумных соседей будет хорошо слышно`;
  }
  const cause =
    !above && !privacy
      ? 'гладкий потолок отражает звук обратно в комнату'
      : isolationCause(room);
  return `${roomWhere(room)} ${joinProblems(problems)}: ${cause}`;
}

/** Sentence 2 — what MultiFrame changes here, with simulated numbers. */
function benefitSentence(room: RoomAnswers, noiseType: NoiseType, pcts: VerdictPcts): string {
  const kind = heardKind(room, noiseType);
  const voices = hasWish(room, 'privacy_out') ? 'голоса в обе стороны' : 'голоса';
  const steps = 'шаги';
  const impact = pcts.perceivedImpactPct;
  const air = pcts.perceivedAirPct;
  const numbers =
    kind === 'airborne'
      ? `${voices} станут тише на ${air}%, ${steps} — на ${impact}%`
      : `${steps} станут тише на ${impact}%, ${voices} — на ${air}%`;
  const echo = hasWish(room, 'music_recording') ? ', а эха станет меньше' : '';
  return `С MultiFrame на потолке ${numbers}${echo}`;
}

/** Optional sentence 3 — honest limit for footsteps from above. */
function limitSentence(room: RoomAnswers, noiseType: NoiseType): string | null {
  if (!hearsFromAbove(room)) return null;
  if (heardKind(room, noiseType) === 'airborne') return null;
  if (room.floorAbove === 'floating') return null;
  return 'Честно скажем: полностью убрать шаги может только пол у соседей, но стук станет глухим и мягким';
}

/**
 * Recommendations for Result: 2–3 short sentences.
 * First item is the key fact (rendered bold), then the benefit, then an optional limit.
 */
export function caseVerdictParts(
  room: RoomAnswers,
  noiseType: NoiseType,
  pcts: VerdictPcts,
): readonly string[] {
  const parts = [factSentence(room, noiseType), benefitSentence(room, noiseType, pcts)];
  const limit = limitSentence(room, noiseType);
  if (limit) parts.push(limit);
  return parts.map(sentence);
}

export function caseVerdict(room: RoomAnswers, noiseType: NoiseType, pcts: VerdictPcts): string {
  return caseVerdictParts(room, noiseType, pcts).join(' ');
}

export interface ProductAbout {
  claim: string;
  paragraphs: readonly string[];
}

/** Product explanation for the Result «Что такое MultiFrame» block. */
export function productAbout(_room: RoomAnswers, _noiseType: NoiseType): ProductAbout {
  return {
    claim: '',
    paragraphs: [
      'StP MultiFrame — это модульная звукоизоляционная панель, которая делает дом тише и комфортнее за счёт двойного эффекта: она блокирует ударный и воздушный шум от соседей (до 17 дБ) и одновременно поглощает эхо внутри помещения, улучшая акустику.',
      'Панели изготовлены из экологичных, негорючих и гипоаллергенных материалов, безопасны для здоровья всей семьи.',
      'Это продуманное решение для тех, кто ценит тишину, здоровье и качество жизни.',
    ],
  };
}

export const MULTIFRAME_PRODUCT_CLAIM = '';

export const MULTIFRAME_PRODUCT_BLURB =
  'StP MultiFrame — это модульная звукоизоляционная панель, которая делает дом тише и комфортнее за счёт двойного эффекта: она блокирует ударный и воздушный шум от соседей (до 17 дБ) и одновременно поглощает эхо внутри помещения, улучшая акустику. Панели изготовлены из экологичных, негорючих и гипоаллергенных материалов, безопасны для здоровья всей семьи. Это продуманное решение для тех, кто ценит тишину, здоровье и качество жизни.';

export const MULTIFRAME_PANEL_IMG = `${(import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/'}images/multiframe-panel-transparent.png`;

/** @deprecated Prefer caseVerdict. */
export function personalStory(
  room: RoomAnswers,
  noiseType: NoiseType,
  pcts: VerdictPcts,
): string[] {
  return [caseVerdict(room, noiseType, pcts)];
}

/** @deprecated Prefer caseVerdict. */
export function buildRecommendations(
  room: RoomAnswers,
  noiseType: NoiseType,
  pcts: VerdictPcts,
): string[] {
  return [caseVerdict(room, noiseType, pcts)];
}

export function wishLabelFor(wish: RoomWishOption): string {
  return ROOM_WISH_ALL_LABELS[wish] ?? ROOM_WISH_ALL_LABELS.other;
}
