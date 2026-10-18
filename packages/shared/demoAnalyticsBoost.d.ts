export const BOOST_RATIO: number;
export const CAPITAL_COMPANY: string;
export const NORTH_COMPANY: string;
export const BOOST_EVENT_PREFIX: string;

export type DemoBoostUser = {
  id: string;
  login: string;
  role: string;
  displayName: string;
  orgId: string | null;
  createdAt: string;
  demo?: boolean;
  loginDisabled?: boolean;
  passwordHash?: string;
};

export type DemoBoostOrg = {
  id: string;
  settings?: { companyName?: string; city?: string };
};

export type DemoBoostPlatform = {
  users: DemoBoostUser[];
  orgs: DemoBoostOrg[];
  objects?: unknown[];
  activity?: unknown[];
};

export type DemoBoostEvent = {
  id: string;
  at: string;
  orgId?: string | null;
  userId?: string | null;
  login?: string;
  role?: string;
  companyName?: string;
  city?: string;
  tool?: string;
  action?: string;
  object?: Record<string, unknown> | null;
};

export function boostCapitalStaff<T extends DemoBoostPlatform>(platform: T): T;
export function boostCapitalEvents<T extends DemoBoostEvent>(
  events: T[],
  addedUsers?: DemoBoostUser[],
  platform?: DemoBoostPlatform | null,
): T[];
export function applyCapitalDemoBoost<P extends DemoBoostPlatform, E extends DemoBoostEvent>(
  platform: P,
  events: E[],
): { platform: P; events: E[]; addedUsers: DemoBoostUser[]; addedEvents: E[] };
