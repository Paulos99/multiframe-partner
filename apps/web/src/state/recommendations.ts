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

function endsWithPeriod(s: string): string {
  const t = s.trim();
  if (!t) return t;
  return /[.!?…]$/.test(t) ? t : `${t}.`;
}

function roomWhere(room: RoomAnswers): string {
  switch (room.roomType) {
    case 'bedroom':
      return 'спальне';
    case 'kids':
      return 'детской';
    case 'living':
      return 'гостиной';
    case 'kitchen':
      return 'кухне';
    case 'office':
      return 'кабинете';
    default:
      return 'комнате';
  }
}

/** Accusative + possessive for «сделает вашу спальню зоной…». */
function roomAsComfortZone(room: RoomAnswers): string {
  switch (room.roomType) {
    case 'bedroom':
      return 'вашу спальню';
    case 'kids':
      return 'вашу детскую';
    case 'living':
      return 'вашу гостиную';
    case 'kitchen':
      return 'вашу кухню';
    case 'office':
      return 'ваш кабинет';
    default:
      return 'вашу комнату';
  }
}

function heardKind(room: RoomAnswers, noiseType: NoiseType): NoiseType | 'unknown' {
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

function ceilingWithSlab(room: RoomAnswers): string {
  const slab = slabNoun(room);
  switch (room.plannedCeiling) {
    case 'stretch':
      return `${slab} с натяжным потолком только усиливают этот гул, работая как барабан`;
    case 'gypsum':
      return `${slab} и обычный гипсокартон почти не останавливают этот шум`;
    case 'plaster':
      return `${slab} под штукатуркой или краской почти не защищает от шума сверху`;
    case 'other_exists':
      return `${slab} и готовый потолок без звукоизоляции этот путь не закрывают`;
    default:
      return `${slab} хорошо пропускает этот шум`;
  }
}

/** Beat 1: what you hear + construction makes it worse. */
function diagnosisBeat(room: RoomAnswers, noiseType: NoiseType): string {
  const kind = heardKind(room, noiseType);
  const construction = ceilingWithSlab(room);
  const parts: string[] = [];

  if (hasWish(room, 'privacy_out')) {
    parts.push(
      `Ваши разговоры и музыка уходят наверх тем же путём, которым чужой шум приходит вниз, а ${construction}`,
    );
  }
  if (hasWish(room, 'music_recording')) {
    parts.push(
      `В ${roomWhere(room)} звук долго не затихает: жёсткий потолок возвращает эхо обратно, а ${construction}`,
    );
  }

  if (parts.length === 0) {
    if (room.noisyNeighbors === 'usually_quiet') {
      return `Сейчас сверху обычно тихо, но если соседи станут шумнее, звук пройдёт почти без препятствий: ${construction}`;
    }
    const heard =
      kind === 'impact'
        ? 'Вы слышите шаги и стук сверху'
        : kind === 'airborne'
          ? 'Вы слышите голоса и музыку сверху'
          : 'Вы слышите то шаги, то разговоры';
    return `${heard}, и ${construction}`;
  }

  return parts.join(' ');
}

/** Beat 2: MultiFrame mechanism. */
function mechanismBeat(room: RoomAnswers): string {
  const where =
    room.plannedCeiling === 'stretch'
      ? 'в зазоре между перекрытием и полотном'
      : 'под потолком';
  return `Панели MultiFrame — это жёсткий каркас, который гасит удары, и акустический наполнитель, который рассеивает звук ${where}`;
}

/** Beat 3: perceived % from simulation. */
function pctBeat(pcts: VerdictPcts): string {
  return `С ними вы снизите ударный шум на ${pcts.perceivedImpactPct}%, а воздушный — на ${pcts.perceivedAirPct}%`;
}

/** Beat 4: lived sensory effect. */
function sensationBeat(room: RoomAnswers, noiseType: NoiseType): string {
  const kind = heardKind(room, noiseType);
  const bits: string[] = [];
  if (hasWish(room, 'music_recording')) {
    bits.push('Эхо в комнате станет короче и мягче');
  }
  if (hasWish(room, 'privacy_out')) {
    bits.push('вас будет меньше слышно наверху');
  }
  if (hasWish(room, 'from_above') || bits.length === 0) {
    if (kind === 'airborne') {
      bits.push('громкие голоса и музыка сверху перестанут быть навязчивыми');
    } else if (kind === 'impact') {
      bits.push('топот станет приглушённым и потеряет свою резкость');
    } else {
      bits.push(
        'топот станет приглушённым и потеряет свою резкость, а громкие голоса перестанут быть навязчивыми',
      );
    }
  }
  if (bits.length === 1) {
    const s = bits[0]!;
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  return bits
    .map((s, i) => (i === 0 ? s.charAt(0).toUpperCase() + s.slice(1) : s))
    .join(', а ');
}

/** Beat 5: honesty + room as comfort zone. */
function closingBeat(room: RoomAnswers, noiseType: NoiseType): string {
  const zone = roomAsComfortZone(room);
  const kind = heardKind(room, noiseType);
  const impactHeavy = kind === 'impact' || kind === 'mixed' || kind === 'unknown';

  if (hasWish(room, 'music_recording') && !hasWish(room, 'from_above')) {
    return `MultiFrame уберёт раздражающее эхо и сделает ${zone} зоной комфорта и спокойствия`;
  }
  if (hasWish(room, 'privacy_out') && !hasWish(room, 'from_above')) {
    return `MultiFrame снизит утечку звука наверх и сделает ${zone} зоной комфорта и спокойствия`;
  }

  if (impactHeavy) {
    if (room.floorAbove === 'floating') {
      return `Пол сверху уже убрал основную часть удара, а MultiFrame доберёт оставшийся дискомфорт и сделает ${zone} зоной комфорта и спокойствия`;
    }
    return `Честно скажем: идеальную тишину по шагам даст только пол у соседей сверху, но MultiFrame уберёт раздражающий дискомфорт и сделает ${zone} зоной комфорта и спокойствия`;
  }

  return `MultiFrame уберёт раздражающий дискомфорт и сделает ${zone} зоной комфорта и спокойствия`;
}

/**
 * Expert recommendations for Result: five connected beats.
 * Diagnosis → mechanism → % → sensation → honesty + comfort zone.
 */
export function caseVerdictParts(
  room: RoomAnswers,
  noiseType: NoiseType,
  pcts: VerdictPcts,
): readonly string[] {
  return [
    endsWithPeriod(diagnosisBeat(room, noiseType)),
    endsWithPeriod(mechanismBeat(room)),
    endsWithPeriod(pctBeat(pcts)),
    endsWithPeriod(sensationBeat(room, noiseType)),
    endsWithPeriod(closingBeat(room, noiseType)),
  ];
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
