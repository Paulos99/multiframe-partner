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

export type DrillRoleId = 'sales' | 'measurer' | 'crew' | 'unassigned';

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
  measuredRooms: number;
  mountedRooms: number;
  mountedAreaM2: number;
  mountedPanels: number;
  projectCount: number;
  value: number;
};

export type DrillRoleRanking = {
  id: DrillRoleId;
  label: string;
  ranking: DrillRankingRow[];
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

export type StaffDrillDrops = {
  rooms: number;
  company: number;
  period: number;
  assignee: number;
  notMounted: number;
  mounted: number;
  cards: number;
  /** Комнаты доски не попали в окно целиком — в рейтинг взята сама доска. */
  boardInsteadOfEmptyPeriod: number;
  /** userId монтажных и закрытых комнат, как их увидел рейтинг. */
  installByUser: Record<string, number>;
  closedByUser: Record<string, number>;
  refused?: number;
  tilePanels: number;
  tileArea: number;
  /** События того же окна, из которого собрана плитка. */
  events?: number;
};

export type StaffDrillResult = {
  metric: DrillMetric;
  period: DrillPeriod;
  from: string | null;
  to: string | null;
  scope: 'company' | 'team';
  demoFilled: boolean;
  roles: DrillRoleRanking[];
  ranking: DrillRankingRow[];
  drops: StaffDrillDrops;
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
  /** Плитка сводки. Если передана, сумма рейтинга догоняет именно её. */
  kpi?: { panels?: number; areaM2?: number } | null;
}): StaffDrillResult;
