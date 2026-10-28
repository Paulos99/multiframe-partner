/** Загрузка содержимого с диска для модульных тестов (без Vite). */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildContent } from './content';
import type { TrainerContent } from './types';

const dir = join(dirname(fileURLToPath(import.meta.url)), 'content');
export const readJson = <T>(name: string): T => JSON.parse(readFileSync(join(dir, name), 'utf-8')) as T;

let cached: TrainerContent | null = null;
export function testContent(): TrainerContent {
  cached ??= buildContent({
    objections: readJson('objections.json'),
    scenarios: readJson('scenarios.json'),
    quiz: readJson('quiz.json'),
    scoring: readJson('scoring.json'),
  });
  return cached;
}
