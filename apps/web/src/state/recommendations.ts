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
 * «Рекомендации» on the Result step — текст для клиента и для консультации
 * (замерщик, монтажник, менеджер пересказывают его своими словами).
 *
 * Три части, каждая — отдельный абзац:
 *   1) Что происходит и почему (по ответам клиента). Про натяжной потолок
 *      («гудит, как барабан») — только когда планируется натяжной потолок.
 *   2) Что даёт MultiFrame — с цифрами из симуляции (perceivedImpactPct /
 *      perceivedAirPct, как есть).
 *   3) Честная оговорка и следующий шаг (замер и расчёт).
 *
 * Что такое панель и из чего она — в блоке «Что такое MultiFrame», здесь это
 * не повторяем. Этот файл одинаковый в multiframe-partner (apps/web/src/state)
 * и multiframe-problemomer (src/state).
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

/** Why the sound passes — «плита пропускает удар». */
function slabPasses(room: RoomAnswers, kind: NoiseType): string {
  const noun = slabNoun(room) === 'деревянное перекрытие' ? 'перекрытие' : 'плита';
  const what = kind === 'impact' ? 'удар' : kind === 'airborne' ? 'звук' : 'и удар, и голос';
  return `${noun} пропускает ${what}`;
}

/** Only for a stretch ceiling — never for other ceilings. */
function stretchSentence(room: RoomAnswers, kind: NoiseType): string | null {
  if (room.plannedCeiling !== 'stretch') return null;
  return kind === 'airborne'
    ? 'Натяжной потолок усиливает звук и гудит, как барабан'
    : 'Натяжной потолок усиливает удар и гудит, как барабан';
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

/** Part 1 — what is wrong in this room and why, in everyday words. */
function factParagraph(room: RoomAnswers, noiseType: NoiseType): string {
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
    return sentence(
      `Сверху пока тихо, но ${slabNoun(room)} почти не держит звук, и шумных соседей будет хорошо слышно`,
    );
  }
  const cause =
    !above && !privacy
      ? 'гладкий потолок отражает звук обратно в комнату'
      : slabPasses(room, kind);
  const first = sentence(`${roomWhere(room)} ${joinProblems(problems)}: ${cause}`);
  const stretch = stretchSentence(room, kind);
  return stretch ? `${first} ${sentence(stretch)}` : first;
}

/** Part 2 — what MultiFrame gives here, with simulated numbers. */
function benefitParagraph(room: RoomAnswers, noiseType: NoiseType, pcts: VerdictPcts): string {
  const kind = heardKind(room, noiseType);
  const impact = pcts.perceivedImpactPct;
  const air = pcts.perceivedAirPct;
  const numbers =
    kind === 'airborne'
      ? `голоса станут тише примерно на ${air}%, шаги — на ${impact}%`
      : `шаги станут тише примерно на ${impact}%, голоса — на ${air}%`;
  const echo = hasWish(room, 'music_recording') ? ' и в комнате станет меньше эха' : '';
  return sentence(`С панелями на потолке ${numbers}${echo}`);
}

const NEXT_STEP = 'Следующий шаг — замер комнаты и точный расчёт';

/** Part 3 — honest limit (when the client hears the neighbours) and the next step. */
function limitParagraph(room: RoomAnswers): string {
  const next = sentence(NEXT_STEP);
  if (!hearsFromAbove(room)) return next;
  return `${sentence('Панели на потолке сделают шум тише')} ${sentence(
    'Чтобы избавиться от него полностью, нужна ещё звукоизоляция стен и пола в квартире сверху',
  )} ${next}`;
}

/**
 * Recommendations for Result: three short paragraphs —
 * what is happening and why (key fact), what MultiFrame gives, honest limit + next step.
 */
export function caseVerdictParts(
  room: RoomAnswers,
  noiseType: NoiseType,
  pcts: VerdictPcts,
): readonly string[] {
  return [
    factParagraph(room, noiseType),
    benefitParagraph(room, noiseType, pcts),
    limitParagraph(room),
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
export function productAbout(
  _room: RoomAnswers,
  _noiseType: NoiseType,
  deltas?: { airDb?: number | null; impactDb?: number | null },
): ProductAbout {
  const air = deltas?.airDb != null && Number.isFinite(deltas.airDb) ? Math.abs(Math.round(deltas.airDb)) : null;
  const impact =
    deltas?.impactDb != null && Number.isFinite(deltas.impactDb) ? Math.abs(Math.round(deltas.impactDb)) : null;
  const what =
    'STP MultiFrame — система звукоизоляции потолка и стен из готовых панелей: каркас из вспененного полипропилена с мягким акустическим наполнителем. Сквозная перфорация гасит звук внутри панели, а не отражает его обратно.';
  const effect =
    air != null && impact != null
      ? ` Для вашей комнаты расчёт даёт около ${air} дБ по воздушному шуму и ${impact} дБ по ударному.`
      : '';
  return {
    claim: '',
    paragraphs: [
      `${what}${effect}`,
      'Без стекловолоконной пыли, клея и опасных пропиток, не поддерживает горение. Система толщиной около 6 см почти не съедает высоту, а потолок 20 м² мастер закрывает примерно за час — вместе с натяжным потолком.',
    ],
  };
}

export const MULTIFRAME_PRODUCT_CLAIM = '';

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
