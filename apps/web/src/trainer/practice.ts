/**
 * Необязательная свободная практика (без оценки): подсказка «это вы сказали» по пунктам
 * requiredPoints. Пункт ищется в обоих ответах вместе. Баллов и нарушений здесь нет.
 */
import type { RequiredPoint } from './types';

export function norm(s: string): string {
  return s.toLowerCase().replace(/ё/g, 'е').replace(/[«»"“”]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function tokens(s: string): string[] {
  return s.match(/[а-яa-z0-9]+/g) ?? [];
}

export function wordCount(text: string): number {
  return tokens(norm(text)).length;
}

const cache = new Map<string, RegExp | null>();
function rx(pattern: string): RegExp | null {
  if (!cache.has(pattern)) {
    try {
      cache.set(pattern, new RegExp(pattern));
    } catch {
      cache.set(pattern, null);
    }
  }
  return cache.get(pattern) ?? null;
}

export function pointSaid(point: RequiredPoint, text: string): boolean {
  const t = norm(text);
  const need = point.minMatches ?? 1;
  return point.anyOf.filter((p) => rx(p)?.test(t)).length >= need;
}

/** Критичные пункты первыми; каждый помечен «сказано / не сказано» по обоим ответам вместе. */
export function sortedPoints(points: RequiredPoint[]): RequiredPoint[] {
  return [...points].sort((a, b) => Number(b.critical) - Number(a.critical));
}

export function checkPractice(points: RequiredPoint[], answers: string[]): { point: RequiredPoint; said: boolean }[] {
  const both = answers.join(' ');
  return sortedPoints(points).map((point) => ({ point, said: pointSaid(point, both) }));
}
