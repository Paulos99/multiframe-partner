/**
 * Golden anchors for the acoustic model (Trofimov + material shapes + MultiFrame caps).
 * Run: npx tsx src/state/acoustic/check.ts
 */
import { airGainFor, applyMultiFrame } from './multiframe';
import { buildConstruction, constructionFixture } from './construction';
import { SPECTRUM_HZ, clamp, round1 } from './bands';
import {
  MARKETING_AFTER_GAIN_MAX,
  MARKETING_AFTER_GAIN_MIN,
  scaleAudioDelta,
} from './marketing';
import {
  airFeltFromIndex,
  deriveSimulation,
  impactFeltFromIndex,
  NORMS,
  FELT_STEPS,
  perceivedReductionPct,
} from '../simulation';
import type { RoomAnswers, SessionAnswers } from '../types';
import { buildRoomAudioShape, playbackGainForReceivedDb } from '../../audio/roomAudioShape';
import { decodeRoomAnswers, encodeRoomAnswers, sessionFromShareToken } from '../shareLink';
import { buildAnalyticsPayload } from '../../analytics/payload';

function sampleRoom(over: Partial<RoomAnswers> = {}): RoomAnswers {
  return {
    roomType: 'living',
    roomTypeCustom: '',
    ceilingAreaM2: 18,
    slabType: 'monolith',
    slabThickness: 'about_160_200',
    floorAbove: 'unknown',
    houseType: 'monolith',
    objectStage: 'newbuild',
    plannedCeiling: 'stretch',
    noisyNeighbors: 'unknown',
    noiseKind: 'unknown',
    roomWishes: ['general'],
    ...over,
  };
}

function sampleAnswers(roomOver: Partial<RoomAnswers> = {}): SessionAnswers {
  return {
    interestFor: 'self',
    room: sampleRoom(roomOver),
    scope: 'ceiling',
  };
}

function band(values: number[], hz: number): number {
  const i = SPECTRUM_HZ.indexOf(hz as (typeof SPECTRUM_HZ)[number]);
  return values[i] ?? 0;
}

export function assertModelAnchors(): string[] {
  const errors: string[] = [];

  const solid180 = constructionFixture({
    kind: 'solid',
    thicknessMm: 180,
    floor: 'bare',
    drum: false,
  });
  if (solid180.Rw !== 54 || solid180.Lnw !== 76) {
    errors.push(`solid 180 bare expected Rw 54 / Lnw 76, got ${solid180.Rw}/${solid180.Lnw}`);
  }

  const pk220 = constructionFixture({
    kind: 'hollow',
    thicknessMm: 220,
    floor: 'bare',
    drum: false,
  });
  if (pk220.Rw !== 52 || pk220.Lnw !== 74) {
    errors.push(`ПК 220 bare expected Rw 52 / Lnw 74, got ${pk220.Rw}/${pk220.Lnw}`);
  }

  const floating = constructionFixture({
    kind: 'solid',
    thicknessMm: 180,
    floor: 'floating',
    drum: false,
  });
  if (floating.Lnw > 58) {
    errors.push(`floating floor should drop Lnw well below 76, got ${floating.Lnw}`);
  }
  if (floating.Lnw >= solid180.Lnw) {
    errors.push(`floating Lnw ${floating.Lnw} should be < bare ${solid180.Lnw}`);
  }

  const dIso100 =
    band(floating.impactIsolation, 100) - band(solid180.impactIsolation, 100);
  const dIso500 =
    band(floating.impactIsolation, 500) - band(solid180.impactIsolation, 500);
  if (dIso500 < dIso100 + 6) {
    errors.push(
      `floating floor should help 500 Hz more than 100 Hz (ΔI 500=${dIso500.toFixed(1)} vs 100=${dIso100.toFixed(1)})`,
    );
  }

  const mfBare = applyMultiFrame(solid180);
  if (mfBare.Lnw <= NORMS.A.Lnw) {
    errors.push(`MultiFrame on bare slab must not reach Lnw ≤ ${NORMS.A.Lnw}, got ${mfBare.Lnw}`);
  }
  // Air gain comes from MF_AIR_GAIN (solid 180 → +8); |ΔLnw| ~5–11
  if (mfBare.deltaRw !== airGainFor(solid180)) {
    errors.push(`MultiFrame ΔRw must follow MF_AIR_GAIN (${airGainFor(solid180)}), got ${mfBare.deltaRw}`);
  }
  if (Math.abs(mfBare.deltaLnw) < 5 || Math.abs(mfBare.deltaLnw) > 11) {
    errors.push(`MultiFrame |ΔLnw| on bare slab should be 5–11, got ${mfBare.deltaLnw}`);
  }

  const mfFloat = applyMultiFrame(floating);
  if (Math.abs(mfFloat.deltaLnw) > 4) {
    errors.push(`floating floor should shrink MultiFrame |ΔLnw| to ≤4, got ${mfFloat.deltaLnw}`);
  }
  if (mfFloat.deltaRw !== airGainFor(floating)) {
    errors.push(`floating MultiFrame ΔRw must follow MF_AIR_GAIN, got ${mfFloat.deltaRw}`);
  }

  const thinner = constructionFixture({
    kind: 'solid',
    thicknessMm: 140,
    floor: 'bare',
    drum: false,
  });
  if (thinner.Rw >= solid180.Rw) {
    errors.push(`140 mm should be weaker airborne than 180 mm (${thinner.Rw} vs ${solid180.Rw})`);
  }

  const wood = constructionFixture({
    kind: 'wood',
    thicknessMm: 200,
    floor: 'bare',
    drum: false,
  });
  if (band(wood.R, 100) > band(solid180.R, 100) - 6) {
    errors.push(
      `wood should be much weaker at 100 Hz than solid 180 (${band(wood.R, 100)} vs ${band(solid180.R, 100)})`,
    );
  }

  // Product wood + flanking: chart isolation must stay ≥ 0 (I = 110 − Ln).
  const woodProduct = buildConstruction(
    sampleRoom({
      slabType: 'wood',
      houseType: 'wood',
      floorAbove: 'ordinary',
      objectStage: 'occupied',
      plannedCeiling: 'stretch',
    }),
  );
  const woodMf = applyMultiFrame(woodProduct);
  const woodIsoMin = Math.min(...woodProduct.impactIsolation, ...woodMf.impactIsolation);
  if (woodIsoMin < 0) {
    errors.push(
      `wood impactIsolation must stay ≥ 0 on chart (got min ${woodIsoMin}; LF was going negative with ref 90)`,
    );
  }
  for (const hz of [100, 125, 160] as const) {
    const before = band(woodProduct.impactIsolation, hz);
    const after = band(woodMf.impactIsolation, hz);
    if (before < 0 || after < 0) {
      errors.push(`wood impactIsolation at ${hz} Hz must be ≥ 0 (before ${before}, after ${after})`);
    }
  }

  if (band(pk220.R, 125) >= band(solid180.R, 125) - 0.5) {
    errors.push(
      `ПК should dip more at 125 Hz than solid 180 (${band(pk220.R, 125)} vs ${band(solid180.R, 125)})`,
    );
  }

  const panel = constructionFixture({
    kind: 'solid',
    thicknessMm: 180,
    floor: 'bare',
    drum: false,
    houseType: 'panel',
  });
  const brick = constructionFixture({
    kind: 'solid',
    thicknessMm: 180,
    floor: 'bare',
    drum: false,
    houseType: 'brick',
  });
  if (panel.Rw >= brick.Rw) {
    errors.push(`panel flanking should lower Rw vs brick (${panel.Rw} vs ${brick.Rw})`);
  }

  const quiet = buildConstruction(sampleRoom({ noisyNeighbors: 'usually_quiet' }));
  const loud = buildConstruction(sampleRoom({ noisyNeighbors: 'often_noisy' }));
  if (quiet.Rw !== loud.Rw || quiet.Lnw !== loud.Lnw) {
    errors.push(
      `neighbors must not change construction indices (quiet ${quiet.Rw}/${quiet.Lnw} vs loud ${loud.Rw}/${loud.Lnw})`,
    );
  }

  const simQuiet = deriveSimulation(sampleAnswers({ noisyNeighbors: 'usually_quiet' }));
  const simLoud = deriveSimulation(sampleAnswers({ noisyNeighbors: 'often_noisy' }));
  if (simQuiet.before.Rw !== simLoud.before.Rw || simQuiet.before.Lnw !== simLoud.before.Lnw) {
    errors.push('deriveSimulation: neighbors changed Rw/Lnw');
  }
  if (simLoud.receivedAirDb.before <= simQuiet.receivedAirDb.before) {
    errors.push(
      `loud neighbors should raise received air (${simLoud.receivedAirDb.before} vs ${simQuiet.receivedAirDb.before})`,
    );
  }
  if (
    !simLoud.receivedAirBands?.before?.length ||
    simLoud.receivedAirBands.before.length !== SPECTRUM_HZ.length
  ) {
    errors.push('receivedAirBands.before missing or wrong length');
  }

  const shapeQuiet = buildRoomAudioShape(simQuiet, 'air', 'talk');
  const shapeLoud = buildRoomAudioShape(simLoud, 'air', 'talk');
  if (shapeLoud.beforeGainDb <= shapeQuiet.beforeGainDb) {
    errors.push(
      `audio beforeGain should rise with loud neighbors (${shapeLoud.beforeGainDb} vs ${shapeQuiet.beforeGainDb})`,
    );
  }
  if (
    playbackGainForReceivedDb(simLoud.receivedAirDb.before, 'air') <=
    playbackGainForReceivedDb(simQuiet.receivedAirDb.before, 'air')
  ) {
    errors.push('playbackGainForReceivedDb not monotonic with received dBA');
  }
  if (shapeLoud.afterGainDb > MARKETING_AFTER_GAIN_MAX) {
    errors.push(`MultiFrame afterGainDb should cut ≥ 3 dB vs До (got ${shapeLoud.afterGainDb})`);
  }
  if (shapeLoud.afterGainDb < MARKETING_AFTER_GAIN_MIN) {
    errors.push(`После afterGainDb should be capped (≥ ${MARKETING_AFTER_GAIN_MIN}), got ${shapeLoud.afterGainDb}`);
  }
  const dbaDiff = round1(shapeLoud.targetAfterDb - shapeLoud.targetBeforeDb);
  const expectedAfter = clamp(
    scaleAudioDelta(dbaDiff),
    MARKETING_AFTER_GAIN_MIN,
    MARKETING_AFTER_GAIN_MAX,
  );
  // Dry-stem demo: afterGain is at least dBA Δ, often stronger (index Δ + floor).
  if (shapeLoud.afterGainDb > expectedAfter + 0.2) {
    errors.push(
      `afterGain should cut ≥ marketing-scaled dBA Δ (got ${shapeLoud.afterGainDb}, floor ${expectedAfter})`,
    );
  }
  if (shapeLoud.afterGainDb > -7.5) {
    errors.push(`air После should be clearly quieter on dry stems (got ${shapeLoud.afterGainDb})`);
  }
  if (shapeLoud.mufflingHzBefore > 2400) {
    errors.push(
      `До muffling too open for dry stems (${shapeLoud.mufflingHzBefore} Hz)`,
    );
  }
  if (Math.abs(shapeLoud.mufflingHzAfter - shapeLoud.mufflingHzBefore) > 1) {
    errors.push(
      `После muffling should match До timbre (${shapeLoud.mufflingHzBefore} → ${shapeLoud.mufflingHzAfter})`,
    );
  }
  if (shapeLoud.deltaEqDb.some((d) => d > 0.05)) {
    errors.push('После EQ must not brighten vs muffled До');
  }
  // Residual EQ should not be flat-zero when bands move (MultiFrame shapes spectrum).
  const residualEnergy = shapeLoud.deltaEqDb.reduce((a, b) => a + Math.abs(b), 0);
  if (residualEnergy < 2) {
    errors.push(`deltaEq residual vs До should shape spectrum (energy ${residualEnergy})`);
  }
  // Effective after cut at key bands must stay clearly below До (0).
  const effective = shapeLoud.deltaEqDb.map((d) => shapeLoud.afterGainDb + d);
  const meanEff = effective.reduce((a, b) => a + b, 0) / effective.length;
  if (meanEff > -5) {
    errors.push(`effective После vs До too weak (mean ${meanEff.toFixed(1)} dB)`);
  }

  const simGoodMono = deriveSimulation(
    sampleAnswers({
      slabType: 'monolith',
      slabThickness: 'over_250',
      houseType: 'monolith',
      roomType: 'office',
      ceilingAreaM2: 10,
      noisyNeighbors: 'usually_quiet',
      floorAbove: 'ordinary',
      objectStage: 'occupied',
    }),
  );
  const shapeGoodAir = buildRoomAudioShape(simGoodMono, 'air', 'talk');
  if (shapeGoodAir.beforeGainDb > -5) {
    errors.push(
      `good monolith office «До» should sit quieter (beforeGain ${shapeGoodAir.beforeGainDb}, L2 ${shapeGoodAir.targetBeforeDb})`,
    );
  }
  if (shapeGoodAir.mufflingHzBefore > 2200) {
    errors.push(
      `good monolith office «До» should sound through-slab (${shapeGoodAir.mufflingHzBefore} Hz)`,
    );
  }
  if (shapeGoodAir.beforeGainDb >= shapeLoud.beforeGainDb) {
    errors.push(
      `good mono До must be quieter than loud neighbors (${shapeGoodAir.beforeGainDb} vs ${shapeLoud.beforeGainDb})`,
    );
  }

  const simKidsMono = deriveSimulation(
    sampleAnswers({
      slabType: 'monolith',
      slabThickness: 'over_250',
      houseType: 'monolith',
      roomType: 'kids',
      ceilingAreaM2: 20,
      noisyNeighbors: 'sometimes_noisy',
      floorAbove: 'ordinary',
      objectStage: 'occupied',
    }),
  );
  const kidsAirFeltBefore = airFeltFromIndex(simKidsMono.before.Rw);
  const kidsAirFeltAfter = airFeltFromIndex(simKidsMono.after.Rw);
  if (kidsAirFeltBefore === 'high') {
    errors.push(
      `kids mono250 «До» felt should not be «высокий комфорт» (Rw ${simKidsMono.before.Rw}, step ${kidsAirFeltBefore})`,
    );
  }
  const shapeKidsAir = buildRoomAudioShape(simKidsMono, 'air', 'talk');
  // Audio still follows L2; only require a meaningful cut on quiet-ish rooms.
  if (shapeKidsAir.targetBeforeDb <= 54 && shapeKidsAir.beforeGainDb > -4) {
    errors.push(
      `kids mono До with L2≤54 should cut stem (beforeGain ${shapeKidsAir.beforeGainDb}, L2 ${shapeKidsAir.targetBeforeDb})`,
    );
  }
  const kidsFeltIdxBefore = FELT_STEPS.indexOf(kidsAirFeltBefore);
  const kidsFeltIdxAfter = FELT_STEPS.indexOf(kidsAirFeltAfter);
  if (kidsFeltIdxAfter < kidsFeltIdxBefore) {
    errors.push(
      `kids mono MultiFrame felt should not worsen (${kidsAirFeltBefore} → ${kidsAirFeltAfter}, Rw ${simKidsMono.before.Rw}→${simKidsMono.after.Rw})`,
    );
  }
  if (simKidsMono.after.Rw <= simKidsMono.before.Rw) {
    errors.push(
      `kids mono Rw after should rise (${simKidsMono.before.Rw} → ${simKidsMono.after.Rw})`,
    );
  }
  // Heavy monolith: field ΔRw is modest (~1–2); require any real L2 drop, not ≥2 dB.
  if (simKidsMono.receivedAirDb.after >= simKidsMono.receivedAirDb.before) {
    errors.push(
      `kids mono L2 after should drop vs before (${simKidsMono.receivedAirDb.before} → ${simKidsMono.receivedAirDb.after})`,
    );
  }
  const kidsImpactFeltBefore = impactFeltFromIndex(simKidsMono.before.Lnw);
  if (FELT_STEPS.indexOf(kidsImpactFeltBefore) < 0) {
    errors.push(`invalid impact felt step ${kidsImpactFeltBefore}`);
  }
  const kidsImpactFeltAfter = impactFeltFromIndex(simKidsMono.after.Lnw);
  if (FELT_STEPS.indexOf(kidsImpactFeltAfter) < FELT_STEPS.indexOf('comfort')) {
    errors.push(
      `kids mono impact after must reach «комфорт» (got ${kidsImpactFeltAfter}, Lnw ${simKidsMono.after.Lnw})`,
    );
  }

  const harshImpact = [
    sampleAnswers({
      slabType: 'wood',
      houseType: 'panel',
      slabThickness: 'up_to_160',
      floorAbove: 'unknown',
      objectStage: 'newbuild',
    }),
    sampleAnswers({
      slabType: 'monolith',
      houseType: 'panel',
      slabThickness: 'up_to_160',
      floorAbove: 'ordinary',
      objectStage: 'occupied',
    }),
    sampleAnswers({
      slabType: 'hollow',
      houseType: 'panel',
      slabThickness: 'about_200_250',
      floorAbove: 'ordinary',
      objectStage: 'occupied',
    }),
  ];
  for (const answers of harshImpact) {
    const sim = deriveSimulation(answers);
    const afterStep = impactFeltFromIndex(sim.after.Lnw);
    if (FELT_STEPS.indexOf(afterStep) < FELT_STEPS.indexOf('comfort')) {
      errors.push(
        `impact after must reach «комфорт» (${answers.room.slabType}/${answers.room.houseType}: ${afterStep}, Lnw ${sim.after.Lnw})`,
      );
    }
    if (sim.after.Lnw > NORMS.V.Lnw) {
      errors.push(`impact after Lnw ${sim.after.Lnw} is above class В`);
    }
    if (sim.after.Lnw > sim.before.Lnw) {
      errors.push('impact baseline lift made after worse than before');
    }
  }

  const simKitchen = deriveSimulation(
    sampleAnswers({
      roomType: 'kitchen',
      floorAbove: 'ordinary',
      objectStage: 'occupied',
    }),
  );
  const simBedroom = deriveSimulation(
    sampleAnswers({
      roomType: 'bedroom',
      floorAbove: 'ordinary',
      objectStage: 'occupied',
    }),
  );
  if (simKitchen.receivedAirDb.before <= simBedroom.receivedAirDb.before) {
    errors.push(
      `kitchen should be louder than bedroom (${simKitchen.receivedAirDb.before} vs ${simBedroom.receivedAirDb.before})`,
    );
  }

  const simEmpty = deriveSimulation(
    sampleAnswers({
      objectStage: 'newbuild',
      floorAbove: 'ordinary',
      roomType: 'living',
    }),
  );
  const simFurnished = deriveSimulation(
    sampleAnswers({
      objectStage: 'occupied',
      floorAbove: 'ordinary',
      roomType: 'living',
    }),
  );
  if (simEmpty.receivedAirDb.before <= simFurnished.receivedAirDb.before) {
    errors.push(
      `unfurnished newbuild should be louder than occupied (${simEmpty.receivedAirDb.before} vs ${simFurnished.receivedAirDb.before})`,
    );
  }

  const simSmall = deriveSimulation(sampleAnswers({ ceilingAreaM2: 12, floorAbove: 'ordinary' }));
  const simLarge = deriveSimulation(sampleAnswers({ ceilingAreaM2: 32, floorAbove: 'ordinary' }));
  if (Math.abs(simSmall.receivedAirDb.before - simLarge.receivedAirDb.before) < 0.3) {
    errors.push(
      `area should move received level (12 m² ${simSmall.receivedAirDb.before} vs 32 m² ${simLarge.receivedAirDb.before})`,
    );
  }

  const wishBase = {
    roomType: 'living' as const,
    floorAbove: 'ordinary' as const,
    objectStage: 'occupied' as const,
    noisyNeighbors: 'unknown' as const,
  };
  const simWishGeneral = deriveSimulation(sampleAnswers({ ...wishBase, roomWishes: ['general'] }));
  const simWishAbove = deriveSimulation(sampleAnswers({ ...wishBase, roomWishes: ['from_above'] }));
  const simWishMusic = deriveSimulation(
    sampleAnswers({ ...wishBase, roomWishes: ['music_recording'] }),
  );
  if (simWishAbove.before.Rw !== simWishGeneral.before.Rw) {
    errors.push(
      `wish must not change construction Rw (${simWishAbove.before.Rw} vs ${simWishGeneral.before.Rw})`,
    );
  }
  if (simWishAbove.before.Lnw !== simWishGeneral.before.Lnw) {
    errors.push(
      `wish must not change construction Lnw (${simWishAbove.before.Lnw} vs ${simWishGeneral.before.Lnw})`,
    );
  }
  if (simWishMusic.receivedAirDb.before <= simWishGeneral.receivedAirDb.before) {
    errors.push(
      `music_recording should raise received air vs general (${simWishMusic.receivedAirDb.before} vs ${simWishGeneral.receivedAirDb.before})`,
    );
  }
  if (simWishAbove.receivedImpactDb.before <= simWishGeneral.receivedImpactDb.before) {
    errors.push(
      `from_above should raise received impact vs general (${simWishAbove.receivedImpactDb.before} vs ${simWishGeneral.receivedImpactDb.before})`,
    );
  }

  const thickMf = applyMultiFrame(
    constructionFixture({ kind: 'solid', thicknessMm: 250, floor: 'bare', drum: false }),
  );
  const thinMf = applyMultiFrame(thinner);
  if (thinMf.deltaRw + 1 < thickMf.deltaRw) {
    errors.push(
      `thinner slab should get ≥ ΔRw than thick (${thinMf.deltaRw} vs ${thickMf.deltaRw})`,
    );
  }

  // Product in-situ «сейчас» must look like a complaint case, not a lab pass.
  const panelLive = buildConstruction(
    sampleRoom({
      houseType: 'panel',
      slabType: 'hollow',
      slabThickness: 'about_200_250',
      floorAbove: 'ordinary',
      objectStage: 'occupied',
    }),
  );
  if (panelLive.Rw >= 50) {
    errors.push(`panel in-situ before should be Rw < 50 (got ${panelLive.Rw})`);
  }
  const defaultLive = buildConstruction(
    sampleRoom({
      slabType: 'unknown',
      slabThickness: 'unknown',
      houseType: 'unknown',
      floorAbove: 'unknown',
      objectStage: 'occupied',
    }),
  );
  if (defaultLive.Rw >= 50) {
    errors.push(`default occupied unknown before should be Rw < 50 (got ${defaultLive.Rw})`);
  }

  const shareRoom = sampleRoom({
    roomType: 'kids',
    ceilingAreaM2: 22,
    houseType: 'panel',
    roomWishes: ['from_above'],
  });
  const token = encodeRoomAnswers(shareRoom);
  const decoded = decodeRoomAnswers(token);
  if (!decoded || decoded.roomType !== 'kids' || decoded.ceilingAreaM2 !== 22) {
    errors.push('shareLink encode/decode lost room answers');
  }
  const sharedSession = sessionFromShareToken(token);
  if (!sharedSession || sharedSession.step !== 'result' || !sharedSession.derived) {
    errors.push('shareLink sessionFromShareToken must open Result with derived sim');
  }
  if (sharedSession) {
    const analytics = buildAnalyticsPayload(sharedSession);
    if (!analytics || analytics.source !== 'problemomer' || !analytics.sim.before.hybrid) {
      errors.push('buildAnalyticsPayload must return anonymous Result payload');
    }
    if (analytics && ('name' in analytics || 'phone' in analytics)) {
      errors.push('buildAnalyticsPayload must not include contact fields');
    }
  }

  const revOccupied = deriveSimulation(sampleAnswers({ objectStage: 'occupied' })).reverb;
  if (revOccupied.echoInRoomBefore !== 40 || revOccupied.echoInRoomAfter !== 10) {
    errors.push(
      `occupied echo in room should be 40→10 (got ${revOccupied.echoInRoomBefore}→${revOccupied.echoInRoomAfter})`,
    );
  }
  const revNewbuild = deriveSimulation(sampleAnswers({ objectStage: 'newbuild' })).reverb;
  if (revNewbuild.echoInRoomBefore !== 100) {
    errors.push(`newbuild echo in room before should be 100 (got ${revNewbuild.echoInRoomBefore})`);
  }
  if (revNewbuild.echoInRoomAfter !== 50) {
    errors.push(`newbuild echo in room after should be 50 (got ${revNewbuild.echoInRoomAfter})`);
  }
  if (revOccupied.echoInRoomAfter >= revOccupied.echoInRoomBefore) {
    errors.push('MultiFrame must lower in-room echo %');
  }
  const revSmall = deriveSimulation(
    sampleAnswers({ objectStage: 'occupied', ceilingAreaM2: 12 }),
  ).reverb;
  const revLarge = deriveSimulation(
    sampleAnswers({ objectStage: 'occupied', ceilingAreaM2: 40 }),
  ).reverb;
  if (revLarge.rt60Before <= revSmall.rt60Before) {
    errors.push(
      `larger area should lengthen RT60 before (${revLarge.rt60Before} vs ${revSmall.rt60Before})`,
    );
  }
  if (revLarge.rt60After <= revSmall.rt60After) {
    errors.push(
      `larger area should lengthen RT60 after (${revLarge.rt60After} vs ${revSmall.rt60After})`,
    );
  }
  if (
    revOccupied.rt60After >= revOccupied.rt60Before ||
    revOccupied.wetAfter >= revOccupied.wetBefore
  ) {
    errors.push('after MultiFrame should be shorter and drier than before');
  }
  const clapShape = buildRoomAudioShape(
    deriveSimulation(sampleAnswers({ objectStage: 'occupied' })),
    'echo',
    'clap',
  );
  if (clapShape.rt60After >= clapShape.rt60Before || clapShape.wetAfter >= clapShape.wetBefore) {
    errors.push('echo clap shape: after should be shorter / drier than before');
  }
  if (clapShape.afterGainDb > clapShape.beforeGainDb) {
    errors.push('echo clap shape: after should not be louder than before');
  }

  if (perceivedReductionPct(8) !== 60) {
    errors.push(`8 dB should read as 60% quieter (got ${perceivedReductionPct(8)})`);
  }
  if (perceivedReductionPct(4) !== 37) {
    errors.push(`4 dB should read as 37% quieter (got ${perceivedReductionPct(4)})`);
  }
  if (perceivedReductionPct(9) !== 65) {
    errors.push(`9 dB should read as 65% quieter (got ${perceivedReductionPct(9)})`);
  }
  const pctSim = deriveSimulation(
    sampleAnswers({
      slabType: 'monolith',
      slabThickness: 'about_160_200',
      houseType: 'monolith',
      objectStage: 'occupied',
    }),
  );
  const expectAir = perceivedReductionPct(Math.abs(pctSim.delta.Rw));
  const expectImp = perceivedReductionPct(Math.abs(pctSim.delta.Lnw));
  if (pctSim.perceivedAirPct !== expectAir || pctSim.perceivedImpactPct !== expectImp) {
    errors.push(
      `perceived % must follow index Δ (air ${pctSim.perceivedAirPct}≠${expectAir}, impact ${pctSim.perceivedImpactPct}≠${expectImp})`,
    );
  }

  return errors;
}

const errors = assertModelAnchors();
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log('acoustic anchors ok');
}
