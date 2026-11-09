/**
 * Общие данные календаря для раздела «Календарь», колокольчика напоминаний и карточки проекта.
 * Один запрос на всех; обновление раз в 2 минуты, при возврате на вкладку и после любой правки.
 */
import { useEffect, useSyncExternalStore } from 'react';
import type { CalendarData } from './calendarClient';
import { fetchCalendar } from './calendarClient';

type State = CalendarData & { loading: boolean; loaded: boolean; error: string | null };

const EMPTY: State = { visits: [], people: [], acks: [], canPlan: false, loading: false, loaded: false, error: null };
let state: State = EMPTY;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();
const REFRESH_MS = 2 * 60 * 1000;

function emit(next: State) {
  state = next;
  for (const listener of listeners) listener();
}

export function refreshCalendar(): Promise<void> {
  if (inflight) return inflight;
  emit({ ...state, loading: true });
  inflight = fetchCalendar()
    .then((data) => emit({ ...data, loading: false, loaded: true, error: null }))
    .catch((err: unknown) => emit({ ...state, loading: false, error: err instanceof Error ? err.message : 'Не удалось загрузить календарь' }))
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Сброс при выходе: следующий пользователь не видит чужие выезды. */
export function resetCalendar() {
  emit(EMPTY);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useCalendar(): State {
  const snapshot = useSyncExternalStore(subscribe, () => state, () => state);
  useEffect(() => {
    if (!state.loaded && !inflight) void refreshCalendar();
    const timer = window.setInterval(() => void refreshCalendar(), REFRESH_MS);
    const onFocus = () => {
      if (document.visibilityState === 'visible') void refreshCalendar();
    };
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, []);
  return snapshot;
}
