import {
  DEFAULT_SALES_RUBRIC,
  isAttemptCompleted,
  openingCountsAsMastery,
  scoreWithFalsePromisePenalty,
  type LearningAttemptStatus,
  type LearningRubric,
  type LearningScenario,
  type LearningScenarioId,
  type RubricCriterion,
} from '../../../../../packages/shared/learning.ts';

export const ACADEMY_ATTEMPTS_STORAGE_KEY = 'mf_academy_attempts_v1';
export const MASTERY_SCORE_THRESHOLD = 70;

export type AcademyStoredAttempt = {
  id: string;
  scenarioId: LearningScenarioId;
  status: LearningAttemptStatus;
  startedAt: string | null;
  completedAt: string | null;
  score: number | null;
  errorTypes: string[];
  context: 'training';
};

export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

const memoryFallback = new Map<string, string>();

const defaultStorage: StorageLike = {
  getItem(key: string) {
    try {
      if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis && globalThis.localStorage) {
        return globalThis.localStorage.getItem(key);
      }
    } catch {
      /* fallback to memory */
    }
    return memoryFallback.get(key) ?? null;
  },
  setItem(key: string, value: string) {
    try {
      if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis && globalThis.localStorage) {
        globalThis.localStorage.setItem(key, value);
        return;
      }
    } catch {
      /* fallback to memory */
    }
    memoryFallback.set(key, value);
  },
};

export function loadAcademyAttempts(storage: Pick<StorageLike, 'getItem'> = defaultStorage): AcademyStoredAttempt[] {
  try {
    const raw = storage.getItem(ACADEMY_ATTEMPTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
      .map((item) => ({
        id: String(item.id || ''),
        scenarioId: (item.scenarioId as LearningScenarioId) || 'sell_multiframe',
        status: (item.status as LearningAttemptStatus) || 'started',
        startedAt: typeof item.startedAt === 'string' ? item.startedAt : null,
        completedAt: typeof item.completedAt === 'string' ? item.completedAt : null,
        score: typeof item.score === 'number' && Number.isFinite(item.score) ? item.score : null,
        errorTypes: Array.isArray(item.errorTypes) ? item.errorTypes.map(String) : [],
        context: 'training' as const,
      }));
  } catch {
    return [];
  }
}

export function saveAcademyAttempts(
  attempts: AcademyStoredAttempt[],
  storage: Pick<StorageLike, 'setItem'> = defaultStorage,
): void {
  const normalized: AcademyStoredAttempt[] = attempts.map((a) => ({
    ...a,
    context: 'training',
  }));
  storage.setItem(ACADEMY_ATTEMPTS_STORAGE_KEY, JSON.stringify(normalized));
}

export function startAcademyAttempt(
  scenarioId: LearningScenarioId,
  storage: StorageLike = defaultStorage,
  nowIso: string = new Date().toISOString(),
): AcademyStoredAttempt {
  const existing = loadAcademyAttempts(storage);
  const attempt: AcademyStoredAttempt = {
    id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    scenarioId,
    status: 'started',
    startedAt: nowIso,
    completedAt: null,
    score: null,
    errorTypes: [],
    context: 'training',
  };
  saveAcademyAttempts([attempt, ...existing], storage);
  return attempt;
}

export function completeAcademyAttempt(
  attemptId: string,
  payload: {
    score: number;
    baseScore?: number;
    hasFalsePromise?: boolean;
    errorTypes?: string[];
  },
  storage: StorageLike = defaultStorage,
  nowIso: string = new Date().toISOString(),
): AcademyStoredAttempt {
  const list = loadAcademyAttempts(storage);
  const idx = list.findIndex((a) => a.id === attemptId);
  const finalScore =
    payload.baseScore != null
      ? scoreWithFalsePromisePenalty(payload.baseScore, Boolean(payload.hasFalsePromise))
      : Math.max(0, Math.min(100, Math.round(payload.score)));

  const errorTypes = [
    ...new Set([
      ...(payload.errorTypes || []),
      ...(payload.hasFalsePromise ? ['false_promise'] : []),
    ]),
  ];

  if (idx >= 0) {
    const updated: AcademyStoredAttempt = {
      ...list[idx],
      status: 'completed',
      startedAt: list[idx].startedAt || nowIso,
      completedAt: nowIso,
      score: finalScore,
      errorTypes,
      context: 'training',
    };
    list[idx] = updated;
    saveAcademyAttempts(list, storage);
    return updated;
  }

  const created: AcademyStoredAttempt = {
    id: attemptId,
    scenarioId: 'sell_multiframe',
    status: 'completed',
    startedAt: nowIso,
    completedAt: nowIso,
    score: finalScore,
    errorTypes,
    context: 'training',
  };
  saveAcademyAttempts([created, ...list], storage);
  return created;
}

/** Открытие тренажёра без завершения и проходного балла не считается освоением. */
export function isAttemptMastered(
  attempt: Pick<AcademyStoredAttempt, 'status' | 'completedAt' | 'score' | 'errorTypes'>,
): boolean {
  if (openingCountsAsMastery(attempt)) return true;
  if (!isAttemptCompleted(attempt)) return false;
  if (attempt.score == null || attempt.score < MASTERY_SCORE_THRESHOLD) return false;
  if (attempt.errorTypes.includes('false_promise')) return false;
  return true;
}

export function isScenarioMastered(
  attempts: ReadonlyArray<AcademyStoredAttempt>,
  scenarioId: LearningScenarioId,
): boolean {
  return attempts.some((a) => a.scenarioId === scenarioId && isAttemptMastered(a));
}

export const RUBRIC_CRITERIA_LABELS: Record<RubricCriterion, string> = {
  need_discovery: 'Выявление потребности и сценария комнаты',
  tech_accuracy: 'Техническая точность без выдумок',
  non_pushy_offer: 'Ненавязчивое предложение акустического комфорта',
  clarity: 'Понятное объяснение простым языком',
  objection_handling: 'Отработка возражений (цена, высота, эффект)',
  next_step: 'Фиксация следующего шага (расчёт / КП)',
  no_false_promises: 'Без ложных обещаний и выдуманных дБ',
};

export type DialogueChoice = {
  id: string;
  text: string;
  nextNodeId: string | null;
  points: number;
  criteriaHit: RubricCriterion[];
  errorType?: string;
  hasFalsePromise?: boolean;
  feedback: string;
};

export type DialogueNode = {
  id: string;
  stepTitle: string;
  clientLine: string;
  contextHint: string;
  choices: DialogueChoice[];
};

export const SELL_MULTIFRAME_SCENARIO: LearningScenario = {
  id: 'sell_multiframe',
  role: 'any',
  difficulty: 'medium',
  version: '1.0',
  title: 'Продай MultiFrame: от натяжного потолка к акустическому комфорту',
  rubric: DEFAULT_SALES_RUBRIC,
};

const FALSE_PROMISE_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /гарантированн[а-яёa-z]*\s+тишин[а-яёa-z]*/i, label: 'гарантированная тишина' },
  { pattern: /гарантиру[а-яёa-z]*\s+тишин[а-яёa-z]*/i, label: 'гарантируем тишину' },
  { pattern: /полн[а-яёa-z]*\s+тишин[а-яёa-z]*/i, label: 'полная тишина' },
  { pattern: /абсолютн[а-яёa-z]*\s+тишин[а-яёa-z]*/i, label: 'абсолютная тишина' },
  {
    pattern: /100\s*%\s*(тишин[а-яёa-z]*|звукоизоляц[а-яёa-z]*|изоляц[а-яёa-z]*)/i,
    label: '100% тишина/звукоизоляция',
  },
  { pattern: /ноль\s+шума|шума\s+вообще\s+не\s+будет/i, label: 'обещание полного отсутствия шума' },
  {
    pattern:
      /(-\s*\d{2,3}\s*д[бb]|убер[а-яёa-z]*\s+\d{2,3}\s*д[бb]|сниз[а-яёa-z]*\s+на\s+\d{2,3}\s*д[бb]|(?:^|\s)([3-9]\d|\d{3})\s*д[бb](?=$|\s|[,.!;?)]))/i,
    label: 'выдуманные цифры дБ',
  },
];

export function detectFalsePromise(text: string): { hasFalsePromise: boolean; matches: string[] } {
  const normalized = (text || '').trim();
  if (!normalized) return { hasFalsePromise: false, matches: [] };
  const matches: string[] = [];
  for (const item of FALSE_PROMISE_PATTERNS) {
    if (item.pattern.test(normalized)) {
      matches.push(item.label);
    }
  }
  return {
    hasFalsePromise: matches.length > 0,
    matches,
  };
}

export const SELL_MULTIFRAME_NODES: Record<string, DialogueNode> = {
  start: {
    id: 'start',
    stepTitle: 'Шаг 1. Контакт и выяснение задачи по комнате',
    clientLine:
      '«Здравствуйте! Нам нужен обычный матовый натяжной потолок в спальню 16 м², новостройка монолит. Посчитайте просто полотно и профиль.»',
    contextHint:
      'Клиент пришёл за базовым потолком и пока не задумывался об эффекте барабана под натяжным полотном в монолитном доме.',
    choices: [
      {
        id: 'start_discovery',
        text: '«Конечно, базовый потолок сейчас посчитаем. Подскажите: спальня в монолите уже жилая или идёт ремонт? Бывает ли слышно соседей сверху или гулкость в комнате?»',
        nextNodeId: 'pitch',
        points: 25,
        criteriaHit: ['need_discovery', 'non_pushy_offer'],
        feedback:
          'Верно: вы сразу соглашаетесь сделать базовый расчёт и мягко уточняете сценарий комнаты и акустический контекст.',
      },
      {
        id: 'start_pushy',
        text: '«В монолите без звукоизоляции делать натяжной потолок вообще нельзя — будет гудеть как барабан! Давайте сразу ставить MultiFrame.»',
        nextNodeId: 'pitch',
        points: 10,
        criteriaHit: [],
        errorType: 'pushy_sale',
        feedback:
          'Слишком давящий заход: пугать клиента с первой фразы без вопросов о его ситуации вызывает защиту.',
      },
      {
        id: 'start_false_promise',
        text: '«Поставьте систему MultiFrame под полотно — это гарантированная тишина и минус 45 дБ от любых соседей сверху!»',
        nextNodeId: 'pitch',
        points: 5,
        criteriaHit: [],
        errorType: 'false_promise',
        hasFalsePromise: true,
        feedback:
          'Грубая ошибка: обещание «гарантированной тишины» и выдуманных «-45 дБ» создаёт ложные ожидания и рекламацию.',
      },
    ],
  },
  pitch: {
    id: 'pitch',
    stepTitle: 'Шаг 2. Объяснение принципа работы без перегруза',
    clientLine:
      '«Да, дом только сдали, соседи сверху уже делают ремонт и топают, да и в пустой комнате эхо. Но разве под натяжной потолок что-то тонкое помещается?»',
    contextHint:
      'Нужно коротко и технически точно объяснить, как работает панель StP MultiFrame под натяжным потолком.',
    choices: [
      {
        id: 'pitch_accurate',
        text: '«Под натяжным полотном образуется замкнутая воздушная полость. Панели MultiFrame (750×550 мм) крепятся к перекрытию на дюбель-гвозди до натяжки: они гасят переотражения в запотолочном пространстве и снижают воздушный шум без сложного каркаса.»',
        nextNodeId: 'objection',
        points: 25,
        criteriaHit: ['tech_accuracy', 'clarity'],
        feedback:
          'Отлично: точно объяснили физику эффекта и простой монтаж без выдуманных обещаний.',
      },
      {
        id: 'pitch_vague',
        text: '«Там специальная секретная пена, она клеится прямо на натяжное полотно сверху и глушит вообще все звуки.»',
        nextNodeId: 'objection',
        points: 5,
        criteriaHit: [],
        errorType: 'tech_inaccuracy',
        feedback:
          'Техническая ошибка: панели крепятся к плите перекрытия на грибки/дюбели, а не на полотно.',
      },
      {
        id: 'pitch_false_db',
        text: '«Панель тонкая, но даёт 100% звукоизоляцию и гарантированную тишину от перфоратора и прыжков сверху, убирает 50 дБ!»',
        nextNodeId: 'objection',
        points: 0,
        criteriaHit: [],
        errorType: 'false_promise',
        hasFalsePromise: true,
        feedback:
          'Ложное обещание: от структурного ударного шума перфоратора ни одна бескаркасная панель не даст «100% тишины» и «50 дБ».',
      },
    ],
  },
  objection: {
    id: 'objection',
    stepTitle: 'Шаг 3. Отработка возражения по высоте и бюджету',
    clientLine:
      '«Звучит логично, но у нас потолки 2.68 м — не хочется терять по 10–12 см, да и переплачивать в два раза мы не планировали.»',
    contextHint:
      'Сравните толщину и бюджет бескаркасного решения с классическими каркасными пирогами и предложите прозрачное сравнение.',
    choices: [
      {
        id: 'objection_handled',
        text: '«В этом и плюс MultiFrame: панель помещается практически в стандартный опуск натяжного потолка без тяжёлого ГКЛ-каркаса. А по бюджету я покажу два варианта в смете — базовый потолок и потолок с акустическим комфортом, чтобы вы видели точную разницу на ваши 16 м².»',
        nextNodeId: 'closing',
        points: 25,
        criteriaHit: ['objection_handling', 'non_pushy_offer', 'clarity'],
        feedback:
          'Сильный ответ: сняли страх потери высоты и предложили спокойное сравнение двух вариантов сметы.',
      },
      {
        id: 'objection_discount',
        text: '«Ну если дорого — давайте тогда вообще ничего делать не будем, посчитаю только плёнку.»',
        nextNodeId: 'closing',
        points: 8,
        criteriaHit: [],
        errorType: 'dropped_value',
        feedback:
          'Вы сразу сдались при первом вопросе о цене и высоте, хотя клиент был заинтересован.',
      },
      {
        id: 'objection_false',
        text: '«Не переживайте, панель 5 мм даёт гарантированную тишину как бункер, снизит на 60 дБ и вообще ничего не стоит!»',
        nextNodeId: 'closing',
        points: 0,
        criteriaHit: [],
        errorType: 'false_promise',
        hasFalsePromise: true,
        feedback:
          'Недостоверные обещания («гарантированная тишина», «60 дБ») разрушают доверие.',
      },
    ],
  },
  closing: {
    id: 'closing',
    stepTitle: 'Шаг 4. Следующий шаг и фиксация КП',
    clientLine:
      '«Хорошо, два варианта для сравнения — это удобно. Как нам понять, что реально изменится в спальне и сколько панелей нужно?»',
    contextHint:
      'Свяжите продажу со штатными инструментами партнёра: Проблемомером (профиль комфорта) и Калькулятором (смета с раскладкой).',
    choices: [
      {
        id: 'closing_tools',
        text: '«Сейчас за 2 минуты пройдём короткий Проблемомер по вашей спальне — вы увидите и услышите разницу акустического комфорта До/После, а в Калькуляторе сформируем точную смету с количеством панелей (39 шт. на 16 м²) и пришлём КП в мессенджер.»',
        nextNodeId: null,
        points: 25,
        criteriaHit: ['next_step', 'tech_accuracy', 'no_false_promises'],
        feedback:
          'Безупречное завершение: конкретный следующий шаг через Проблемомер + Калькулятор и отправка КП.',
      },
      {
        id: 'closing_passive',
        text: '«Ну вы почитайте в интернете про MultiFrame и перезвоните нам, если надумаете.»',
        nextNodeId: null,
        points: 5,
        criteriaHit: [],
        errorType: 'no_next_step',
        feedback:
          'Потеря инициативы: клиент просил показать расчёт и эффект, а вы отправили его искать информацию самостоятельно.',
      },
      {
        id: 'closing_false_guarantee',
        text: '«Я просто напишу вам сумму в СМС, гарантируем тишину 100% и минус 40 дБ по договору без всяких замеров!»',
        nextNodeId: null,
        points: 0,
        criteriaHit: [],
        errorType: 'false_promise',
        hasFalsePromise: true,
        feedback:
          'Штраф за ложные обещания: нельзя обещать «100% тишину» и выдуманные децибелы вместо корректного расчёта.',
      },
    ],
  },
};

export type SellMultiframeEvaluation = {
  baseScore: number;
  finalScore: number;
  hasFalsePromise: boolean;
  falsePromiseDetails: string[];
  criteriaMet: RubricCriterion[];
  criteriaMissed: RubricCriterion[];
  errorTypes: string[];
  passed: boolean;
  summaryFeedback: string;
};

export function evaluateSellMultiframeAttempt(
  choiceIds: string[],
  customPitchText = '',
  rubric: LearningRubric = SELL_MULTIFRAME_SCENARIO.rubric,
): SellMultiframeEvaluation {
  const allChoices = Object.values(SELL_MULTIFRAME_NODES).flatMap((n) => n.choices);
  const picked = choiceIds
    .map((id) => allChoices.find((c) => c.id === id))
    .filter((c): c is DialogueChoice => Boolean(c));

  const rawPoints = picked.reduce((sum, c) => sum + c.points, 0);
  const baseScore = Math.max(0, Math.min(100, rawPoints));

  const criteriaSet = new Set<RubricCriterion>();
  const errorSet = new Set<string>();
  const falsePromiseDetails: string[] = [];

  for (const choice of picked) {
    for (const c of choice.criteriaHit) criteriaSet.add(c);
    if (choice.errorType) errorSet.add(choice.errorType);
    const detected = detectFalsePromise(choice.text);
    if (choice.hasFalsePromise || detected.hasFalsePromise) {
      errorSet.add('false_promise');
      falsePromiseDetails.push(...(detected.matches.length ? detected.matches : ['недостоверное обещание']));
    }
  }

  const customDetection = detectFalsePromise(customPitchText);
  if (customDetection.hasFalsePromise) {
    errorSet.add('false_promise');
    falsePromiseDetails.push(...customDetection.matches);
  }

  const hasFalsePromise = errorSet.has('false_promise');
  if (!hasFalsePromise && picked.length > 0) {
    criteriaSet.add('no_false_promises');
  } else {
    criteriaSet.delete('no_false_promises');
  }

  const finalScore = scoreWithFalsePromisePenalty(baseScore, hasFalsePromise, rubric);
  const criteriaMet = rubric.criteria.filter((c) => criteriaSet.has(c));
  const criteriaMissed = rubric.criteria.filter((c) => !criteriaSet.has(c));
  const errorTypes = [...errorSet];
  const passed = finalScore >= 70 && !hasFalsePromise;

  let summaryFeedback =
    'Сценарий пройден уверенно: потребность выявлена, технология объяснена без ложных обещаний, назначен расчёт и КП.';
  if (hasFalsePromise) {
    summaryFeedback = `Внимание: применён штраф −${rubric.falsePromisePenalty} баллов за ложные обещания (${[...new Set(falsePromiseDetails)].join(', ')}). В продажах MultiFrame мы говорим об акустическом комфорте и снижении гулкости/воздушного шума, не обещая «гарантированную тишину» или выдуманные дБ.`;
  } else if (!passed) {
    summaryFeedback =
      'Рекомендуем пройти диалог ещё раз: уточняйте сценарий комнаты, избегайте давления и всегда переводите разговор к Проблемомеру и смете в двух вариантах.';
  }

  return {
    baseScore,
    finalScore,
    hasFalsePromise,
    falsePromiseDetails: [...new Set(falsePromiseDetails)],
    criteriaMet,
    criteriaMissed,
    errorTypes,
    passed,
    summaryFeedback,
  };
}
