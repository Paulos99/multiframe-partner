import type { JobObjectHistoryEntry } from '../../../../packages/shared/partner';

export type HistoryPerson = { id: string; displayName: string };
const statuses: Record<string, string> = {
  draft: 'Черновик', measured: 'Замер', quote_sent: 'КП отправлено',
  install: 'Монтаж', closed: 'Закрыто',
};

export function describeHistory(entry: JobObjectHistoryEntry, people: HistoryPerson[]) {
  const detail = entry.detail?.trim() || '';
  switch (entry.action) {
    case 'create': return 'Комната создана';
    case 'update': return 'Данные комнаты обновлены';
    case 'calc_pdf': return 'Смета сохранена';
    case 'profile_pdf': return 'Профиль сохранён';
    case 'conflict_kept_server': return 'Сохранена более свежая версия комнаты';
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
  const name = people.find(person => person.id === entry.userId)?.displayName;
  if (name) return name;
  if (entry.login === 'system') return 'Система';
  return entry.login?.trim() || 'Сотрудник';
}

export function sortedHistory(entries: JobObjectHistoryEntry[]) {
  const timestamp = (value: string) => {
    const time = Date.parse(value);
    return Number.isNaN(time) ? -Infinity : time;
  };
  return [...entries].sort((a, b) => timestamp(b.at) - timestamp(a.at));
}
