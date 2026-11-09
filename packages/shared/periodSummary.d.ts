export type SummaryTone = 'good' | 'bad' | 'neutral' | 'info';

export type SummaryConclusion = {
  id: string;
  tone: SummaryTone;
  text: string;
  action: string;
};

export const SUMMARY_LIMITS: Readonly<{
  minRooms: number;
  minEvents: number;
  minClosed: number;
  minRefusals: number;
  minPerPerson: number;
  flatPct: number;
  staleDays: number;
  inactiveDays: number;
  refusalGapPp: number;
  maxConclusions: number;
}>;

export type PeriodMetrics = {
  from: string | null;
  to: string | null;
  stages: Array<{ id: string; label: string; count: number | null }>;
  roomsCreated: number;
  reachedQuote: number;
  closed: number;
  refused: number;
  completed: number;
  refusedPct: number | null;
  salesSum: number;
  areaSum: number;
  pipelineSum: number;
  avgCycleDays: number | null;
  cycleSample: number;
  stageDays: Array<{ status: string; title: string; avgDays: number; n: number }>;
  staleRooms: number;
  staleProjects: number;
  refusalsTotal: number;
  refusalReasons: Array<{ key: string; title: string; count: number }>;
  problemomer: number;
  calculator: number;
  pdf: number;
  lastActiveAt: string | null;
};

type SummaryInput = {
  rooms?: ReadonlyArray<object> | null;
  events?: ReadonlyArray<object> | null;
  users?: ReadonlyArray<object> | null;
  from?: string | null;
  to?: string | null;
  now?: number | string | Date;
};

export function plural(n: number, forms: [string, string, string]): string;
export function formatRub(n: number): string;
export function changePct(current: number, previous: number | null | undefined): number | null;
export function previousRange(from: string | null, to: string | null): { from: string; to: string } | null;
export function periodMetrics(input?: SummaryInput): PeriodMetrics;

export function buildPeriodSummary(input?: SummaryInput): {
  conclusions: SummaryConclusion[];
  enoughData: boolean;
  current: PeriodMetrics;
  previous: PeriodMetrics | null;
  previousRange: { from: string; to: string } | null;
};

export type PartnerTrend = 'up' | 'down' | 'flat' | null;

export type PartnerComparisonRow = {
  orgId: string;
  name: string;
  city: string;
  rooms: number;
  problemomer: number;
  quotePct: number | null;
  completed: number;
  salesSum: number;
  avgCycleDays: number | null;
  closed: number;
  refusedPct: number | null;
  lastActiveAt: string | null;
  inactiveDays: number | null;
  trendRooms: PartnerTrend;
  trendActivity: PartnerTrend;
  trendSales: PartnerTrend;
};

export function buildPartnerComparison(input?: {
  orgs?: ReadonlyArray<{ id: string; name: string; city?: string }>;
  rooms?: ReadonlyArray<object> | null;
  events?: ReadonlyArray<object> | null;
  from?: string | null;
  to?: string | null;
  now?: number | string;
}): { rows: PartnerComparisonRow[]; conclusions: SummaryConclusion[] };
