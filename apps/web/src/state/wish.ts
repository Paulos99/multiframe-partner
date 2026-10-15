import type {
  NoiseKindOption,
  NoiseType,
  PlannedCeilingOption,
  RoomWishOption,
} from './types';
import { ROOM_WISH_ALL_LABELS } from './types';

export type WishAudioGroup = 'air' | 'impact' | 'mixed';

const WISH_SET = new Set<RoomWishOption>([
  'from_above',
  'privacy_out',
  'music_recording',
  'general',
  'other',
]);

/** Normalize legacy `roomWish` string or `roomWishes` array into a unique list. */
export function normalizeRoomWishes(
  raw: unknown,
  legacySingle?: unknown,
): RoomWishOption[] {
  const out: RoomWishOption[] = [];
  const push = (v: unknown) => {
    if (typeof v === 'string' && WISH_SET.has(v as RoomWishOption)) {
      const id = v as RoomWishOption;
      if (!out.includes(id)) out.push(id);
    }
  };
  if (Array.isArray(raw)) {
    for (const v of raw) push(v);
  }
  if (out.length === 0) push(legacySingle);
  if (out.length === 0) return [];
  // «Пока не определился» alone; if mixed with specifics, drop it.
  if (out.includes('other') && out.length > 1) {
    return out.filter((w) => w !== 'other');
  }
  return out;
}

export function primaryWish(wishes: RoomWishOption[]): RoomWishOption {
  if (wishes.includes('from_above')) return 'from_above';
  if (wishes.includes('privacy_out')) return 'privacy_out';
  if (wishes.includes('music_recording')) return 'music_recording';
  if (wishes.includes('general')) return 'general';
  if (wishes.includes('other')) return 'other';
  return 'other';
}

export function wishLabelsJoined(wishes: RoomWishOption[]): string {
  if (wishes.length === 0) return ROOM_WISH_ALL_LABELS.other;
  return wishes.map((w) => ROOM_WISH_ALL_LABELS[w]).join(' · ');
}

/** Toggle rules for the wish multi-select step. */
export function toggleRoomWish(
  current: RoomWishOption[],
  id: RoomWishOption,
): RoomWishOption[] {
  if (id === 'other') {
    return current.length === 1 && current[0] === 'other' ? [] : ['other'];
  }
  const withoutOther = current.filter((w) => w !== 'other');
  if (withoutOther.includes(id)) {
    return withoutOther.filter((w) => w !== id);
  }
  return [...withoutOther, id];
}

/** Airborne always above impact. Mixed sits with the job (recording/privacy). */
export function wishAudioOrder(wish: RoomWishOption): WishAudioGroup[] {
  switch (wish) {
    case 'privacy_out':
    case 'music_recording':
      return ['air', 'mixed', 'impact'];
    case 'from_above':
    case 'general':
    case 'other':
    default:
      return ['air', 'impact', 'mixed'];
  }
}

export function wishAudioOrderFromWishes(wishes: RoomWishOption[]): WishAudioGroup[] {
  return wishAudioOrder(primaryWish(wishes));
}

export function wishPrimaryGroup(wish: RoomWishOption): WishAudioGroup {
  if (wish === 'from_above') return 'impact';
  if (wish === 'privacy_out' || wish === 'music_recording') return 'air';
  return 'air';
}

export function wishNoiseType(wish: RoomWishOption, fallback: NoiseType): NoiseType {
  if (wish === 'privacy_out' || wish === 'music_recording') return 'airborne';
  if (wish === 'from_above') return 'mixed';
  return fallback;
}

export function wishNoiseTypeFromWishes(
  wishes: RoomWishOption[],
  fallback: NoiseType,
): NoiseType {
  if (wishes.includes('from_above') && (wishes.includes('privacy_out') || wishes.includes('music_recording'))) {
    return 'mixed';
  }
  return wishNoiseType(primaryWish(wishes), fallback);
}

/** Map explicit noise-kind answer to NoiseType (unknown → null). */
export function noiseKindToType(kind: NoiseKindOption): NoiseType | null {
  if (kind === 'impact') return 'impact';
  if (kind === 'airborne') return 'airborne';
  if (kind === 'mixed') return 'mixed';
  return null;
}

/** Result callout: how MultiFrame answers the chosen everyday goals. */
export function wishScenarioLine(wish: RoomWishOption): string {
  switch (wish) {
    case 'from_above':
      return 'Вы хотите не слышать шум сверху. MultiFrame на потолке смягчает топот и разговоры, которые доходят через плиту.';
    case 'privacy_out':
      return 'Вы хотите, чтобы сверху не слышали вас. Потолок с MultiFrame глушит голоса и музыку, которые уходят вверх через плиту.';
    case 'music_recording':
      return 'Вы хотите меньше эха в комнате. Панель MultiFrame поглощает отражения, и сверху тоже становится тише.';
    case 'general':
      return 'Вам важен общий акустический комфорт. MultiFrame снижает и голоса сверху, и шаги.';
    case 'other':
      return 'Так выглядит профиль комнаты с MultiFrame — ниже разберём, что это даёт именно вам.';
  }
}

export function wishScenarioLineFromWishes(wishes: RoomWishOption[]): string {
  const concrete = wishes.filter((w) => w !== 'other' && w !== 'general');
  if (concrete.length === 0) return wishScenarioLine(primaryWish(wishes));
  return concrete.map(wishScenarioLine).join(' ');
}

export function wishAudioLead(wish: RoomWishOption): string {
  switch (wish) {
    case 'from_above':
      return 'Сначала топот и голоса — так обычно шумят сверху.';
    case 'privacy_out':
      return 'Сначала голоса: речь уходит вверх через плиту.';
    case 'music_recording':
      return 'Сравните голоса и смешанный шум. Когда эха меньше, комната звучит спокойнее.';
    case 'general':
    case 'other':
    default:
      return 'Один и тот же звук сейчас и с MultiFrame в этой комнате.';
  }
}

export function wishAudioLeadFromWishes(wishes: RoomWishOption[]): string {
  return wishAudioLead(primaryWish(wishes));
}

/** Qualitative sound-correction note (not Rw/Lnw). */
export function wishSoundCorrectionLine(wish: RoomWishOption): string | null {
  if (wish !== 'music_recording') return null;
  return 'Перфорация MultiFrame ещё уменьшает эхо в самой комнате.';
}

export function wishSoundCorrectionLineFromWishes(
  wishes: RoomWishOption[],
): string | null {
  if (!wishes.includes('music_recording')) return null;
  return wishSoundCorrectionLine('music_recording');
}

/** Stretch-ceiling drum effect — only for stretch finish. */
export function stretchDrumLine(plannedCeiling: PlannedCeilingOption): string | null {
  if (plannedCeiling !== 'stretch') return null;
  return 'Под обычным натяжным потолком зазор может гудеть, как барабан, и усиливать шум сверху. Панели MultiFrame убирают этот эффект.';
}

/** Short ceiling-specific note for personalization (non-stretch). */
export function ceilingContextLine(plannedCeiling: PlannedCeilingOption): string | null {
  switch (plannedCeiling) {
    case 'stretch':
      return stretchDrumLine(plannedCeiling);
    case 'gypsum':
      return 'Гипсокартонный потолок сам по себе слабо гасит шум сверху. MultiFrame добавляет акустический слой без тяжёлого каркаса.';
    case 'plaster':
      return 'Штукатурка или покраска почти не изолируют шум сверху. MultiFrame можно заложить при обновлении потолка.';
    case 'other_exists':
      return 'Даже если потолок уже есть, MultiFrame имеет смысл при замене или доработке — эффект зависит от того, что между плитой и финишем.';
    default:
      return null;
  }
}

/** Per-band adjustment summed across selected wishes (no cancellation). */
export function wishUseAdjForWishes(
  wishes: RoomWishOption[],
  f: number,
  kind: 'air' | 'impact',
): number {
  if (wishes.length === 0) return 0;
  let sum = 0;
  for (const wish of wishes) {
    sum += wishUseAdjOne(wish, f, kind);
  }
  // Soft cap so multi-select does not explode L2.
  return Math.min(sum, kind === 'air' ? 4.5 : 4.0);
}

function wishUseAdjOne(wish: RoomWishOption, f: number, kind: 'air' | 'impact'): number {
  switch (wish) {
    case 'from_above':
      if (kind === 'impact') return f <= 250 ? 2.4 : 1.1;
      return f >= 200 && f <= 2500 ? 1.1 : 0.3;
    case 'privacy_out':
    case 'music_recording':
      if (kind === 'air') return f >= 250 && f <= 2500 ? 2.6 : 0.5;
      return f <= 200 ? -0.4 : 0;
    case 'general':
      if (kind === 'air') return f >= 250 && f <= 4000 ? 1.4 : 0.6;
      return f >= 250 && f <= 2000 ? 1.3 : 0.5;
    default:
      return 0;
  }
}
