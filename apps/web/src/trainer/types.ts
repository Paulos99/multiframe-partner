/** Типы содержимого и данных пользователя тренажёра продаж (см. content/spec.md). */

export type TrainerRole = 'owner' | 'manager' | 'measurer' | 'crew' | 'stp_admin';
export type CriterionId = 'discovery' | 'listening' | 'objection' | 'value' | 'honesty' | 'nextstep';
export type Mode = 'objection' | 'roleplay' | 'quiz';

export type VideoRef = { code: string; id: string; title: string };
export type SourceQuote = { id: string; videoCode: string; quote: string; appliesTo?: 'answer' | 'pushback' | 'both' };
export type RequiredPoint = {
  id: string;
  beat: 1 | 2;
  text: string;
  anyOf: string[];
  minMatches?: number;
  critical: boolean;
  quoteIds: string[];
};
export type ForbiddenClaim = { id: string; text: string; patternsRef?: string };
export type Objection = {
  id: string;
  type: string;
  refusalReasonKey: string;
  roles: TrainerRole[];
  difficulty: number;
  clientPhrasing: string[];
  pushback: string;
  referenceAnswer: string;
  pushbackReferenceAnswer: string;
  requiredPoints: RequiredPoint[];
  forbiddenClaims: ForbiddenClaim[];
  sourceQuotes: SourceQuote[];
  commonMistake: string;
  panel: {
    title: string;
    shortAnswer: string;
    keyFact: string;
    showMaterial: { videoCode: string; title: string; hint: string }[];
    priority: number;
  };
};
export type RefusalReason = { key: string; title: string; primary: boolean };
export type ObjectionsFile = {
  schemaVersion: number;
  refusalReasons: RefusalReason[];
  roles: TrainerRole[];
  objections: Objection[];
  videos: VideoRef[];
};

export type ScenarioStep = {
  id: string;
  objectionId: string;
  clientPhrasingIndex: number;
  beats: number;
  coachHint: string;
  afterPass: string;
  afterFail: string;
};
export type SuccessCriterion = { id: string; kind: 'objectionPoints' | 'noForbiddenClaims' | 'nextStep' | 'manual'; text: string };
export type Scenario = {
  id: string;
  title: string;
  roles: TrainerRole[];
  callType: string;
  difficulty: number;
  estimatedMinutes: number;
  persona: { name: string; age: number; description: string; mood: string; hiddenNeed: string; knowsAbout: string };
  goal: string;
  setup: string;
  steps: ScenarioStep[];
  closing: { clientLine: string; requiresNextStep: boolean; goodExamples: string[] };
  successCriteria: SuccessCriterion[];
  tags: string[];
};
export type ScenariosFile = { schemaVersion: number; scenarios: Scenario[]; videos: VideoRef[] };

export type QuizQuestion = {
  id: string;
  topic: string;
  difficulty: number;
  type: 'single' | 'multi';
  question: string;
  options: { id: string; text: string }[];
  correctOptionIds: string[];
  explanation: string;
  sourceQuotes: { id: string; videoCode: string; quote: string }[];
  isTrap: boolean;
  roles: TrainerRole[];
  relatedObjectionIds: string[];
};
export type QuizFile = {
  schemaVersion: number;
  topics: { id: string; title: string }[];
  questions: QuizQuestion[];
  videos: VideoRef[];
};

export type ForbiddenRule = {
  id: string;
  severity: 'critical' | 'warn';
  negationAware?: boolean;
  patterns: string[];
  exceptIfSentenceMatches?: string[];
  title?: string;
  text?: string;
  correct?: string;
  [key: string]: unknown;
};
export type Criterion = {
  id: CriterionId;
  title: string;
  weight: number;
  modes: string[];
  question: string;
  anchors: Record<'1' | '2' | '3' | '4' | '5', string>;
  selfChecklist: string[];
  auto: { type: string; confidence: string };
};
export type ScoringFile = {
  schemaVersion: number;
  criteria: Criterion[];
  modes: Record<string, { title: string; criteria: string[]; note?: string }>;
  discoveryOptionalInDrill: boolean;
  coverageToScore: [number, number][];
  capIfCriticalMissing: number;
  honestyGate: { honestyAtMost: number; capTotalTo: number };
  passThresholds: {
    objection: { total: number; honestyAtLeast: number; objectionAtLeast: number };
    roleplay: { total: number; honestyAtLeast: number; nextstepAtLeast: number };
    quiz: { percentCorrect: number };
    levels: { id: string; title: string; minAvg: number }[];
  };
  negationWords: string[];
  negationWindowTokens: number;
  globalForbidden: ForbiddenRule[];
  localForbiddenPatterns: Record<string, Omit<ForbiddenRule, 'id'>>;
  ackStarters: string[];
  openQuestionStarters: string[];
  valueLinkPattern: string;
  nextStep: { action: string[]; time: string[]; who: string[] };
  autoScoring: { minAnswerLength: { words: number } };
  srs: { boxes: number; intervalsDays: number[]; dailyLimit: number };
};

export type TrainerContent = {
  objections: ObjectionsFile;
  scenarios: ScenariosFile;
  quiz: QuizFile;
  scoring: ScoringFile;
  contentVersion: string;
};

/* ---------- данные пользователя ---------- */

export type Scores = Partial<Record<CriterionId, number>>;
export type Flag = { id: string; severity: 'critical' | 'warn'; fragment: string };
export type AttemptAnswer = {
  stepId?: string;
  beat: 1 | 2;
  clientLine: string;
  text: string;
  ms: number;
  usedHint?: boolean;
};
export type QuizAnswer = { questionId: string; selected: string[]; correct: boolean; ms: number };

export type LearningAttempt = {
  id: string;
  userId: string;
  partnerId: string | null;
  role: TrainerRole;
  context: 'training';
  mode: Mode;
  itemType: 'objection' | 'scenario' | 'quiz';
  itemIds: string[];
  contentVersion: string;
  startedAt: string;
  finishedAt: string;
  answers: AttemptAnswer[];
  autoScores: Scores;
  selfScores: Scores | null;
  selfNotes?: Partial<Record<CriterionId, string>>;
  /** Отмеченные вручную критерии сценария (kind = manual). */
  manualChecks?: string[];
  /** Ответ «Не знаю» или устный ответ без автооценки. */
  skipped?: boolean;
  finalScores: Scores;
  total: number;
  passed: boolean;
  matchedPointIds: string[];
  missedPointIds: string[];
  flags: Flag[];
  quiz: QuizAnswer[] | null;
  synced: boolean;
};

export type ReviewCard = {
  key: string;
  userId: string;
  itemType: 'objection' | 'quiz';
  itemId: string;
  box: number;
  lastAt: string;
  nextDueAt: string;
  attempts: number;
  passes: number;
  lapses: number;
  bestTotal: number;
  lastTotal: number;
};

export type TrainerSettings = {
  userId: string;
  deckSize: number;
  showAllRoles: boolean;
  autoScoring: boolean;
};

export type ScenarioDraft = {
  key: string;
  userId: string;
  scenarioId: string;
  savedAt: string;
  stepIndex: number;
  answers: AttemptAnswer[];
  hintsUsed: string[];
  startedAt: string;
};
