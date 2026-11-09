/** Даты для сетки календаря: неделя с понедельника, подписи по-русски, время в поясе браузера. */

export type CalendarMode = 'day' | 'week' | 'month';
const DAY = 24 * 60 * 60 * 1000;

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

export function startOfWeek(d: Date): Date {
  const day = startOfDay(d);
  const shift = (day.getDay() + 6) % 7;
  return addDays(day, -shift);
}

export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Дни, которые показывает вид: 1, 7 или 6 недель месяца (с соседними днями по краям). */
export function visibleDays(mode: CalendarMode, cursor: Date): Date[] {
  if (mode === 'day') return [startOfDay(cursor)];
  if (mode === 'week') {
    const start = startOfWeek(cursor);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = startOfWeek(first);
  const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
  const weeks = Math.ceil(((last.getTime() - start.getTime()) / DAY + 1) / 7);
  return Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i));
}

export function shiftCursor(mode: CalendarMode, cursor: Date, dir: -1 | 1): Date {
  if (mode === 'day') return addDays(cursor, dir);
  if (mode === 'week') return addDays(cursor, 7 * dir);
  return new Date(cursor.getFullYear(), cursor.getMonth() + dir, 1);
}

const monthYear = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' });
const dayMonth = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' });
const fullDay = new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
const time = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' });
const shortDate = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' });

export function rangeTitle(mode: CalendarMode, cursor: Date): string {
  if (mode === 'month') {
    const text = monthYear.format(cursor).replace(/\s*г\.?$/, '');
    return text.charAt(0).toUpperCase() + text.slice(1);
  }
  if (mode === 'day') {
    const text = fullDay.format(cursor);
    return text.charAt(0).toUpperCase() + text.slice(1);
  }
  const days = visibleDays('week', cursor);
  const a = days[0];
  const b = days[6];
  if (a.getMonth() === b.getMonth()) return `${a.getDate()}–${dayMonth.format(b)}`;
  return `${dayMonth.format(a)} – ${dayMonth.format(b)}`;
}

export function formatTime(iso: string): string {
  return time.format(new Date(iso));
}

export function formatTimeRange(iso: string, minutes: number): string {
  const start = new Date(iso);
  return `${time.format(start)}–${time.format(new Date(start.getTime() + minutes * 60000))}`;
}

export function formatDayMonth(d: Date | string): string {
  return dayMonth.format(typeof d === 'string' ? new Date(d) : d);
}

export function formatShortDate(iso: string): string {
  return shortDate.format(new Date(iso));
}

export function weekdayShort(d: Date): string {
  return ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'][(d.getDay() + 6) % 7];
}

export function durationLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} мин`;
  return m ? `${h} ч ${m} мин` : `${h} ч`;
}

/** Значения для полей «дата» и «время» из ISO и обратно, в поясе браузера. */
export function toLocalInputs(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

export function fromLocalInputs(date: string, timeText: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(timeText)) return null;
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = timeText.split(':').map(Number);
  const value = new Date(y, mo - 1, d, h, mi);
  return Number.isNaN(value.getTime()) ? null : value.toISOString();
}

/** Ближайшее удобное время для нового выезда: завтра в 10:00. */
export function defaultStart(now = new Date()): string {
  const d = addDays(startOfDay(now), 1);
  d.setHours(10, 0, 0, 0);
  return d.toISOString();
}

/** Ключ дня для группировки и id зоны сброса. */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** Перенос выезда на другой день: часы и минуты сохраняются. */
export function moveStartsAtToDate(startsAt: string, targetDay: Date): string {
  const src = new Date(startsAt);
  const next = new Date(
    targetDay.getFullYear(),
    targetDay.getMonth(),
    targetDay.getDate(),
    src.getHours(),
    src.getMinutes(),
    src.getSeconds(),
    src.getMilliseconds(),
  );
  return next.toISOString();
}

/** Новый выезд на выбранный день (по умолчанию в 10:00 по местному времени). */
export function startAtDay(day: Date, hours = 10, minutes = 0): string {
  const d = startOfDay(day);
  d.setHours(hours, minutes, 0, 0);
  return d.toISOString();
}

