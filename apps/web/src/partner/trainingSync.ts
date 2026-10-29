/**
 * Отправка результатов обучения на сервер: запускается один раз после входа и работает, пока открыт кабинет.
 * Срабатывает после каждого завершённого подхода, при возвращении связи, при возврате на вкладку и раз в минуту.
 * При обрыве связи записи остаются в очереди на устройстве (IndexedDB) и уйдут позже, ничего не теряется.
 */
import { buildMaterialRecord, flushQueue } from '../trainer/sync';
import { newAttemptId } from '../trainer/attempts';
import { trainerStore } from '../trainer/store';
import { isApiError } from './apiClient';
import { sendTrainingSync } from './trainingApi';

const RETRY_MS = 60_000;
const DEBOUNCE_MS = 400;
/** Одно открытие того же материала в пределах получаса считается одним. */
const MATERIAL_THROTTLE_MS = 30 * 60 * 1000;

let active: { userId: string; stop: () => void } | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let running: Promise<void> | null = null;
let blockedUntil = 0;
const lastOpen = new Map<string, number>();

async function runOnce(userId: string): Promise<void> {
  if (Date.now() < blockedUntil) return;
  try {
    const store = await trainerStore();
    await flushQueue(store, userId, sendTrainingSync);
  } catch (err) {
    // «Нет доступа» не лечится повтором; всё остальное (связь, сервер) повторяется.
    if (isApiError(err) && (err.status === 401 || err.status === 403)) blockedUntil = Date.now() + 10 * RETRY_MS;
  }
}

/** Просит отправить очередь «сейчас» (с короткой паузой, чтобы собрать несколько записей в один запрос). */
export function requestTrainingSync(): void {
  const current = active;
  if (!current) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    running = (running ?? Promise.resolve()).then(() => runOnce(current.userId)).finally(() => {
      running = null;
    });
  }, DEBOUNCE_MS);
}

/** Запускает отправку для вошедшего пользователя. Возвращает функцию остановки. */
export function startTrainingSync(userId: string): () => void {
  active?.stop();
  blockedUntil = 0;
  const onOnline = () => requestTrainingSync();
  const onVisible = () => {
    if (document.visibilityState === 'visible') requestTrainingSync();
  };
  window.addEventListener('online', onOnline);
  document.addEventListener('visibilitychange', onVisible);
  const interval = setInterval(requestTrainingSync, RETRY_MS);
  const stop = () => {
    window.removeEventListener('online', onOnline);
    document.removeEventListener('visibilitychange', onVisible);
    clearInterval(interval);
    if (timer) clearTimeout(timer);
    timer = null;
    if (active?.stop === stop) active = null;
  };
  active = { userId, stop };
  requestTrainingSync();
  return stop;
}

/** «Открыл материал»: лёгкая запись в очередь, без ожидания сети. */
export async function trackMaterialOpen(userId: string, materialId: string, title: string, now = new Date()): Promise<void> {
  const key = `${userId}:${materialId}`;
  const prev = lastOpen.get(key) ?? 0;
  if (now.getTime() - prev < MATERIAL_THROTTLE_MS) return;
  lastOpen.set(key, now.getTime());
  try {
    const store = await trainerStore();
    const id = `m-${newAttemptId()}`;
    await store.enqueue({
      id,
      userId,
      queuedAt: now.toISOString(),
      kind: 'material',
      record: buildMaterialRecord(id, materialId, title, now),
    });
    requestTrainingSync();
  } catch {
    // Учёт открытий вспомогательный: сбой хранилища не должен мешать открыть материал.
  }
}
