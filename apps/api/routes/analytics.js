/**
 * Фильтрация боевой аналитики: учебные/демо события не в dashboard.
 */

import { filterCombatEvents, isCombatAnalyticsEvent } from '../platformMigrate.js';
import { dedupeEventsById } from '../../../packages/shared/events.js';

export { filterCombatEvents, isCombatAnalyticsEvent };

/**
 * Нормализация входящих событий с дедупом по id/eventId и пометкой context.
 */
export function prepareIncomingAnalyticsEvents(rawList, normalizeIncomingEvent) {
  const normalized = (rawList || []).map(normalizeIncomingEvent).filter(Boolean);
  const withContext = normalized.map((e) => ({
    ...e,
    context: e.context || e.object?.context || 'work',
    eventId: e.eventId || e.id,
  }));
  return dedupeEventsById(withContext);
}

/** Dashboard только по боевым событиям. */
export function eventsForDashboard(allEvents) {
  return filterCombatEvents(allEvents || []);
}
