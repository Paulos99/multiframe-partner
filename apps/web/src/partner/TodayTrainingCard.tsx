import { useEffect, useState } from 'react';
import { loadTrainerContent } from '../trainer/content';
import type { TrainerRoute } from '../trainer/route';
import { trainerStore } from '../trainer/store';
import { buildTodayLessonView, type TodayLessonView } from './dailyLesson';
import { usePartner } from './PartnerContext';
import styles from './partner.module.css';

function pluralDays(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} день подряд`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} дня подряд`;
  return `${n} дней подряд`;
}

/**
 * Напоминание на «Сегодня»: само занятие остаётся в тренажёре.
 * Кнопка ведёт сразу к занятию дня; после прохождения карточка показывает «Занятие пройдено».
 */
export function TodayTrainingCard({ onOpenLesson }: { onOpenLesson: (route: TrainerRoute) => void }) {
  const api = usePartner();
  const user = api.user!;
  const [view, setView] = useState<TodayLessonView | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setFailed(false);
    Promise.all([loadTrainerContent(), trainerStore()])
      .then(async ([content, store]) => {
        const attempts = await store.attempts(user.id);
        if (!alive) return;
        setView(buildTodayLessonView(content, user.role, attempts));
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [user.id, user.role]);

  if (failed) {
    return (
      <section className={styles.todayLesson} aria-label="Занятие в тренажёре">
        <p className={styles.lead}>
          Не удалось проверить тренажёр. Откройте «Обучение», когда появится связь.
        </p>
      </section>
    );
  }

  if (!view) {
    return (
      <section className={styles.todayLesson} aria-label="Занятие в тренажёре" aria-busy="true">
        <p className={styles.lead}>Проверяем занятие…</p>
      </section>
    );
  }

  if (!view.lessons.length) return null;

  const next = view.lessons.find((l) => !l.done) ?? view.lessons[0]!;

  if (view.allDoneToday) {
    return (
      <section className={`${styles.todayLesson} ${styles.todayLessonDone}`} aria-label="Занятие в тренажёре" data-testid="today-training">
        <div className={styles.todayLessonRemind}>
          <div className={styles.todayLessonBody}>
            <strong>Занятие пройдено</strong>
            <span>
              На сегодня в тренажёре всё сделано
              {view.streakDays > 0 ? ` · ${pluralDays(view.streakDays)}` : ''}
              {view.progress.total > 0 ? ` · освоено ${view.progress.done} из ${view.progress.total}` : ''}
            </span>
          </div>
          <button type="button" className={styles.ghost} onClick={() => onOpenLesson(next.route)}>
            Открыть снова
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.todayLesson} aria-label="Занятие в тренажёре" data-testid="today-training">
      <div className={styles.todayLessonRemind}>
        <div className={styles.todayLessonBody}>
          <strong>Нужно пройти занятие в тренажёре</strong>
          <span>
            Короткая практика по вашей роли
            {view.streakDays > 0 ? ` · серия: ${pluralDays(view.streakDays)}` : ''}
          </span>
        </div>
        <button type="button" className={styles.primary} onClick={() => onOpenLesson(next.route)}>
          Перейти к занятию
        </button>
      </div>
    </section>
  );
}
