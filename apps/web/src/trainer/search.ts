/**
 * Быстрый поиск по банку возражений и вопросов. Нужен продавцу на объекте: ввёл слово и сразу видит
 * подходящие вопросы с эталонным ответом и объяснением. Поиск ничего не оценивает и в прогресс не пишет.
 */
import type { Objection, QuizQuestion, TrainerContent } from './types';

export type SearchEntry = {
  id: string;
  kind: 'objection' | 'question';
  /** Заголовок карточки: коротко, о чём спрашивает клиент. */
  title: string;
  /** Как клиент спрашивает: первая реплика или текст вопроса. */
  question: string;
  /** Эталонный ответ продавца. */
  answer: string;
  /** Объяснение: главный факт или разбор верного ответа. */
  explanation: string;
  /** Подсказка о типичной ошибке. Только у возражений. */
  mistake?: string;
  /** Тексты для поиска с весом: заголовок и реплики важнее ответа. */
  fields: { text: string; weight: number }[];
};

export type SearchHit = { entry: SearchEntry; score: number };

/** Нижний регистр, «ё» как «е», без кавычек и знаков: «Горение!» и «горение» — одно слово. */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9]+/g, ' ')
    .trim();
}

/** Начало слова, по которому ищем: окончание отбрасывается, чтобы «горение» находило «горения». */
export function stemOf(token: string): string {
  if (token.length >= 7) return token.slice(0, -2);
  if (token.length >= 4) return token.slice(0, -1);
  return token;
}

export function queryTokens(query: string): string[] {
  return normalizeText(query)
    .split(' ')
    .filter(Boolean);
}

const stripTitleQuotes = (s: string) => s.replace(/[«»]/g, '').trim();

function objectionEntry(o: Objection): SearchEntry {
  const title = stripTitleQuotes(o.panel.title);
  return {
    id: o.id,
    kind: 'objection',
    title,
    question: o.clientPhrasing[0] ?? title,
    answer: o.referenceAnswer,
    explanation: o.panel.keyFact,
    mistake: o.commonMistake,
    fields: [
      { text: title, weight: 5 },
      ...o.clientPhrasing.map((text) => ({ text, weight: 4 })),
      { text: o.pushback, weight: 2 },
      { text: o.panel.shortAnswer, weight: 2 },
      { text: o.panel.keyFact, weight: 2 },
      { text: o.referenceAnswer, weight: 1 },
      { text: o.pushbackReferenceAnswer, weight: 1 },
    ],
  };
}

function questionEntry(q: QuizQuestion): SearchEntry {
  const correct = q.options.filter((opt) => q.correctOptionIds.includes(opt.id)).map((opt) => opt.text);
  return {
    id: q.id,
    kind: 'question',
    title: q.question,
    question: q.question,
    answer: correct.join('; '),
    explanation: q.explanation,
    fields: [
      { text: q.question, weight: 5 },
      { text: correct.join(' '), weight: 2 },
      { text: q.explanation, weight: 2 },
    ],
  };
}

/** Банк: возражения и вопросы проверки знаний всех ролей. Скрытые до решения методолога сюда не попадают. */
export function buildSearchEntries(content: Pick<TrainerContent, 'objections' | 'quiz'>): SearchEntry[] {
  return [...content.objections.objections.map(objectionEntry), ...content.quiz.questions.map(questionEntry)];
}

type Prepared = { entry: SearchEntry; fields: { words: string[]; weight: number }[] };
const preparedCache = new WeakMap<object, Prepared[]>();

function prepare(entries: SearchEntry[]): Prepared[] {
  const hit = preparedCache.get(entries);
  if (hit) return hit;
  const made = entries.map((entry) => ({
    entry,
    fields: entry.fields.map((f) => ({ words: normalizeText(f.text).split(' ').filter(Boolean), weight: f.weight })),
  }));
  preparedCache.set(entries, made);
  return made;
}

/**
 * Каждое слово запроса должно начинать какое-то слово карточки (порядок не важен).
 * Чем выше совпавшее поле — заголовок, реплика клиента, — тем выше карточка.
 */
export function searchBank(entries: SearchEntry[], query: string): SearchHit[] {
  const stems = queryTokens(query).map(stemOf);
  if (!stems.length) return [];
  const hits: SearchHit[] = [];
  for (const item of prepare(entries)) {
    let total = 0;
    let ok = true;
    for (const stem of stems) {
      let best = 0;
      for (const field of item.fields) {
        if (field.weight > best && field.words.some((w) => w.startsWith(stem))) best = field.weight;
      }
      if (!best) {
        ok = false;
        break;
      }
      total += best;
    }
    if (ok) hits.push({ entry: item.entry, score: total });
  }
  return hits.sort((a, b) => b.score - a.score || (a.entry.kind === b.entry.kind ? 0 : a.entry.kind === 'objection' ? -1 : 1));
}
