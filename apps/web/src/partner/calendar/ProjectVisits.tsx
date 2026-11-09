import { useMemo, useState } from 'react';
import { VISIT_KIND_LABELS, quoteSentAtOf, visitStartMs, type VisitKind } from '../../../../../packages/shared/calendar.js';
import type { JobObject, Project } from '../../../../../packages/shared/partner';
import { useCalendar } from './calendarStore';
import { formatDayMonth, formatTimeRange } from './calendarView';
import { VisitDialog, type VisitDraft } from './VisitDialog';
import styles from './Calendar.module.css';

/** Блок «Замер и монтаж» на странице проекта: назначенное время, исполнитель и когда отправили КП. */
export function ProjectVisits({ project, rooms }: { project: Project; rooms: JobObject[] }) {
  const calendar = useCalendar();
  const [dialog, setDialog] = useState<VisitDraft | null>(null);
  const visits = useMemo(
    () => calendar.visits.filter((v) => v.projectId === project.id).sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    [calendar.visits, project.id],
  );
  const quoteAt = useMemo(() => {
    const stamps = rooms.map((r) => quoteSentAtOf(r)).filter(Boolean) as string[];
    return stamps.sort()[0] || null;
  }, [rooms]);
  const now = Date.now();
  const next = (kind: VisitKind) => visits.find((v) => v.kind === kind && !v.doneAt && (visitStartMs(v) ?? 0) >= now - 12 * 3600 * 1000);

  return (
    <section className={styles.projectVisits} aria-label="Замер и монтаж">
      <h3>Замер и монтаж</h3>
      <ul className={styles.visitRows}>
        {(['measure', 'install'] as VisitKind[]).map((kind) => {
          const v = next(kind);
          return (
            <li key={kind}>
              <span className={styles.visitKind} data-kind={kind}>{VISIT_KIND_LABELS[kind]}</span>
              <span className={styles.visitWhen}>
                {v ? `${formatDayMonth(v.startsAt)}, ${formatTimeRange(v.startsAt, v.durationMin)} · ${v.userName}` : 'Время не назначено'}
              </span>
              {calendar.canPlan ? (
                <button
                  type="button"
                  className={styles.linkBtn}
                  onClick={() =>
                    setDialog(
                      v
                        ? { id: v.id, kind, projectId: project.id, objectId: v.objectId, userId: v.userId, startsAt: v.startsAt, durationMin: v.durationMin, note: v.note, done: Boolean(v.doneAt) }
                        : { kind, projectId: project.id },
                    )
                  }
                >
                  {v ? 'Изменить' : `Назначить ${VISIT_KIND_LABELS[kind].toLowerCase()}`}
                </button>
              ) : null}
            </li>
          );
        })}
        <li>
          <span className={styles.visitKind} data-kind="quote">КП</span>
          <span className={styles.visitWhen}>{quoteAt ? `Отправлено ${formatDayMonth(quoteAt)}` : 'Ещё не отправлено'}</span>
        </li>
      </ul>
      {dialog ? <VisitDialog draft={dialog} onClose={() => setDialog(null)} /> : null}
    </section>
  );
}
