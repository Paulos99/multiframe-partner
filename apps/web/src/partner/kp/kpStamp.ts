/** Отбор комнат для КП и отпечаток их данных. Без зависимостей от Проблемомера: нужен доске и демо-сиду. */
import type { JobObject } from '../../../../../packages/shared/partner';

/** Комнаты в КП: с расчётом калькулятора, по порядку создания. */
export function kpRooms(rooms: JobObject[]): JobObject[] {
  return [...rooms]
    .filter((r) => (r.estimate?.panels ?? 0) > 0)
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : 1));
}

/** Отпечаток данных, из которых собрано КП. Поменялись площадь, смета или ответы — КП устарело. */
export function kpStamp(rooms: JobObject[]): string {
  const src = kpRooms(rooms)
    .map((r) => {
      const e = r.estimate;
      const a = r.room?.answers ? JSON.stringify(r.room.answers, Object.keys(r.room.answers).sort()) : '';
      return [r.id, r.room?.areaM2 ?? '', e?.panels ?? '', e?.dowels ?? '', e?.totalCost ?? '', r.roomName ?? '', a].join('|');
    })
    .join('#');
  let h = 2166136261;
  for (let i = 0; i < src.length; i++) {
    h ^= src.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `kp1-${(h >>> 0).toString(36)}-${kpRooms(rooms).length}`;
}

