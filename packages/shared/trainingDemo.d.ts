import type { MaterialOpen, TrainingAttempt } from './trainingStats.js';

export const DEMO_TRAINING_ORGS: string[];
export function isDemoTrainingOrg(orgId: string | null | undefined): boolean;
export function demoTrainingFor(login: string, nowMs?: number): { attempts: TrainingAttempt[]; materials: MaterialOpen[] };
