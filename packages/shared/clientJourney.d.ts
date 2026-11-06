export const CLIENT_JOURNEY_STEPS: ReadonlyArray<{ id: string; label: string }>;
export const UNTRACKED_JOURNEY_IDS: Set<string>;

export type JourneyStep = {
  id: string;
  label: string;
  count: number | null;
  fromPrevPct: string;
};

export function computeClientJourney(opts?: {
  rooms?: ReadonlyArray<object> | null;
  events?: ReadonlyArray<object> | null;
  users?: ReadonlyArray<object> | null;
  from?: string | null;
  to?: string | null;
  userId?: string | null;
}): { steps: JourneyStep[]; total: number; closed: number };

export function computeMeasurerJourney(opts?: {
  rooms?: ReadonlyArray<object> | null;
  events?: ReadonlyArray<object> | null;
  userId?: string | null;
  from?: string | null;
  to?: string | null;
}): { steps: JourneyStep[] };

export function computeCrewJourney(opts?: {
  rooms?: ReadonlyArray<object> | null;
  userId?: string | null;
  from?: string | null;
  to?: string | null;
}): { steps: JourneyStep[] };
