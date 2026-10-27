export const DRILL_METRICS: readonly string[];
export const DRILL_PERIODS: readonly string[];

export type DrillMetric =
  | 'staff'
  | 'problemomer'
  | 'calculator'
  | 'pdf'
  | 'area'
  | 'panels'
  | 'avg'
  | 'done';

export type DrillPeriod = 'month' | 'quarter' | 'year';

export type DrillViewer = {
  id: string;
  role: string;
  orgId?: string | null;
};

export type DrillUser = {
  id: string;
  login?: string;
  displayName?: string;
  role: string;
  orgId?: string | null;
};

export type DrillRankingRow = {
  userId: string;
  login: string;
  displayName: string;
  role: string;
  problemomer: number;
  calculator: number;
  pdf: number;
  areaM2: number;
  panels: number;
  completed: number;
  value: number;
};

export type DrillMonth = {
  key: string;
  label: string;
  problemomer: number;
  calculator: number;
  pdf: number;
  areaM2: number;
  panels: number;
  completed: number;
};

export type DrillAverages = {
  problemomer: number;
  calculator: number;
  pdf: number;
  areaM2: number;
  panels: number;
  completed: number;
};

export type DrillProject = {
  id: string;
  name: string;
  areaM2: number;
  panels: number;
  rooms: number;
  roomId: string | null;
};

export type StaffDrillResult = {
  metric: DrillMetric;
  period: DrillPeriod;
  from: string | null;
  to: string | null;
  scope: 'company' | 'team';
  demoFilled: boolean;
  ranking: DrillRankingRow[];
  detail: {
    userId: string;
    months: DrillMonth[];
    averages: DrillAverages;
    projects: DrillProject[];
  } | null;
};

export function drillWindow(
  period: string,
  now?: Date | string,
): { period: DrillPeriod; from: string; to: string };

export function visibleStaff(viewer: DrillViewer, users: DrillUser[], orgId?: string | null): DrillUser[];

export function buildStaffDrill(input: {
  viewer: DrillViewer;
  users?: DrillUser[];
  events?: Array<Record<string, unknown>>;
  objects?: Array<Record<string, unknown>>;
  projects?: Array<Record<string, unknown>>;
  metric?: string;
  period?: string;
  userId?: string | null;
  orgId?: string | null;
  now?: Date | string;
  from?: string | null;
  to?: string | null;
  unbounded?: boolean;
  demoFill?: boolean;
}): StaffDrillResult;
