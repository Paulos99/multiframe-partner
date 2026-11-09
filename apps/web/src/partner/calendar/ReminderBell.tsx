import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReminderAck } from '../../../../../packages/shared/calendar.js';
import { buildReminders, type Reminder } from '../../../../../packages/shared/calendar.js';
import { BellIcon } from '../../icons';
import { AnimatePresence, m, motionPresets, usePrefersReducedMotion } from '../motionBits';
import { usePartner } from '../PartnerContext';
import { ackReminder } from './calendarClient';
import { patchCalendarAcks, refreshCalendar, useCalendar } from './calendarStore';
import { formatShortDate, formatTime } from './calendarView';
import styles from './Calendar.module.css';

/**
 * Колокольчик в шапке: напоминания о ближайших замерах и монтажах, КП без ответа,
 * просроченных этапах и замерах без результата. «Готово» убирает напоминание,
 * «Отложить» прячет его на час или до завтрашнего утра. Отметки хранятся на сервере у каждого свои.
 *
 * Исчезновение — как карточки в канбане: fade/scale + layout, чтобы нижние строки подъезжали.
 */
export function ReminderBell({ onOpen }: { onOpen: (reminder: Reminder) => void }) {
  const api = usePartner();
  const calendar = useCalendar();
  const reduce = usePrefersReducedMotion();
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(() => new Set());
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
    });
  }, [api.user, api.objects, api.projects, calendar.visits, calendar.acks, now]);

  async function act(reminder: Reminder, action: 'done' | 'hour' | 'tomorrow') {
    if (!api.user || pendingKeys.has(reminder.key)) return;
    setActionError(null);
    let until: string | undefined;
    if (action === 'hour') until = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    if (action === 'tomorrow') {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
      until = d.toISOString();
    }
    const prevAcks = calendar.acks;
    const nowIso = new Date().toISOString();
    const optimistic: ReminderAck = {
      id: `${api.user.id}|${reminder.key}`,
      userId: api.user.id,
      key: reminder.key,
      doneAt: action === 'done' ? nowIso : null,
      snoozeUntil: action === 'done' ? null : until || null,
      updatedAt: nowIso,
    };
    // Сразу убираем из списка — AnimatePresence играет выход, как у канбана.
    patchCalendarAcks([optimistic, ...prevAcks.filter((a) => a.key !== reminder.key || a.userId !== api.user!.id)]);
    setPendingKeys((prev) => new Set(prev).add(reminder.key));
    try {
      const saved = await ackReminder(reminder.key, action === 'done' ? 'done' : 'snooze', until);
      if (saved) {
        patchCalendarAcks([saved, ...prevAcks.filter((a) => a.key !== reminder.key || a.userId !== api.user!.id)]);
      }
      // Новый запрос, не ответ, который ушёл до записи отметки.
      await refreshCalendar({ force: true });
    } catch (err) {
      patchCalendarAcks(prevAcks);
      const message = err instanceof Error && err.message ? err.message : 'Не удалось сохранить. Проверьте интернет и нажмите ещё раз.';
      setActionError(message);
    } finally {
      setPendingKeys((prev) => {
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
          {actionError ? (
            <p className={styles.reminderError} role="alert">
              {actionError}
            </p>
          ) : null}
          {reminders.length ? (
            <ul className={styles.reminders}>
              <AnimatePresence initial={false}>
                {reminders.map((r) => (
                  <m.li
                    key={r.key}
                    layout={!reduce}
                    initial={false}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={reduce ? undefined : { opacity: 0, scale: 0.97 }}
                    transition={reduce ? { duration: 0 } : motionPresets.layout}
                    data-tone={r.tone}
                    data-type={r.type}
                    data-reminder-key={r.key}
                  >
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
                      <button type="button" disabled={pendingKeys.has(r.key)} onClick={() => void act(r, 'done')}>
                        Готово
                      </button>
                      <button type="button" disabled={pendingKeys.has(r.key)} onClick={() => void act(r, 'hour')}>
                        Через час
                      </button>
                      <button type="button" disabled={pendingKeys.has(r.key)} onClick={() => void act(r, 'tomorrow')}>
                        Завтра
                      </button>
                    </div>
                  </m.li>
                ))}
              </AnimatePresence>
            </ul>
          ) : (
            <p className={styles.empty}>Всё сделано. Новые напоминания появятся здесь.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
