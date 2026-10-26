import { describeHistory, formatHistoryTime, historyAuthor, sortedHistory } from './historyFormatting.ts';

function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
const base = { at: '2026-10-18T09:00:00Z', userId: 'u1', login: 'manager', action: 'status' };
const people = [{ id: 'u1', displayName: 'Анна' }];
equal(describeHistory({ ...base, detail: 'measured→quote_sent' }, people), 'Статус: Замер → КП отправлено');
equal(describeHistory({ ...base, detail: 'closed' }, people), 'Статус: Закрыто');
equal(describeHistory({ ...base, detail: 'unknown→unknown' }, people), 'Статус комнаты изменён');
equal(describeHistory({ ...base, action: 'assign', detail: 'u1' }, people), 'Назначен исполнитель: Анна');
equal(describeHistory({ ...base, action: 'assign', detail: '—' }, people), 'Назначение исполнителя снято');
equal(describeHistory({ ...base, action: 'assign', detail: 'unknown-id' }, people), 'Назначен исполнитель');
equal(describeHistory({ ...base, action: 'new-event', detail: '{"price":12345}' }, people), 'Комната обновлена');
equal(describeHistory({ ...base, action: 'calc_pdf', detail: 'private-estimate.pdf' }, people), 'Смета сохранена');
equal(describeHistory({ ...base, action: 'profile_pdf', detail: 'profile.pdf' }, people), 'Профиль сохранён');
equal(historyAuthor(base, people), 'Анна');
equal(historyAuthor({ ...base, authorName: 'Владелец · Потолки Столицы' }, [{ id: 'u1', displayName: 'Монтажник · Потолки Столицы' }]), 'Владелец · Потолки Столицы');
equal(historyAuthor({ ...base, userId: null, login: 'system' }, people), 'Система');
equal(historyAuthor({ ...base, userId: null, login: '' }, people), 'Сотрудник');
if (!formatHistoryTime('2026-10-18T07:00:00.000Z', 'Europe/Moscow').includes('10:00')) {
  throw new Error(formatHistoryTime('2026-10-18T07:00:00.000Z', 'Europe/Moscow'));
}
if (!formatHistoryTime('2026-10-18T00:00:00', 'Asia/Vladivostok').includes('10:00')) {
  throw new Error(formatHistoryTime('2026-10-18T00:00:00', 'Asia/Vladivostok'));
}
const input = [{ ...base, at: 'invalid' }, base, { ...base, at: '2026-10-19T09:00:00Z' }];
equal(sortedHistory(input).map(entry => entry.at), ['2026-10-19T09:00:00Z', base.at, 'invalid']);
equal(input[0].at, 'invalid');
console.log('Object history: 15 checks passed');
