/**
 * «Рекомендации» copy — every answer combination stays short and clean.
 * Run: npx tsx --test src/state/recommendations.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { caseVerdict, caseVerdictParts } from './recommendations';
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

test('every combination: ≤3 sentences, ≤60 words, no glued or repeated clauses', () => {
  let n = 0;
  const seen = new Set<string>();
  for (const [r, nt] of allRooms()) {
    const parts = caseVerdictParts(r, nt, PCTS);
    const text = parts.join(' ');
    const ctx = `${JSON.stringify(r)} / ${nt}\n${text}`;
    n++;
    seen.add(text);

    assert.ok(parts.length >= 2 && parts.length <= 3, `parts: ${ctx}`);
    for (const p of parts) {
      assert.match(p, /^[А-ЯЁA-Z]/, `starts upper: ${ctx}`);
      assert.match(p, /[^.]\.$/, `ends with one period: ${ctx}`);
      // exactly one sentence per part — no «…барабан В комнате…» gluing
      assert.equal((p.match(/[.!?…]/g) ?? []).length, 1, `one sentence per part: ${ctx}`);
      assert.doesNotMatch(p, /[а-яё] [А-ЯЁ]/, `glued sentence: ${ctx}`);
      assert.doesNotMatch(p, /\s[,.:]|,,|\s{2}/, `spacing: ${ctx}`);
      assert.ok(words(p) <= 25, `sentence too long (${words(p)}): ${ctx}`);
    }
    assert.ok(words(text) <= 60, `too long (${words(text)} words): ${ctx}`);

    const sh = shingles(text, 4);
    assert.equal(new Set(sh).size, sh.length, `repeated clause: ${ctx}`);
    assert.ok((text.match(/барабан/g) ?? []).length <= 1, `барабан twice: ${ctx}`);
    assert.ok((text.match(/держ/g) ?? []).length <= 1, `cause twice: ${ctx}`);

    // simulated numbers are shown as-is
    assert.ok(text.includes('на 65%') && text.includes('на 44%'), `pcts: ${ctx}`);

    // no repeat of «Что такое MultiFrame» / old filler
    assert.doesNotMatch(text, /17 дБ|каркас|наполнител|зоной комфорта|экологичн|дискомфорт/, `dup: ${ctx}`);
  }
  assert.ok(n > 10000, `covered ${n} combinations`);
  assert.ok(seen.size > 20, `distinct texts: ${seen.size}`);
});

test('screenshot case: all goals, hollow slab + stretch, mixed noise', () => {
  const text = caseVerdict(room({ roomType: 'other' }), 'mixed', PCTS);
  assert.equal(
    text,
    'В комнате слышны шаги и голоса сверху, соседи слышат вас, а звук отдаётся эхом: пустотная плита с натяжным потолком гудит, как барабан. ' +
      'С MultiFrame на потолке шаги станут тише на 65%, голоса в обе стороны — на 44%, а эха станет меньше. ' +
      'Честно скажем: полностью убрать шаги может только пол у соседей, но стук станет глухим и мягким.',
  );
  assert.ok(words(text) <= 60);
});

test('honest footsteps line only when footsteps from above matter', () => {
  const has = (r: RoomAnswers, nt: NoiseType = 'mixed') => caseVerdict(r, nt, PCTS).includes('Честно');
  assert.equal(has(room({ noiseKind: 'impact', roomWishes: ['from_above'] })), true);
  assert.equal(has(room({ noiseKind: 'airborne', roomWishes: ['from_above'] })), false);
  assert.equal(has(room({ noiseKind: 'impact', floorAbove: 'floating', roomWishes: ['from_above'] })), false);
  assert.equal(has(room({ noisyNeighbors: 'usually_quiet' })), false);
  assert.equal(has(room({ roomWishes: ['privacy_out', 'music_recording'] })), false);
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
  assert.match(air, /голоса станут тише на 44%, шаги — на 65%/);
  const imp = caseVerdict(room({ noiseKind: 'impact', roomWishes: ['from_above'] }), 'mixed', PCTS);
  assert.match(imp, /шаги станут тише на 65%, голоса — на 44%/);
  assert.match(caseVerdict(room({ roomType: 'kitchen' }), 'mixed', PCTS), /^На кухне /);
});

test('quiet neighbours and echo-only goals still read as one clean fact', () => {
  const quiet = caseVerdictParts(room({ noisyNeighbors: 'usually_quiet', roomWishes: ['from_above'] }), 'mixed', PCTS);
  assert.equal(quiet[0], 'Сверху пока тихо, но пустотная плита почти не держит звук, и шумных соседей будет хорошо слышно.');
  const echo = caseVerdictParts(room({ roomWishes: ['music_recording'] }), 'mixed', PCTS);
  assert.equal(echo[0], 'В спальне звук отдаётся эхом: гладкий потолок отражает звук обратно в комнату.');
});
