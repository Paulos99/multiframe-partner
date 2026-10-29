/**
 * Данные пользователя на устройстве: база `training` (IndexedDB), как в ТЗ.
 * Привязаны к userId: другой пользователь на том же устройстве чужого прогресса не видит.
 * Если IndexedDB недоступна (приватный режим, тесты), работает хранилище в памяти.
 * Очередь отправки хранится здесь же: её читает отправка на сервер (`sync.ts`), успешно принятые записи из очереди убираются.
 */
import type { LearningAttempt, ReviewCard, ScenarioDraft, TrainerSettings } from './types';

/**
 * Запись очереди отправки. `record` — сжатая запись для сервера (подход или открытие материала), собранная при сохранении.
 * У старых элементов её нет: она достраивается при следующем запуске тренажёра. `null` — отправлять нечего.
 */
export type SyncItem = { id: string; userId: string; queuedAt: string; kind?: 'attempt' | 'material'; record?: Record<string, unknown> | null };

export interface TrainerStore {
  readonly kind: 'indexeddb' | 'memory';
  attempts(userId: string): Promise<LearningAttempt[]>;
  addAttempt(attempt: LearningAttempt, record?: Record<string, unknown> | null): Promise<void>;
  /** Кладёт в очередь запись не из тренажёра, например «открыл материал». */
  enqueue(item: SyncItem): Promise<void>;
  queued(userId: string): Promise<SyncItem[]>;
  /** Достраивает запись у старого элемента очереди; `null` убирает его из очереди. */
  setQueueRecord(id: string, record: Record<string, unknown> | null): Promise<void>;
  dequeue(ids: string[]): Promise<void>;
  cards(userId: string): Promise<ReviewCard[]>;
  putCards(cards: ReviewCard[]): Promise<void>;
  settings(userId: string): Promise<TrainerSettings | null>;
  putSettings(settings: TrainerSettings): Promise<void>;
  draft(userId: string, scenarioId: string): Promise<ScenarioDraft | null>;
  putDraft(draft: ScenarioDraft): Promise<void>;
  deleteDraft(userId: string, scenarioId: string): Promise<void>;
  drafts(userId: string): Promise<ScenarioDraft[]>;
  pendingSync(userId: string): Promise<number>;
  /** Удаляет только данные этого пользователя на этом устройстве. */
  reset(userId: string): Promise<void>;
}

export const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const draftKey = (userId: string, scenarioId: string) => `${userId}:${scenarioId}`;
const attemptItem = (attempt: LearningAttempt, record?: Record<string, unknown> | null): SyncItem => ({
  id: attempt.id,
  userId: attempt.userId,
  queuedAt: attempt.finishedAt,
  kind: 'attempt',
  ...(record !== undefined ? { record } : {}),
});
const fresh = (d: ScenarioDraft | null | undefined, now = Date.now()) => (d && Array.isArray(d.picks) && now - new Date(d.savedAt).getTime() <= DRAFT_TTL_MS ? d : null);

export class MemoryStore implements TrainerStore {
  readonly kind = 'memory' as const;
  private a = new Map<string, LearningAttempt>();
  private c = new Map<string, ReviewCard>();
  private s = new Map<string, TrainerSettings>();
  private d = new Map<string, ScenarioDraft>();
  private q = new Map<string, SyncItem>();
  async attempts(userId: string) {
    return [...this.a.values()].filter((x) => x.userId === userId);
  }
  async addAttempt(attempt: LearningAttempt, record?: Record<string, unknown> | null) {
    this.a.set(attempt.id, attempt);
    this.q.set(attempt.id, attemptItem(attempt, record));
  }
  async enqueue(item: SyncItem) {
    this.q.set(item.id, item);
  }
  async queued(userId: string) {
    return [...this.q.values()].filter((x) => x.userId === userId);
  }
  async setQueueRecord(id: string, record: Record<string, unknown> | null) {
    const item = this.q.get(id);
    if (!item) return;
    if (record === null) this.q.delete(id);
    else this.q.set(id, { ...item, record });
  }
  async dequeue(ids: string[]) {
    for (const id of ids) this.q.delete(id);
  }
  async cards(userId: string) {
    return [...this.c.values()].filter((x) => x.userId === userId);
  }
  async putCards(cards: ReviewCard[]) {
    for (const card of cards) this.c.set(card.key, card);
  }
  async settings(userId: string) {
    return this.s.get(userId) ?? null;
  }
  async putSettings(settings: TrainerSettings) {
    this.s.set(settings.userId, settings);
  }
  async draft(userId: string, scenarioId: string) {
    return fresh(this.d.get(draftKey(userId, scenarioId)));
  }
  async putDraft(draft: ScenarioDraft) {
    this.d.set(draft.key, draft);
  }
  async deleteDraft(userId: string, scenarioId: string) {
    this.d.delete(draftKey(userId, scenarioId));
  }
  async drafts(userId: string) {
    return [...this.d.values()].filter((x) => x.userId === userId && fresh(x));
  }
  async pendingSync(userId: string) {
    return [...this.q.values()].filter((x) => x.userId === userId && x.kind !== 'material').length;
  }
  async reset(userId: string) {
    for (const [k, v] of this.a) if (v.userId === userId) this.a.delete(k);
    for (const [k, v] of this.c) if (v.userId === userId) this.c.delete(k);
    for (const [k, v] of this.d) if (v.userId === userId) this.d.delete(k);
    for (const [k, v] of this.q) if (v.userId === userId) this.q.delete(k);
    this.s.delete(userId);
  }
}

const DB_NAME = 'training';
const DB_VERSION = 1;

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export class IdbStore implements TrainerStore {
  readonly kind = 'indexeddb' as const;
  private readonly db: IDBDatabase;
  private constructor(db: IDBDatabase) {
    this.db = db;
  }

  static open(): Promise<IdbStore> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        const attempts = db.createObjectStore('attempts', { keyPath: 'id' });
        attempts.createIndex('userId', 'userId');
        db.createObjectStore('cards', { keyPath: 'key' }).createIndex('userId', 'userId');
        db.createObjectStore('settings', { keyPath: 'userId' });
        db.createObjectStore('drafts', { keyPath: 'key' }).createIndex('userId', 'userId');
        db.createObjectStore('syncQueue', { keyPath: 'id' }).createIndex('userId', 'userId');
      };
      req.onsuccess = () => resolve(new IdbStore(req.result));
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('blocked'));
    });
  }

  private store(name: string, mode: IDBTransactionMode = 'readonly') {
    return this.db.transaction(name, mode).objectStore(name);
  }
  private byUser<T>(name: string, userId: string): Promise<T[]> {
    return wrap(this.store(name).index('userId').getAll(userId) as IDBRequest<T[]>);
  }
  attempts(userId: string) {
    return this.byUser<LearningAttempt>('attempts', userId);
  }
  private done(tx: IDBTransaction) {
    return new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }
  async addAttempt(attempt: LearningAttempt, record?: Record<string, unknown> | null) {
    const tx = this.db.transaction(['attempts', 'syncQueue'], 'readwrite');
    tx.objectStore('attempts').put(attempt);
    tx.objectStore('syncQueue').put(attemptItem(attempt, record));
    await this.done(tx);
  }
  async enqueue(item: SyncItem) {
    await wrap(this.store('syncQueue', 'readwrite').put(item));
  }
  queued(userId: string) {
    return this.byUser<SyncItem>('syncQueue', userId);
  }
  async setQueueRecord(id: string, record: Record<string, unknown> | null) {
    const tx = this.db.transaction('syncQueue', 'readwrite');
    const os = tx.objectStore('syncQueue');
    const req = os.get(id);
    req.onsuccess = () => {
      const item = req.result as SyncItem | undefined;
      if (!item) return;
      if (record === null) os.delete(id);
      else os.put({ ...item, record });
    };
    await this.done(tx);
  }
  async dequeue(ids: string[]) {
    if (!ids.length) return;
    const tx = this.db.transaction('syncQueue', 'readwrite');
    for (const id of ids) tx.objectStore('syncQueue').delete(id);
    await this.done(tx);
  }
  cards(userId: string) {
    return this.byUser<ReviewCard>('cards', userId);
  }
  async putCards(cards: ReviewCard[]) {
    if (!cards.length) return;
    const tx = this.db.transaction('cards', 'readwrite');
    for (const c of cards) tx.objectStore('cards').put(c);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
  async settings(userId: string) {
    return ((await wrap(this.store('settings').get(userId))) as TrainerSettings | undefined) ?? null;
  }
  async putSettings(settings: TrainerSettings) {
    await wrap(this.store('settings', 'readwrite').put(settings));
  }
  async draft(userId: string, scenarioId: string) {
    return fresh((await wrap(this.store('drafts').get(draftKey(userId, scenarioId)))) as ScenarioDraft | undefined);
  }
  async putDraft(draft: ScenarioDraft) {
    await wrap(this.store('drafts', 'readwrite').put(draft));
  }
  async deleteDraft(userId: string, scenarioId: string) {
    await wrap(this.store('drafts', 'readwrite').delete(draftKey(userId, scenarioId)));
  }
  async drafts(userId: string) {
    return (await this.byUser<ScenarioDraft>('drafts', userId)).filter((d) => fresh(d));
  }
  async pendingSync(userId: string) {
    return (await this.queued(userId)).filter((x) => x.kind !== 'material').length;
  }
  async reset(userId: string) {
    const tx = this.db.transaction(['attempts', 'cards', 'settings', 'drafts', 'syncQueue'], 'readwrite');
    for (const name of ['attempts', 'cards', 'drafts', 'syncQueue']) {
      const os = tx.objectStore(name);
      const cursor = os.index('userId').openKeyCursor(IDBKeyRange.only(userId));
      cursor.onsuccess = () => {
        const c = cursor.result;
        if (c) {
          os.delete(c.primaryKey);
          c.continue();
        }
      };
    }
    tx.objectStore('settings').delete(userId);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }
}

let shared: Promise<TrainerStore> | null = null;
export function trainerStore(): Promise<TrainerStore> {
  shared ??= (typeof indexedDB === 'undefined' ? Promise.resolve(new MemoryStore() as TrainerStore) : IdbStore.open().catch(() => new MemoryStore() as TrainerStore));
  return shared;
}
