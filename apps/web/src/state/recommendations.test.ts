/**
 * «Рекомендации» copy — every answer combination stays short and clean.
 * Run: npx tsx --test src/state/recommendations.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { caseVerdict, caseVerdictParts, productAbout } from './recommendations';
import type {
  FloorAboveOption,
  HouseTypeOption,
  NoiseKindOption,
  NoiseType,
  NoisyNeighborsOption,
  PlannedCeilingOption,
  RoomAnswers,
  RoomType,
  RoomWishOption,
  SlabTypeOption,
} from './types';

// roomType only changes «в спальне / на кухне»; full room list is checked separately below.
const ROOMS: (RoomType | null)[] = ['bedroom', 'kitchen', null];
const HOUSES: HouseTypeOption[] = ['panel', 'brick', 'wood', 'unknown'];
const SLABS: SlabTypeOption[] = ['monolith', 'hollow', 'wood', 'unknown'];
const CEILINGS: PlannedCeilingOption[] = ['stretch', 'gypsum', 'plaster', 'other_exists', 'unknown'];
const NEIGHBORS: NoisyNeighborsOption[] = ['unknown', 'usually_quiet', 'sometimes_noisy', 'often_noisy'];
const KINDS: NoiseKindOption[] = ['impact', 'airborne', 'mixed', 'unknown'];
const FLOORS: FloorAboveOption[] = ['unknown', 'ordinary', 'floating'];
const NOISE_TYPES: NoiseType[] = ['impact', 'airborne', 'mixed'];
const WISH_IDS: RoomWishOption[] = ['from_above', 'privacy_out', 'music_recording'];
const PCTS = { perceivedAirPct: 44, perceivedImpactPct: 65 };

function wishSubsets(): RoomWishOption[][] {
  const out: RoomWishOption[][] = [];
  for (let mask = 0; mask < 1 << WISH_IDS.length; mask++) {
    out.push(WISH_IDS.filter((_, i) => mask & (1 << i)));
  }
  // «general» / «other» behave like «no specific goal»
  out.push(['other'], ['general'], ['other', 'music_recording']);
  return out;
}

function room(patch: Partial<RoomAnswers>): RoomAnswers {
  return {
    roomType: 'bedroom',
    roomTypeCustom: '',
    ceilingAreaM2: 18,
    slabType: 'hollow',
    slabThickness: 'unknown',
    floorAbove: 'unknown',
    houseType: 'panel',
    objectStage: 'unknown',
    plannedCeiling: 'stretch',
    noisyNeighbors: 'often_noisy',
    noiseKind: 'mixed',
    roomWishes: ['from_above', 'privacy_out', 'music_recording'],
    ...patch,
  };
}

function* allRooms(): Generator<[RoomAnswers, NoiseType]> {
  const wishes = wishSubsets();
  for (const roomType of ROOMS)
    for (const houseType of HOUSES)
      for (const slabType of SLABS)
        for (const plannedCeiling of CEILINGS)
          for (const noisyNeighbors of NEIGHBORS)
            for (const noiseKind of KINDS)
              for (const floorAbove of FLOORS)
                for (const roomWishes of wishes)
                  for (const nt of noiseKind === 'unknown' ? NOISE_TYPES : (['mixed'] as NoiseType[]))
                    yield [
                      room({ roomType, houseType, slabType, plannedCeiling, noisyNeighbors, noiseKind, floorAbove, roomWishes }),
                      nt,
                    ];
}

const words = (s: string) => s.split(/\s+/).filter((w) => /[\p{L}\d]/u.test(w)).length;

function shingles(text: string, n: number): string[] {
  const w = text.toLowerCase().replace(/[^\p{L}\d%\s]/gu, ' ').split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i + n <= w.length; i++) out.push(w.slice(i, i + n).join(' '));
  return out;
}

const sentences = (p: string) => p.split(/(?<=[.!?…])\s+/).filter(Boolean);
const BANNED = /17 дБ|дискомфорт|важно для вас|сильный дискомфорт|полностью убрать шаги|пол у соседей|закрыть и стены|₽|руб/i;

test('every combination: 3 parts, short sentences, no glued or repeated clauses', () => {
  let n = 0;
  const seen = new Set<string>();
  for (const [r, nt] of allRooms()) {
    const parts = caseVerdictParts(r, nt, PCTS);
    const text = parts.join(' ');
    const ctx = `${JSON.stringify(r)} / ${nt}\n${text}`;
    n++;
    seen.add(text);

    assert.equal(parts.length, 3, `parts: ${ctx}`);
    for (const p of parts) {
      assert.match(p, /^[А-ЯЁA-Z]/, `starts upper: ${ctx}`);
      assert.match(p, /[^.]\.$/, `ends with one period: ${ctx}`);
      for (const sn of sentences(p)) {
        assert.match(sn, /^[А-ЯЁA-Z]/, `sentence starts upper: ${ctx}`);
        assert.match(sn, /[^.]\.$/, `sentence ends with period: ${ctx}`);
        assert.ok(words(sn) <= 25, `sentence too long (${words(sn)}): ${ctx}`);
      }
      assert.doesNotMatch(p, /[а-яё] [А-ЯЁ]/, `glued sentence: ${ctx}`);
      assert.doesNotMatch(p, /\s[,.:]|,,|\s{2}/, `spacing: ${ctx}`);
    }
    assert.ok(words(text) <= 90, `too long (${words(text)} words): ${ctx}`);

    const sh = shingles(text, 4);
    assert.equal(new Set(sh).size, sh.length, `repeated clause: ${ctx}`);

    // «барабан» only with a stretch ceiling, once
    const drum = (text.match(/барабан/g) ?? []).length;
    assert.equal(drum, r.plannedCeiling === 'stretch' && /слышны|отдаётся|слышат/.test(parts[0]) && !parts[0].startsWith('Сверху пока тихо') ? drum : 0, `барабан: ${ctx}`);
    assert.ok(drum <= 1, `барабан twice: ${ctx}`);

    // simulated numbers are shown as-is
    assert.ok(text.includes('на 65%') && text.includes('на 44%'), `pcts: ${ctx}`);

    // last part always ends with the next step
    assert.ok(parts[2].endsWith('Следующий шаг — замер комнаты и точный расчёт.'), `next step: ${ctx}`);

    // no repeat of «Что такое MultiFrame» / old filler / banned claims
    assert.doesNotMatch(text, /каркас|наполнител|зоной комфорта|экологичн/, `dup: ${ctx}`);
    assert.doesNotMatch(text, BANNED, `banned: ${ctx}`);
  }
  assert.ok(n > 10000, `covered ${n} combinations`);
  assert.ok(seen.size > 20, `distinct texts: ${seen.size}`);
});

test('screenshot case: all goals, hollow slab + stretch, mixed noise', () => {
  const parts = caseVerdictParts(room({ roomType: 'other' }), 'mixed', PCTS);
  assert.deepEqual(parts, [
    'В комнате слышны шаги и голоса сверху, соседи слышат вас, а звук отдаётся эхом: плита пропускает и удар, и голос. Натяжной потолок усиливает удар и гудит, как барабан.',
    'С панелями на потолке шаги станут тише примерно на 65%, голоса — на 44% и в комнате станет меньше эха.',
    'Панели на потолке сделают шум тише. Чтобы избавиться от него полностью, нужна ещё звукоизоляция стен и пола в квартире сверху. Следующий шаг — замер комнаты и точный расчёт.',
  ]);
});

test('approved example: steps from above on a slab, stretch ceiling', () => {
  const parts = caseVerdictParts(room({ noiseKind: 'impact', roomWishes: ['from_above'] }), 'mixed', PCTS);
  assert.equal(parts[0].split('.')[0], 'В спальне слышны шаги и стук сверху: плита пропускает удар');
  assert.equal(parts[1], 'С панелями на потолке шаги станут тише примерно на 65%, голоса — на 44%.');
});

test('«барабан» and «усиливает» only for a stretch ceiling', () => {
  for (const pc of CEILINGS) {
    const text = caseVerdict(room({ plannedCeiling: pc, noiseKind: 'impact', roomWishes: ['from_above'] }), 'impact', PCTS);
    assert.equal(/барабан|усиливает/.test(text), pc === 'stretch', pc);
  }
});

test('walls and floor above are named only as the way to remove noise completely', () => {
  const text = caseVerdict(room({ noiseKind: 'impact', roomWishes: ['from_above'] }), 'impact', PCTS);
  assert.match(text, /Панели на потолке сделают шум тише\. Чтобы избавиться от него полностью, нужна ещё звукоизоляция стен и пола в квартире сверху\./);
  // the limit is not shown to someone who does not hear the neighbours
  const quiet = caseVerdict(room({ noisyNeighbors: 'usually_quiet' }), 'mixed', PCTS);
  assert.doesNotMatch(quiet, /стен и пола/);
  assert.match(quiet, /Следующий шаг/);
});

test('every room type reads naturally', () => {
  const where: Record<string, string> = {
    living: 'В гостиной', bedroom: 'В спальне', kids: 'В детской', kitchen: 'На кухне', office: 'В кабинете', other: 'В комнате',
  };
  for (const [rt, start] of Object.entries(where)) {
    assert.ok(caseVerdict(room({ roomType: rt as RoomType }), 'mixed', PCTS).startsWith(`${start} `), rt);
  }
});

test('airborne leads with voices, impact leads with steps; kitchen is «на кухне»', () => {
  const air = caseVerdict(room({ noiseKind: 'airborne', roomWishes: ['from_above'] }), 'mixed', PCTS);
  assert.match(air, /голоса станут тише примерно на 44%, шаги — на 65%/);
  const imp = caseVerdict(room({ noiseKind: 'impact', roomWishes: ['from_above'] }), 'mixed', PCTS);
  assert.match(imp, /шаги станут тише примерно на 65%, голоса — на 44%/);
  assert.match(caseVerdict(room({ roomType: 'kitchen' }), 'mixed', PCTS), /^На кухне /);
});

test('echo wish adds «меньше эха» to the benefit part only', () => {
  const withEcho = caseVerdictParts(room({ roomWishes: ['from_above', 'music_recording'] }), 'mixed', PCTS);
  assert.match(withEcho[1], /и в комнате станет меньше эха\.$/);
  const noEcho = caseVerdictParts(room({ roomWishes: ['from_above'] }), 'mixed', PCTS);
  assert.doesNotMatch(noEcho[1], /эха/);
});

test('quiet neighbours and echo-only goals still read as one clean fact', () => {
  const quiet = caseVerdictParts(room({ noisyNeighbors: 'usually_quiet', roomWishes: ['from_above'] }), 'mixed', PCTS);
  assert.equal(quiet[0], 'Сверху пока тихо, но пустотная плита почти не держит звук, и шумных соседей будет хорошо слышно.');
  const echo = caseVerdictParts(room({ roomWishes: ['music_recording'], plannedCeiling: 'gypsum' }), 'mixed', PCTS);
  assert.equal(echo[0], 'В спальне звук отдаётся эхом: гладкий потолок отражает звук обратно в комнату.');
});

test('«Что такое MultiFrame»: approved text, numbers only when the calculation has them', () => {
  const withNums = productAbout(room({}), 'mixed', { airDb: 9.4, impactDb: -12.6 });
  assert.deepEqual(withNums.paragraphs, [
    'STP MultiFrame — система звукоизоляции потолка и стен из готовых панелей: каркас из вспененного полипропилена с мягким акустическим наполнителем. Сквозная перфорация гасит звук внутри панели, а не отражает его обратно. Для вашей комнаты расчёт даёт около 9 дБ по воздушному шуму и 13 дБ по ударному.',
    'Без стекловолоконной пыли, клея и опасных пропиток, не поддерживает горение. Система толщиной около 6 см почти не съедает высоту, а потолок 20 м² мастер закрывает примерно за час — вместе с натяжным потолком.',
  ]);
  const noNums = productAbout(room({}), 'mixed');
  assert.equal(noNums.paragraphs.length, 2);
  assert.doesNotMatch(noNums.paragraphs[0], /Для вашей комнаты/);
  for (const p of [...withNums.paragraphs, ...noNums.paragraphs]) assert.doesNotMatch(p, BANNED);
});
