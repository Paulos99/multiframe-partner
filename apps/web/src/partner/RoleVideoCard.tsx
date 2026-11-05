import { useEffect, useRef, useState } from 'react';
import type { UserRole } from '../../../../packages/shared/partner';
import { roleVideoSrc, roleVideosFor, type RoleVideo } from './roleVideos';
import styles from './RoleVideoCard.module.css';

/**
 * Обучающее видео роли: первым пунктом в «Обучении», вне папок, нажал «воспроизвести» — и оно идёт.
 * Сам ролик не скачивается, пока его не запустят (preload="none", видна афиша);
 * плеер создаётся, когда блок подходит к экрану.
 */
/**
 * Видео в «Обучении»: у рабочей роли своё, у администратора StP все четыре подряд (только просмотр).
 * В карточке нет кнопок изменения и удаления: ролики заменяются кодом (docs/TRAINING_VIDEOS.md).
 */
export function RoleVideoSection({ role }: { role: UserRole }) {
  return (
    <>
      {roleVideosFor(role).map((item) => (
        <VideoCard key={item.role} role={item.role} v={item.video} />
      ))}
    </>
  );
}

function VideoCard({ role, v }: { role: UserRole; v: RoleVideo }) {
  const holder = useRef<HTMLDivElement | null>(null);
  // Без IntersectionObserver (старые браузеры, проверки без экрана) плеер показываем сразу.
  const [near, setNear] = useState(() => typeof IntersectionObserver === 'undefined');
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    if (near || !holder.current) return undefined;
    const watcher = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          watcher.disconnect();
        }
      },
      { rootMargin: '300px' },
    );
    watcher.observe(holder.current);
    return () => watcher.disconnect();
  }, [near]);

  const src = roleVideoSrc(v, import.meta.env.BASE_URL || '/');
  return (
    <section className={styles.card} aria-label={`Обучающее видео: ${v.title}`} data-role-video={role}>
      <div className={styles.text}>
        <h3 className={styles.title}>Обучающее видео · {v.duration}</h3>
        <p className={styles.lead}>
          Для роли «{v.title}». {v.description}
        </p>
      </div>
      <div className={styles.player} ref={holder}>
        {broken ? (
          <p className={styles.broken} role="alert">
            Не удалось загрузить видео. Проверьте соединение и обновите страницу.
          </p>
        ) : near ? (
          <video
            className={styles.video}
            src={src.video}
            poster={src.poster}
            controls
            playsInline
            preload="none"
            width={1280}
            height={720}
            aria-label={`Видео: ${v.title}`}
            onError={() => setBroken(true)}
          >
            Видео не поддерживается этим браузером.
          </video>
        ) : (
          <div className={styles.video} aria-hidden="true" />
        )}
      </div>
    </section>
  );
}
