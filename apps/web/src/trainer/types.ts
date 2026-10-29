/** Типы содержимого и данных пользователя тренажёра продаж (см. content/spec.md). */

export type TrainerRole = 'owner' | 'manager' | 'measurer' | 'crew' | 'stp_admin';
export type CriterionId = 'discovery' | 'listening' | 'objection' | 'value' | 'honesty' | 'nextstep';
export type Mode = 'objection' | 'roleplay' | 'quiz';

export type VideoRef = { code: string; id: string; title: string };
export type VideoQuote = { id: string; sourceType?: 'video'; videoCode: string; quote: string; appliesTo?: 'answer' | 'pushback' | 'both' };
/** Факт с сайта производителя: говорится только с оговоркой «производитель указывает» (claim) или служит предостережением (caveat). */
export type WebQuote = {
  id: string;
  sourceType: 'web';
  url: string;
  publisher: string;
  sourceKind: string;
  quote: string;
  accessed: string;
  appliesTo?: 'answer' | 'pushback' | 'both';
  use: 'claim' | 'caveat';
  attributionRequired?: boolean;
  note?: string;
};
export type SourceQuote = VideoQuote | WebQuote;
export const isWebQuote = (q: SourceQuote): q is WebQuote => q.sourceType === 'web';

/** Подсказка «что содержит хороший ответ»: ничего не оценивает. */
export type RequiredPoint = {
  id: string;
  ideaId?: string;
  beats: (1 | 2)[];
  text: string;
  anyOf: string[];
  minMatches?: number;
  critical: boolean;
  quoteIds: string[];
};

export type ErrorType = 'false_promise' | 'pressure' | 'vague' | 'ignores_concern';
export type ChoiceOption = {
  id: string;
  text: string;
  correct: boolean;
  errorType: ErrorType | null;
  violates: CriterionId | null;
  explanation: string;
  quoteIds: string[];
  sourceOptionId?: string;
};
/** Выбор ответа на одну реплику клиента: четыре варианта, один верный. */
export type Choice = { mode: 'single'; options: ChoiceOption[] };
export type OpenIssue = { id: string; text: string };
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
  choices: { beat1: Choice; beat2: Choice };
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
  /** Нерешённый вопрос к методологу: пока он открыт, карточка в тренажёре скрыта. */
  openIssues?: OpenIssue[];
};
export type RefusalReason = { key: string; title: string; primary: boolean };
export type ObjectionsFile = {
  schemaVersion: number;
  refusalReasons: RefusalReason[];
  roles: TrainerRole[];
  objections: Objection[];
  videos: VideoRef[];
  requiredPointsRole?: string;
};

export type ScenarioStep = {
  id: string;
  objectionId: string;
  clientPhrasingIndex: number;
  beats: number;
  /** Две реплики клиента в голосе персонажа: первая и повтор. */
  clientLines: [string, string];
  coachHint: string;
  afterPass: string;
  afterFail: string;
  choices: { beat1: Choice; beat2: Choice };
};
export type SuccessCriterion = { id: string; kind: 'firstTryCorrect' | 'noFalsePromise' | 'nextStepChoice'; text: string };
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
  closing: { clientLine: string; requiresNextStep: boolean; choices: Choice; afterCorrect: string; afterWrong: string; goodExamples: string[] };
  successCriteria: SuccessCriterion[];
  /** Задачи для необязательной свободной практики (без оценки). */
  practiceFocus: string[];
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
  choiceMode: {
    criteriaFromViolations: { penaltyPerViolation: number; start: number; floor: number };
    passThresholds: {
      scenario: { firstTryCorrectAtLeast: number; noFalsePromisePick: boolean };
      objection: { firstTryCorrectAtLeast: number };
      levels: { id: string; title: string; minShare: number }[];
    };
  };
};

export type TrainerContent = {
  objections: ObjectionsFile;
  scenarios: ScenariosFile;
  quiz: QuizFile;
  scoring: ScoringFile;
  contentVersion: string;
  /** Возражения, скрытые до решения открытого вопроса (openIssues). */
  hidden: { id: string; title: string; issues: OpenIssue[] }[];
};

/* ---------- данные пользователя ---------- */

export type Scores = Partial<Record<CriterionId, number>>;
export type Flag = { id: string; severity: 'critical' | 'warn'; fragment: string };
/** Необязательная свободная практика: текст без оценки. */
export type AttemptAnswer = {
  stepId?: string;
  beat: 1 | 2;
  clientLine: string;
  text: string;
  ms: number;
};
export type QuizAnswer = { questionId: string; selected: string[]; correct: boolean; ms: number };

export type PickBeat = 1 | 2 | 'closing';
/** Один выбор ответа на одну реплику клиента: все попытки, первая решает. */
export type Pick = {
  stepId?: string;
  objectionId?: string;
  beat: PickBeat;
  clientLine: string;
  /** Верный вариант, на котором закончилась реплика. */
  optionId: string;
  correct: boolean;
  firstTry: boolean;
  tries: { optionId: string; ms: number }[];
  usedHint?: boolean;
  /** Тип и критерий первого неверного выбора (если он был): остаются, даже если текст содержимого изменится. */
  firstError?: { errorType: ErrorType | null; violates: CriterionId | null } | null;
  /** Хотя бы раз выбрано ложное обещание (в любой попытке). */
  falsePromise?: boolean;
};
export type ChoiceScores = Partial<Record<CriterionId, number | null>>;

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
  /** Схема оценки: 2 — выбор ответа. У старых попыток (набор текста с автооценкой) поля нет. */
  scheme?: 2;
  picks?: Pick[];
  /** Основной результат: верных с первого раза / число реплик (0–1). */
  firstTryCorrect?: number;
  choiceScores?: ChoiceScores;
  /** Свободная практика, без оценки. */
  answers: AttemptAnswer[];
  /** Итог 0–5 по критериям из нарушений; если критериев нет, доля × 5. */
  total: number;
  passed: boolean;
  quiz: QuizAnswer[] | null;
  synced: boolean;
  /** Поля старой автооценки: читаются только у старых попыток и викторины. */
  autoScores?: Scores;
  selfScores?: Scores | null;
  finalScores?: Scores;
  matchedPointIds?: string[];
  missedPointIds?: string[];
  flags?: Flag[];
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
  /** 2 — коробка получена в режиме выбора. Карточки возражений без метки — от старой автооценки, их игнорируем. */
  scheme?: 2;
};

export type TrainerSettings = {
  userId: string;
  deckSize: number;
  showAllRoles: boolean;
};

export type ScenarioDraft = {
  key: string;
  userId: string;
  scenarioId: string;
  savedAt: string;
  /** Завершённые выбор за выбором; позиция в разговоре выводится из их числа. */
  picks: Pick[];
  hintsUsed: string[];
  startedAt: string;
};
