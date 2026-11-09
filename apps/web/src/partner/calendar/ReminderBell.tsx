import { useEffect, useMemo, useRef, useState } from 'react';
import { buildReminders, type Reminder } from '../../../../../packages/shared/calendar.js';
import { BellIcon } from '../../icons';
import { usePartner } from '../PartnerContext';
import { ackReminder } from './calendarClient';
import { refreshCalendar, useCalendar } from './calendarStore';
import { formatShortDate, formatTime } from './calendarView';
import styles from './Calendar.module.css';

/**
 * Колокольчик в шапке: напоминания о ближайших замерах и монтажах, КП без ответа,
 * просроченных этапах и замерах без результата. «Готово» убирает напоминание,
 * «Отложить» прячет его на час или до завтрашнего утра. Отметки хранятся на сервере у каждого свои.
 */
export function ReminderBell({ onOpen }: { onOpen: (reminder: Reminder) => void }) {
  const api = usePartner();
  const calendar = useCalendar();
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const reminders = useMemo(() => {
    if (!api.user) return [];
    return buildReminders({
      visits: calendar.visits,
      rooms: api.objects,
      projects: api.projects,
      user: { id: api.user.id, role: api.user.role },
      acks: calendar.acks,
      now,
      tzOffsetMin: new Date(now).getTimezoneOffset(),
    }).filter((r) => !hidden.has(r.key));
  }, [api.user, api.objects, api.projects, calendar.visits, calendar.acks, now, hidden]);

  async function act(reminder: Reminder, action: 'done' | 'hour' | 'tomorrow') {
    setHidden((prev) => new Set(prev).add(reminder.key));
    let until: string | undefined;
    if (action === 'hour') until = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    if (action === 'tomorrow') {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
      until = d.toISOString();
    }
    try {
      await ackReminder(reminder.key, action === 'done' ? 'done' : 'snooze', until);
      await refreshCalendar();
    } catch {
      // Сбой связи: напоминание вернётся при следующем обновлении.
    } finally {
      setHidden((prev) => {
        const next = new Set(prev);
        next.delete(reminder.key);
        return next;
      });
    }
  }

  const urgent = reminders.some((r) => r.tone === 'urgent');
  return (
    <div className={styles.bellWrap} ref={wrap}>
      <button
        type="button"
        className={styles.bell}
        aria-label={reminders.length ? `Напоминания: ${reminders.length}` : 'Напоминаний нет'}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
      >
        <BellIcon size={20} />
        {reminders.length ? (
          <span className={styles.bellBadge} data-urgent={urgent ? '' : undefined} aria-hidden="true">
            {reminders.length > 9 ? '9+' : reminders.length}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className={styles.bellPanel} role="dialog" aria-label="Напоминания">
          <strong className={styles.bellTitle}>Напоминания</strong>
          {reminders.length ? (
            <ul className={styles.reminders}>
              {reminders.map((r) => (
                <li key={r.key} data-tone={r.tone} data-type={r.type}>
                  <button
                    type="button"
                    className={styles.reminderMain}
                    onClick={() => {
                      setOpen(false);
                      onOpen(r);
                    }}
                  >
                    <span className={styles.reminderTitle}>{r.title}</span>
                    <span className={styles.reminderDetail}>
                      {r.detail}
                      {r.visitId ? ` · ${formatShortDate(r.at)}, ${formatTime(r.at)}` : ''}
                    </span>
                  </button>
                  <div className={styles.reminderActions}>
                    <button type="button" onClick={() => void act(r, 'done')}>
                      Готово
                    </button>
                    <button type="button" onClick={() => void act(r, 'hour')}>
                      Через час
                    </button>
                    <button type="button" onClick={() => void act(r, 'tomorrow')}>
                      Завтра
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.empty}>Всё сделано. Новые напоминания появятся здесь.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
