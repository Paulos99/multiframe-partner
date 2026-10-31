import { useState } from 'react';
import type { UserRole } from '../../../../packages/shared/partner';
import { roleVideoFor, roleVideoSrc } from './roleVideos';
import styles from './RoleVideoCard.module.css';

/** Обучающее видео своей роли: афиша с кнопкой, ролик грузится только после нажатия. */
export function RoleVideoCard({ role }: { role: UserRole }) {
  const [open, setOpen] = useState(false);
  const v = roleVideoFor(role);
  if (!v) return null;
  const src = roleVideoSrc(v, import.meta.env.BASE_URL || '/');
  return (
    <section className={styles.card} aria-label="Обучающее видео">
      <div className={styles.text}>
        <h3 className={styles.title}>Обучающее видео · {v.duration}</h3>
        <p className={styles.lead}>
          Для роли «{v.title}». {v.description}
        </p>
      </div>
      <div className={styles.player}>
        {open ? (
          <video className={styles.video} src={src.video} poster={src.poster} controls autoPlay playsInline preload="metadata" aria-label={v.title}>
            Видео не поддерживается этим браузером.
          </video>
        ) : (
          <button type="button" className={styles.poster} onClick={() => setOpen(true)} aria-label={`Смотреть видео, ${v.duration}`}>
            <img src={src.poster} alt="" loading="lazy" decoding="async" width={1280} height={720} />
            <span className={styles.play}>Смотреть</span>
          </button>
        )}
      </div>
    </section>
  );
}
