/**
 * Академия: сценарии и попытки. Попытки всегда context=training.
 */

import {
  DEFAULT_SALES_RUBRIC,
  learningAttemptAffectsSalesFunnel,
  scoreWithFalsePromisePenalty,
} from '../../../packages/shared/learning.js';

const BUILTIN_SCENARIOS = [
  {
    id: 'sell_multiframe',
    role: 'any',
    difficulty: 'medium',
    version: '1.0',
    title: 'Продай MultiFrame',
    rubric: DEFAULT_SALES_RUBRIC,
  },
  {
    id: 'objections',
    role: 'any',
    difficulty: 'easy',
    version: '1.0',
    title: 'Возражения и переговоры',
    rubric: DEFAULT_SALES_RUBRIC,
  },
];

function attemptVisible(user, attempt) {
  if (user.role === 'admin') return true;
  if (user.role === 'owner' && user.orgId && attempt.orgId === user.orgId) return true;
  return attempt.userId === user.id;
}

export async function handleAcademy(ctx) {
  const { path, method, requireAuth, json, getBody, savePlatform, uid } = ctx;
  if (!path.includes('/academy')) return null;

  if (method === 'GET' && path.endsWith('/academy/scenarios')) {
    await requireAuth();
    return json(200, { scenarios: BUILTIN_SCENARIOS });
  }

  if (method === 'GET' && path.endsWith('/academy/attempts')) {
    const { platform, user } = await requireAuth();
    const list = (platform.learningAttempts || []).filter((a) => attemptVisible(user, a));
    return json(200, { attempts: list });
  }

  if (method === 'POST' && path.endsWith('/academy/attempts')) {
    const { platform, user } = await requireAuth();
    if (user.role === 'admin' && !user.orgId) {
      /* StP может назначать: нужен targetUserId + orgId */
    }
    const body = getBody();
    const scenarioId = body.scenarioId || 'sell_multiframe';
    const targetUserId = body.userId || user.id;
    const orgId = body.orgId || user.orgId;
    if (!orgId) return json(400, { message: 'Нет организации' });
    if (user.role !== 'admin' && user.role !== 'owner' && targetUserId !== user.id) {
      return json(403, { message: 'Недостаточно прав' });
    }
    const now = new Date().toISOString();
    const attempt = {
      id: uid('la'),
      userId: targetUserId,
      orgId,
      scenarioId,
      status: body.status === 'started' ? 'started' : 'assigned',
      startedAt: body.status === 'started' ? now : null,
      completedAt: null,
      score: null,
      errorTypes: [],
      context: 'training',
    };
    if (learningAttemptAffectsSalesFunnel(attempt)) {
      return json(500, { message: 'Учебная попытка не должна влиять на воронку' });
    }
    platform.learningAttempts = [attempt, ...(platform.learningAttempts || [])];
    await savePlatform(platform);
    return json(200, { attempt });
  }

  const completeMatch = path.match(/\/academy\/attempts\/([^/]+)\/complete$/);
  if (completeMatch && method === 'POST') {
    const attemptId = completeMatch[1];
    const { platform, user } = await requireAuth();
    const idx = (platform.learningAttempts || []).findIndex((a) => a.id === attemptId);
    if (idx < 0) return json(404, { message: 'Попытка не найдена' });
    const existing = platform.learningAttempts[idx];
    if (existing.userId !== user.id && user.role !== 'admin' && user.role !== 'owner') {
      return json(403, { message: 'Недостаточно прав' });
    }
    const body = getBody();
    const baseScore = Number(body.score);
    const score = Number.isFinite(baseScore)
      ? scoreWithFalsePromisePenalty(baseScore, Boolean(body.hasFalsePromise))
      : null;
    const next = {
      ...existing,
      status: 'completed',
      completedAt: new Date().toISOString(),
      startedAt: existing.startedAt || new Date().toISOString(),
      score,
      errorTypes: Array.isArray(body.errorTypes) ? body.errorTypes.map(String) : [],
      context: 'training',
    };
    platform.learningAttempts[idx] = next;
    await savePlatform(platform);
    return json(200, { attempt: next });
  }

  return null;
}
