import type { CompanyTrainingSummary, RecentAttempt, UserTrainingSummary, TrainingAttempt, MaterialOpen, WeakTopic } from './trainingStats.js';

export type TrainingDoc = { version: 1; users: Record<string, { attempts: TrainingAttempt[]; materials: MaterialOpen[] }> };
export type TrainingPerson = { id: string; login?: string; displayName?: string; role?: string; orgId?: string | null };
export type TrainingOrgRef = { id: string; name?: string; settings?: { companyName?: string; city?: string } };

export type EmployeeRow = {
  id: string;
  displayName: string;
  role: string;
  sets: number;
  level: UserTrainingSummary['level'];
  levelShare: number | null;
  quizShare: number | null;
  lastActivityAt: string | null;
  weakTopics: WeakTopic[];
  weakCriteria: { id: string; title: string; avg: number | null }[];
  materialsOpened: number;
};
export type TrainingOrgView = { org: { id: string; name: string }; summary: CompanyTrainingSummary; employees: EmployeeRow[] };
export type TrainingCompanyRow = { id: string; name: string; city: string; summary: CompanyTrainingSummary };
export type TrainingUserView = {
  employee: { id: string; displayName: string; role: string };
  org: { id: string; name: string } | null;
  summary: UserTrainingSummary;
  attempts: RecentAttempt[];
};
export type TrainingMeView = { summary: UserTrainingSummary; attempts: RecentAttempt[] };
export type SyncResult = { acceptedAttemptIds: string[]; acceptedMaterialIds: string[]; rejected: number; stored: number };

export const STAFF_ROLES: string[];
export function emptyTrainingDoc(): TrainingDoc;
export function normalizeTrainingDoc(parsed: unknown): TrainingDoc;
export function mergeTrainingDocument(base: unknown, desired: TrainingDoc, fresh: TrainingDoc): TrainingDoc;
export function applyTrainingSync(
  doc: TrainingDoc,
  userId: string,
  body: unknown,
  nowMs: number,
  maxBatch: number,
): { tooMany: true } | { tooMany?: undefined; next: TrainingDoc | null; result: SyncResult };
export function trainingRecordsFor(doc: TrainingDoc, user: TrainingPerson, nowMs: number): { attempts: TrainingAttempt[]; materials: MaterialOpen[] };
export function viewTrainingOrg(a: { org: TrainingOrgRef; staff: TrainingPerson[]; doc: TrainingDoc; nowMs: number; roleOf: (r?: string) => string }): TrainingOrgView;
export function companyTrainingSummary(a: { org: TrainingOrgRef; staff: TrainingPerson[]; doc: TrainingDoc; nowMs: number }): TrainingCompanyRow;
export function viewTrainingUser(a: { user: TrainingPerson; role: string; org: TrainingOrgRef | null; doc: TrainingDoc; nowMs: number }): TrainingUserView;
export function viewTrainingMe(a: { user: TrainingPerson; doc: TrainingDoc; nowMs: number }): TrainingMeView;
