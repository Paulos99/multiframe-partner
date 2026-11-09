export function monthLabelRu(key: string): string;

export type StaffTopProject = {
  id: string;
  name: string;
  clientName: string;
  stage: string;
  quoteSum: number;
  rooms: number;
  area: number;
  rankBy: 'quote' | 'rooms' | 'area';
};

export function buildStaffTopProjects(input?: {
  rooms?: ReadonlyArray<object> | null;
  projects?: ReadonlyArray<object> | null;
  userId?: string | null;
  from?: string | null;
  to?: string | null;
  limit?: number;
}): StaffTopProject[];

export type StaffMonthlyPoint = {
  key: string;
  label: string;
  quotes: number;
  measures: number;
  installs: number;
  sum: number;
  created: number;
  closed: number;
  refused: number;
  area: number;
};

export function buildStaffMonthlySeries(input?: {
  rooms?: ReadonlyArray<object> | null;
  userId?: string | null;
  from?: string | null;
  to?: string | null;
}): StaffMonthlyPoint[];
