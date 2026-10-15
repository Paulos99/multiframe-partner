/**
 * Deep-link: encode RoomAnswers into ?p= so messengers / paste open the same Result.
 */
import type {
  NoiseKindOption,
  PlannedCeilingOption,
  RoomAnswers,
  SessionState,
} from './types';
import { createInitialSession, withDerived } from './session';
import { normalizeRoomWishes } from './wish';

const SHARE_PARAM = 'p';

/** Migrate legacy ceiling ids from older share links. */
function migratePlannedCeiling(raw: unknown): PlannedCeilingOption {
  if (raw === 'stretch_planned' || raw === 'stretch') return 'stretch';
  if (raw === 'ceiling_exists' || raw === 'other_exists') return 'other_exists';
  if (raw === 'gypsum' || raw === 'plaster' || raw === 'unknown') return raw;
  return 'unknown';
}

function migrateNoiseKind(raw: unknown): NoiseKindOption {
  if (raw === 'impact' || raw === 'airborne' || raw === 'mixed' || raw === 'unknown') {
    return raw;
  }
  return 'unknown';
}

function toBase64Url(raw: string): string {
  const b64 = btoa(raw);
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(token: string): string {
  const b64 = token.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  return atob(b64 + pad);
}

function utf8ToBinary(s: string): string {
  return unescape(encodeURIComponent(s));
}

function binaryToUtf8(s: string): string {
  return decodeURIComponent(escape(s));
}

/** Compact JSON of the answer chain (room questionnaire). */
export function encodeRoomAnswers(room: RoomAnswers): string {
  const json = JSON.stringify(room);
  return toBase64Url(utf8ToBinary(json));
}

export function decodeRoomAnswers(token: string): RoomAnswers | null {
  try {
    const json = binaryToUtf8(fromBase64Url(token));
    const data = JSON.parse(json) as Partial<RoomAnswers> & {
      plannedCeiling?: unknown;
      noiseKind?: unknown;
    };
    if (!data || typeof data !== 'object') return null;
    if (typeof data.slabType !== 'string') return null;
    const roomWishes = normalizeRoomWishes(
      (data as { roomWishes?: unknown }).roomWishes,
      (data as { roomWish?: unknown }).roomWish,
    );
    if (roomWishes.length === 0 && typeof (data as { roomWish?: unknown }).roomWish !== 'string') {
      // Allow incomplete legacy payloads only when roomWish was present (handled above).
    }
    const { roomWish: _legacy, ...rest } = data as RoomAnswers & { roomWish?: string };
    return {
      ...(rest as RoomAnswers),
      roomWishes: roomWishes.length > 0 ? roomWishes : ['other'],
      plannedCeiling: migratePlannedCeiling(data.plannedCeiling),
      noiseKind: migrateNoiseKind(data.noiseKind),
    };
  } catch {
    return null;
  }
}

export function buildShareUrl(session: SessionState, origin = window.location.origin): string {
  const basePath = import.meta.env.BASE_URL || '/';
  const url = new URL(basePath, origin);
  url.searchParams.set(SHARE_PARAM, encodeRoomAnswers(session.answers.room));
  return url.toString();
}

/** Marketing line for messenger share sheet / clipboard blurb. */
export const SHARE_MARKETING_BLURB =
  'Слышите соседей сверху? Пройдите бесплатный расчёт MultiFrame за 2 минуты — и узнайте, насколько тише станет комната:';

export function buildShareClipboardText(session: SessionState): string {
  return `${SHARE_MARKETING_BLURB}\n${buildShareUrl(session)}`;
}

export function readShareParamFromLocation(
  search = typeof window !== 'undefined' ? window.location.search : '',
): string | null {
  try {
    const params = new URLSearchParams(search);
    const p = params.get(SHARE_PARAM);
    return p && p.length > 8 ? p : null;
  } catch {
    return null;
  }
}

/** Hydrate a Result session from ?p= payload. */
export function sessionFromShareToken(token: string): SessionState | null {
  const room = decodeRoomAnswers(token);
  if (!room) return null;
  const base = createInitialSession();
  return withDerived({
    ...base,
    step: 'result',
    answers: {
      ...base.answers,
      room,
    },
  });
}

export function tryRestoreSharedSession(): SessionState | null {
  const token = readShareParamFromLocation();
  if (!token) return null;
  return sessionFromShareToken(token);
}
