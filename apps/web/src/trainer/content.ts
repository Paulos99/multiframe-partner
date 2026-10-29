/**
 * Содержимое тренажёра: четыре JSON-файла. Лежат в сборке (попадают в предзагрузку сервисного
 * работника, поэтому открываются без сети) и грузятся по требованию: тяжёлый файл возражений
 * не входит в основной пакет кабинета.
 */
import type { ObjectionsFile, QuizFile, ScenariosFile, ScoringFile, TrainerContent } from './types';

export type RawContent = { objections: ObjectionsFile; scenarios: ScenariosFile; quiz: QuizFile; scoring: ScoringFile };

/**
 * Возражение с открытым вопросом (`openIssues`) ждёт решения методолога и в тренажёре скрыто:
 * нет в колоде, банке и сценариях. Сейчас это «А она не загорится?» (документы на горючесть).
 */
export function hideOpenIssues(raw: RawContent): { content: RawContent; hidden: TrainerContent['hidden'] } {
  const hiddenObjections = raw.objections.objections.filter((o) => (o.openIssues ?? []).length > 0);
  if (!hiddenObjections.length) return { content: raw, hidden: [] };
  const ids = new Set(hiddenObjections.map((o) => o.id));
  return {
    hidden: hiddenObjections.map((o) => ({ id: o.id, title: o.panel.title, issues: o.openIssues ?? [] })),
    content: {
      ...raw,
      objections: { ...raw.objections, objections: raw.objections.objections.filter((o) => !ids.has(o.id)) },
      scenarios: {
        ...raw.scenarios,
        scenarios: raw.scenarios.scenarios.map((s) => ({ ...s, steps: s.steps.filter((st) => !ids.has(st.objectionId)) })),
      },
      quiz: {
        ...raw.quiz,
        questions: raw.quiz.questions.map((q) => ({ ...q, relatedObjectionIds: q.relatedObjectionIds.filter((id) => !ids.has(id)) })),
      },
    },
  };
}

/** Хэш (FNV-1a) от четырёх файлов: версия содержимого в каждой попытке. */
export function contentVersionOf(raw: RawContent): string {
  const text = JSON.stringify([raw.objections, raw.scenarios, raw.quiz, raw.scoring]);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `v${raw.objections.schemaVersion}-${h.toString(16).padStart(8, '0')}`;
}

export function buildContent(raw: RawContent): TrainerContent {
  const { content, hidden } = hideOpenIssues(raw);
  return { ...content, contentVersion: contentVersionOf(raw), hidden };
}

let pending: Promise<TrainerContent> | null = null;

export function loadTrainerContent(): Promise<TrainerContent> {
  pending ??= Promise.all([
    import('./content/objections.json'),
    import('./content/scenarios.json'),
    import('./content/quiz.json'),
    import('./content/scoring.json'),
  ])
    .then(([objections, scenarios, quiz, scoring]) =>
      buildContent({
        objections: objections.default as unknown as ObjectionsFile,
        scenarios: scenarios.default as unknown as ScenariosFile,
        quiz: quiz.default as unknown as QuizFile,
        scoring: scoring.default as unknown as ScoringFile,
      }),
    )
    .catch((error: unknown) => {
      pending = null;
      throw error;
    });
  return pending;
}
