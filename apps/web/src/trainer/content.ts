/**
 * Содержимое тренажёра: четыре JSON-файла. Лежат в сборке (попадают в предзагрузку сервисного
 * работника, поэтому открываются без сети) и грузятся по требованию: тяжёлый файл возражений
 * не входит в основной пакет кабинета.
 */
import type { ObjectionsFile, QuizFile, ScenariosFile, ScoringFile, TrainerContent } from './types';

export type RawContent = { objections: ObjectionsFile; scenarios: ScenariosFile; quiz: QuizFile; scoring: ScoringFile };

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
  return { ...raw, contentVersion: contentVersionOf(raw) };
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
