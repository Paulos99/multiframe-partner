import { describeHistory, historyAuthor, sortedHistory } from './historyFormatting.ts';

function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
const base = { at: '2026-10-18T09:00:00Z', userId: 'u1', login: 'manager', action: 'status' };
const people = [{ id: 'u1', displayName: 'Анна' }];
equal(describeHistory({ ...base, detail: 'measured→quote_sent' }, people), 'Статус: Замер → КП отправлено');
equal(describeHistory({ ...base, detail: 'closed' }, people), 'Статус: Закрыто');
equal(describeHistory({ ...base, detail: 'unknown→unknown' }, people), 'Статус объекта изменён');
equal(describeHistory({ ...base, action: 'assign', detail: 'u1' }, people), 'Назначен исполнитель: Анна');
equal(describeHistory({ ...base, action: 'assign', detail: '—' }, people), 'Назначение исполнителя снято');
equal(describeHistory({ ...base, action: 'assign', detail: 'unknown-id' }, people), 'Назначен исполнитель');
equal(describeHistory({ ...base, action: 'new-event', detail: '{"price":12345}' }, people), 'Объект обновлён');
equal(describeHistory({ ...base, action: 'calc_pdf', detail: 'private-estimate.pdf' }, people), 'Смета сохранена');
equal(describeHistory({ ...base, action: 'profile_pdf', detail: 'profile.pdf' }, people), 'Профиль сохранён');
equal(historyAuthor(base, people), 'Анна');
equal(historyAuthor({ ...base, userId: null, login: 'system' }, people), 'Система');
equal(historyAuthor({ ...base, userId: null, login: '' }, people), 'Сотрудник');
const input = [{ ...base, at: 'invalid' }, base, { ...base, at: '2026-10-19T09:00:00Z' }];
equal(sortedHistory(input).map(entry => entry.at), ['2026-10-19T09:00:00Z', base.at, 'invalid']);
equal(input[0].at, 'invalid');
console.log('Object history: 13 checks passed');
