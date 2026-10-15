/**
 * In-room source / received-level layer.
 * Implementation: receiving.ts (spectral L1 − R + Sabine A).
 */
export {
  absorptionM2,
  areaTermDb,
  buildReceiving,
  buildSource,
  neighborSourceDb,
  quietFromReceivedAir,
  quietFromReceivedImpact,
  receivedAirDb,
  receivedImpactDb,
  roomTypeSource,
  sourceAirBands,
  sourceImpactBands,
  type ReceivingResult,
  type SourceMix,
} from './receiving';
