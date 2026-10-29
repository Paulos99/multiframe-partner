import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { loadTrainerContent } from './content';
import { defaultSettings, type Built, type Who } from './attempts';
import { isLegacyAttempt, isLegacyCard } from './engine';
import { trainerStore, type TrainerStore } from './store';
import { backfillQueue, buildAttemptRecord } from './sync';
import type { LearningAttempt, ReviewCard, ScenarioDraft, TrainerContent, TrainerRole, TrainerSettings } from './types';

export type TrainerApi = {
  content: TrainerContent;
  store: TrainerStore;
  who: Who;
  role: TrainerRole;
  settings: TrainerSettings;
  attempts: LearningAttempt[];
  cards: ReviewCard[];
  drafts: ScenarioDraft[];
  pending: number;
  /** Старые попытки набором текста: хранятся, но в итоги не входят. */
  legacyCount: number;
  saveSettings: (next: Partial<TrainerSettings>) => Promise<void>;
  commit: (built: Built) => Promise<void>;
  resetAll: () => Promise<void>;
  refresh: () => Promise<void>;
};

const Ctx = createContext<TrainerApi | null>(null);

export function useTrainer(): TrainerApi {
  const api = useContext(Ctx);
  if (!api) throw new Error('useTrainer вне TrainerProvider');
  return api;
}

type Loaded = {
  store: TrainerStore;
  content: TrainerContent;
};

/** Загружает содержимое и данные пользователя. Показывает состояния «загрузка» и «ошибка». */
export function TrainerProvider({
  userId,
  partnerId,
  role,
  loading,
  failed,
  onQueued,
  children,
}: {
  userId: string;
  partnerId: string | null;
  role: TrainerRole;
  loading: ReactNode;
  failed: (retry: () => void) => ReactNode;
  /** Вызывается, когда в очереди отправки появились новые записи: кабинет пробует отправить их на сервер. */
  onQueued?: () => void;
  children: ReactNode;
}) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [data, setData] = useState<{
    settings: TrainerSettings;
    attempts: LearningAttempt[];
    cards: ReviewCard[];
    drafts: ScenarioDraft[];
    pending: number;
    legacyCount: number;
  } | null>(null);

  useEffect(() => {
    let alive = true;
    setError(false);
    Promise.all([loadTrainerContent(), trainerStore()])
      .then(([content, store]) => {
        if (alive) setLoaded({ content, store });
      })
      .catch(() => {
        if (alive) setError(true);
      });
    return () => {
      alive = false;
    };
  }, [attempt]);

  const read = useCallback(
    async (l: Loaded) => {
      const [settings, attempts, cards, drafts, pending] = await Promise.all([
        l.store.settings(userId),
        l.store.attempts(userId),
        l.store.cards(userId),
        l.store.drafts(userId),
        l.store.pendingSync(userId),
      ]);
      setData({
        settings: settings ?? defaultSettings(userId, l.content),
        attempts: attempts.filter((a) => !isLegacyAttempt(a)),
        cards: cards.filter((c) => !isLegacyCard(c)),
        drafts,
        pending,
        legacyCount: attempts.filter(isLegacyAttempt).length,
      });
    },
    [userId],
  );

  useEffect(() => {
    if (!loaded) return;
    // Элементы очереди из прежних версий получают сжатую запись, когда содержимое загружено.
    backfillQueue(loaded.store, userId, loaded.content)
      .then(() => onQueued?.())
      .catch(() => undefined);
  }, [loaded, userId]);

  useEffect(() => {
    if (!loaded) return;
    let alive = true;
    setData(null);
    read(loaded).catch(() => {
      if (alive) setError(true);
    });
    return () => {
      alive = false;
    };
  }, [loaded, read]);

  const api = useMemo<TrainerApi | null>(() => {
    if (!loaded || !data) return null;
    const { store, content } = loaded;
    const who: Who = { userId, partnerId, role };
    return {
      content,
      store,
      who,
      role,
      ...data,
      saveSettings: async (next) => {
        const merged = { ...data.settings, ...next, userId };
        await store.putSettings(merged);
        await read(loaded);
      },
      commit: async (built) => {
        await store.addAttempt(built.attempt, buildAttemptRecord(built.attempt, content));
        await store.putCards(built.cards);
        await read(loaded);
        onQueued?.();
      },
      resetAll: async () => {
        await store.reset(userId);
        await read(loaded);
      },
      refresh: () => read(loaded),
    };
  }, [loaded, data, userId, partnerId, role, read, onQueued]);

  if (error) return <>{failed(() => setAttempt((n) => n + 1))}</>;
  if (!api) return <>{loading}</>;
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
