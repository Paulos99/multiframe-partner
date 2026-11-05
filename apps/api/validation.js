/**
 * Проверка тел запросов схемами из packages/shared/schemas.js.
 * Нарушение правила бросает ошибку со статусом и русским текстом: верхний обработчик
 * index.js превращает её в ответ { message } с этим статусом.
 */
import { z } from 'zod';
import { createSchemas, parseWith } from '../../packages/shared/schemas.js';

export const schemas = createSchemas(z);

/** @returns данные после разбора (лишние поля сохраняются) */
export function parseBody(schema, value) {
  const result = parseWith(schema, value);
  if (!result.ok) throw Object.assign(new Error(result.message), { status: result.status });
  return result.data;
}
