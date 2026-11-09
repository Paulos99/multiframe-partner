import { describe, expect, it } from 'vitest';
import { durationLabel, fromLocalInputs, rangeTitle, shiftCursor, startOfWeek, toLocalInputs, visibleDays } from './calendarView';

describe('calendarView', () => {
  it('неделя начинается с понедельника', () => {
    const monday = startOfWeek(new Date(2026, 10, 11));
    expect(monday.getDay()).toBe(1);
    expect(monday.getDate()).toBe(9);
    expect(startOfWeek(new Date(2026, 10, 15)).getDate()).toBe(9);
  });
  it('месяц — целые недели с соседними днями', () => {
    const days = visibleDays('month', new Date(2026, 10, 9));
    expect(days.length % 7).toBe(0);
    expect(days[0].getDay()).toBe(1);
    expect(days.some((d) => d.getMonth() === 10 && d.getDate() === 30)).toBe(true);
  });
  it('подписи и сдвиг', () => {
    expect(rangeTitle('week', new Date(2026, 10, 11))).toBe('9–15 ноября');
    expect(rangeTitle('month', new Date(2026, 10, 11))).toBe('Ноябрь 2026');
    expect(shiftCursor('month', new Date(2026, 10, 30), 1).getMonth()).toBe(11);
    expect(durationLabel(90)).toBe('1 ч 30 мин');
    expect(durationLabel(45)).toBe('45 мин');
  });
  it('поля даты и времени туда и обратно', () => {
    const iso = fromLocalInputs('2026-11-10', '10:30')!;
    expect(toLocalInputs(iso)).toEqual({ date: '2026-11-10', time: '10:30' });
    expect(fromLocalInputs('10.11.2026', '10:30')).toBeNull();
  });
});
