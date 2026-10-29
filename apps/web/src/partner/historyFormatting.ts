import type { JobObjectHistoryEntry } from '../../../../packages/shared/partner';
import { REFUSAL_REASONS, refusalReasonPlain } from '../../../../packages/shared/refusal.js';

export type HistoryPerson = { id: string; displayName: string };
const statuses: Record<string, string> = {
  draft: 'Черновик', measured: 'Замер', quote_sent: 'КП отправлено',
  install: 'Монтаж', closed: 'Завершён',
};

export function describeHistory(entry: JobObjectHistoryEntry, people: HistoryPerson[]) {
  const detail = entry.detail?.trim() || '';
  switch (entry.action) {
    case 'create': return 'Комната создана';
    case 'update': return 'Данные комнаты обновлены';
    case 'calc_pdf': return 'Смета сохранена';
    case 'profile_pdf': return 'Профиль сохранён';
    case 'conflict_kept_server': return 'Сохранена более свежая версия комнаты';
    case 'refusal': {
      const known = REFUSAL_REASONS.some(item => item.key === detail);
      return known ? `Отказ: ${refusalReasonPlain(detail)}` : 'Отказ клиента';
    }
    case 'assign': {
      if (!detail || detail === '—') return 'Назначение исполнителя снято';
      const name = people.find(person => person.id === detail)?.displayName;
      return name ? `Назначен исполнитель: ${name}` : 'Назначен исполнитель';
    }
    case 'status': {
      const [from, to] = detail.split('→').map(value => value.trim());
      const before = statuses[from];
      const after = statuses[to || from];
      if (before && to && after) return `Статус: ${before} → ${after}`;
      return after ? `Статус: ${after}` : 'Статус комнаты изменён';
    }
    default: return 'Комната обновлена';
  }
}

export function historyAuthor(entry: JobObjectHistoryEntry, people: HistoryPerson[]) {
  const stored = entry.authorName?.trim();
  if (stored) return stored;
  const name = people.find(person => person.id === entry.userId)?.displayName;
  if (name) return name;
  if (entry.login === 'system') return 'Система';
  return entry.login?.trim() || 'Сотрудник';
}

const MONTHS = ['янв.', 'февр.', 'мар.', 'апр.', 'мая', 'июн.', 'июл.', 'авг.', 'сент.', 'окт.', 'нояб.', 'дек.'];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Часы зрителя: локальные getHours браузера, без второго сдвига пояса. */
export function formatHistoryTime(value: string, timeZone?: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  if (timeZone) {
    return new Intl.DateTimeFormat('ru-RU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone,
    }).format(date);
  }
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}, ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

/** «26.10, 17:42» — локальные часы браузера. */
export function formatDocStamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${pad2(date.getDate())}.${pad2(date.getMonth() + 1)}, ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export function sortedHistory(entries: JobObjectHistoryEntry[]) {
  const timestamp = (value: string) => {
    const time = Date.parse(value);
    return Number.isNaN(time) ? -Infinity : time;
  };
  return [...entries].sort((a, b) => timestamp(b.at) - timestamp(a.at));
}
