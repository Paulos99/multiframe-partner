/**
 * Отправка результатов обучения на сервер для аналитики владельца и администратора.
 *
 * Здесь нет сети: сборка сжатой записи и работа с очередью. Отправляет её `partner/trainingSync.ts`,
 * передавая сюда функцию `send`. Серверу уходит только итог подхода (доля верных с первого раза, баллы по критериям,
 * тип ошибки и тема отказа там, где ошиблись). Набранный свободный текст и сами ответы не уходят никогда.
 *
 * Идентификатор подхода создан при его сохранении, поэтому повторная отправка после обрыва связи дублей не даёт:
 * сервер принимает запись по этому id один раз. Запись убирается из очереди только после подтверждения сервера.
 */
import { isLegacyAttempt } from './engine';
import type { SyncItem, TrainerStore } from './store';
import type { LearningAttempt, TrainerContent } from './types';

export type SyncRecord = Record<string, unknown>;
export type SyncBody = { attempts: SyncRecord[]; materials: SyncRecord[] };
export type SyncAck = { acceptedAttemptIds: string[]; acceptedMaterialIds: string[] };

/** Не больше этого числа записей каждого вида за один запрос (сервер принимает до пятидесяти). */
export const SYNC_BATCH = 50;

/** Сжатая запись подхода. Старые подходы набором текста (до выбора ответа) на сервер не идут: возвращает `null`. */
export function buildAttemptRecord(attempt: LearningAttempt, content: TrainerContent): SyncRecord | null {
  if (isLegacyAttempt(attempt)) return null;
  const objections = new Map(content.objections.objections.map((o) => [o.id, o]));
  const stepObjection = new Map(content.scenarios.scenarios.flatMap((s) => s.steps.map((st) => [st.id, st.objectionId] as const)));
  const topicOf = new Map(content.quiz.questions.map((q) => [q.id, q.topic]));
  const base = {
    id: attempt.id,
    mode: attempt.mode,
    itemIds: attempt.itemIds,
    contentVersion: attempt.contentVersion,
    startedAt: attempt.startedAt,
    finishedAt: attempt.finishedAt,
    total: attempt.total,
    passed: attempt.passed,
  };
  if (attempt.mode === 'quiz') {
    const answers = attempt.quiz ?? [];
    const right = answers.filter((a) => a.correct).length;
    return {
      ...base,
      count: answers.length,
      quizPercent: answers.length ? Math.round((right / answers.length) * 1000) / 10 : 0,
      quizMisses: answers.filter((a) => !a.correct).map((a) => ({ questionId: a.questionId, topic: topicOf.get(a.questionId) ?? null })),
    };
  }
  const picks = attempt.picks ?? [];
  const criteria: Record<string, number | null> = {};
  for (const [id, value] of Object.entries(attempt.choiceScores ?? {})) criteria[id] = typeof value === 'number' ? value : null;
  return {
    ...base,
    scheme: 2,
    count: picks.length,
    firstTryCorrect: attempt.firstTryCorrect ?? 0,
    criteria,
    misses: picks
      .filter((p) => !p.firstTry)
      .map((p) => {
        const objectionId = p.objectionId ?? (p.stepId ? stepObjection.get(p.stepId) : undefined) ?? null;
        return {
          objectionId,
          reasonKey: (objectionId && objections.get(objectionId)?.refusalReasonKey) || null,
          errorType: p.firstError?.errorType ?? null,
          violates: p.firstError?.violates ?? null,
        };
      }),
  };
}

/** Запись «открыл материал». Идентификатор создаёт кабинет (случайный), он же защищает от дублей при повторной отправке. */
export function buildMaterialRecord(id: string, materialId: string, title: string, at: Date): SyncRecord {
  return { id, materialId, title, at: at.toISOString() };
}

/**
 * Достраивает записи у элементов очереди, созданных до появления отправки (или когда содержимое ещё не было загружено).
 * Подходы, которые отправлять не нужно (старые), из очереди убираются.
 */
export async function backfillQueue(store: TrainerStore, userId: string, content: TrainerContent): Promise<void> {
  const todo = (await store.queued(userId)).filter((q) => q.kind !== 'material' && q.record === undefined);
  if (!todo.length) return;
  const attempts = new Map((await store.attempts(userId)).map((a) => [a.id, a]));
  for (const item of todo) {
    const attempt = attempts.get(item.id);
    await store.setQueueRecord(item.id, attempt ? buildAttemptRecord(attempt, content) : null);
  }
}

export type FlushResult = { sent: number; left: number };

/**
 * Один заход отправки: берёт готовые записи из очереди, отправляет пачкой, убирает подтверждённые.
 * Если сервер недоступен, `send` бросает ошибку, очередь остаётся целой, повтор будет при следующем заходе.
 */
export async function flushQueue(store: TrainerStore, userId: string, send: (body: SyncBody) => Promise<SyncAck>): Promise<FlushResult> {
  let sent = 0;
  for (let round = 0; round < 20; round += 1) {
    const ready = (await store.queued(userId)).filter((q): q is SyncItem & { record: SyncRecord } => Boolean(q.record));
    if (!ready.length) return { sent, left: 0 };
    ready.sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
    const attempts = ready.filter((q) => q.kind !== 'material').slice(0, SYNC_BATCH);
    const materials = ready.filter((q) => q.kind === 'material').slice(0, SYNC_BATCH);
    const ack = await send({ attempts: attempts.map((q) => q.record), materials: materials.map((q) => q.record) });
    const accepted = new Set([...ack.acceptedAttemptIds, ...ack.acceptedMaterialIds]);
    // Запись, которую сервер отклонил как негодную, повторять бессмысленно: убираем и её.
    const taken = [...attempts, ...materials].map((q) => q.id);
    const stuck = taken.filter((id) => !accepted.has(id));
    await store.dequeue(taken);
    sent += taken.length - stuck.length;
    if (attempts.length < SYNC_BATCH && materials.length < SYNC_BATCH) {
      return { sent, left: (await store.queued(userId)).filter((q) => q.record).length };
    }
  }
  return { sent, left: (await store.queued(userId)).filter((q) => q.record).length };
}
