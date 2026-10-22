/**
 * Постепенная миграция platform JSON без удаления JobObject / Project.
 * Старые данные читаются; новые коллекции появляются пустыми при отсутствии.
 */

import { derivedAssignedTo } from '../../packages/shared/deal.js';

const COLLECTIONS = [
  'deals',
  'quoteRevisions',
  'learningScenarios',
  'learningAttempts',
  'supportCases',
  'interventions',
];

function emptyAssignments() {
  return { salesUserId: null, measurerUserId: null, crewUserId: null };
}

/**
 * Нормализует платформу на чтении. Идемпотентно.
 * @param {Record<string, unknown>} platform
 */
export function migratePlatform(platform) {
  if (!platform || typeof platform !== 'object') return platform;
  const next = platform;

  for (const key of COLLECTIONS) {
    if (!Array.isArray(next[key])) next[key] = [];
  }
  // projects намеренно не создаём пустым массивом: отсутствие ключа = легаси без проектов.
  if (Array.isArray(next.objects)) {
    next.objects = next.objects.map((obj) => migrateObject(obj));
  }
  next.version = Math.max(Number(next.version) || 2, 3);
  return next;
}

function migrateObject(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const assignments = normalizeAssignments(obj.assignments, obj.assignedTo);
  const assignedTo =
    obj.assignedTo != null && String(obj.assignedTo).trim()
      ? obj.assignedTo
      : derivedAssignedTo(assignments);
  return {
    ...obj,
    assignments,
    assignedTo,
  };
}

function normalizeAssignments(raw, legacyAssignedTo) {
  const base = emptyAssignments();
  if (raw && typeof raw === 'object') {
    base.salesUserId = raw.salesUserId || null;
    base.measurerUserId = raw.measurerUserId || null;
    base.crewUserId = raw.crewUserId || null;
  } else if (legacyAssignedTo) {
    // Старый один assignedTo — кладём в measurer (исторически «исполнитель»).
    base.measurerUserId = legacyAssignedTo;
  }
  return base;
}

/** События с context=training|demo не попадают в боевой dashboard. */
export function isCombatAnalyticsEvent(event) {
  const ctx = event?.context || event?.object?.context || 'work';
  if (ctx === 'training' || ctx === 'demo') return false;
  const name = String(event?.name || event?.action || '');
  if (name.startsWith('training_')) return false;
  return true;
}

export function filterCombatEvents(events) {
  return (events || []).filter(isCombatAnalyticsEvent);
}
