/**
 * Общие данные календаря для раздела «Календарь», колокольчика напоминаний и карточки проекта.
 * Один запрос на всех; обновление раз в 2 минуты, при возврате на вкладку и после любой правки.
 */
import { useEffect, useSyncExternalStore } from 'react';
import type { ReminderAck, Visit } from '../../../../../packages/shared/calendar.js';
import type { CalendarData, CalendarPartner } from './calendarClient';
import { fetchCalendar } from './calendarClient';

type State = CalendarData & {
  loading: boolean;
  loaded: boolean;
  error: string | null;
  /** Выбранный партнёр у админа StP; пусто — все. */
  orgFilter: string | null;
};

const ORG_KEY = 'mf_calendar_partner_org';

function readStoredOrg(): string | null {
  try {
    return sessionStorage.getItem(ORG_KEY) || null;
  } catch {
    return null;
  }
}

function writeStoredOrg(orgId: string | null) {
  try {
    if (orgId) sessionStorage.setItem(ORG_KEY, orgId);
    else sessionStorage.removeItem(ORG_KEY);
  } catch {
    /* private mode */
  }
}

const EMPTY: State = {
  visits: [],
  people: [],
  acks: [],
  canPlan: false,
  partners: [],
  loading: false,
  loaded: false,
  error: null,
  orgFilter: null,
};
let state: State = { ...EMPTY, orgFilter: typeof sessionStorage !== 'undefined' ? readStoredOrg() : null };
let inflight: Promise<void> | null = null;
/** Номер текущего запроса: ответ со старым номером не перезаписывает свежие данные. */
let generation = 0;
const listeners = new Set<() => void>();
const REFRESH_MS = 2 * 60 * 1000;

function emit(next: State) {
  state = next;
  for (const listener of listeners) listener();
}

/**
 * Загрузить календарь с сервера.
 * force: true — не брать уже идущий запрос (после «Готово»/«Отложить», иначе вернётся ответ без новой отметки).
 */
export function refreshCalendar(opts?: { force?: boolean }): Promise<void> {
  if (inflight && !opts?.force) return inflight;
  const myGeneration = ++generation;
  const orgFilter = state.orgFilter;
  emit({ ...state, loading: true });
  const run = fetchCalendar(orgFilter)
    .then((data) => {
      if (myGeneration !== generation) return;
      emit({
        ...data,
        partners: data.partners || [],
        loading: false,
        loaded: true,
        error: null,
        orgFilter,
      });
    })
    .catch((err: unknown) => {
      if (myGeneration !== generation) return;
      emit({
        ...state,
        loading: false,
        error: err instanceof Error ? err.message : 'Не удалось загрузить календарь',
      });
    })
    .finally(() => {
      if (myGeneration === generation) inflight = null;
    });
  inflight = run;
  return run;
}

/** Мгновенно подставить отметки «готово»/«отложить», пока сервер ещё отвечает. */
export function patchCalendarAcks(acks: ReminderAck[]) {
  emit({ ...state, acks });
}

/** Мгновенно обновить выезды (перенос по календарю), пока сервер отвечает. */
export function patchCalendarVisits(visits: Visit[]) {
  emit({ ...state, visits });
}

/** Фильтр партнёра для админа StP. Запоминается на время сессии вкладки. */
export function setCalendarOrgFilter(orgId: string | null) {
  const next = orgId || null;
  if (next === state.orgFilter) return;
  writeStoredOrg(next);
  emit({ ...state, orgFilter: next });
  void refreshCalendar({ force: true });
}

export function getCalendarOrgFilter(): string | null {
  return state.orgFilter;
}

export function getCalendarPartners(): CalendarPartner[] {
  return state.partners || [];
}

/** Сброс при выходе: следующий пользователь не видит чужие выезды. */
export function resetCalendar() {
  generation += 1;
  inflight = null;
  writeStoredOrg(null);
  emit({ ...EMPTY, orgFilter: null });
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
