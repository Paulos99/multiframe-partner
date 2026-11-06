import type { UserRole } from '../../../../packages/shared/partner';
import { openFilePreview } from '../ui/filePreview/previewStore';
import { roleVideoSrc, roleVideosFor, type RoleVideo } from './roleVideos';
import styles from './RoleVideoCard.module.css';

/**
 * Видео в «Обучении»: у рабочей роли своё, у администратора StP все четыре подряд (только просмотр).
 * В карточке нет кнопок изменения и удаления: ролики заменяются кодом (docs/TRAINING_VIDEOS.md).
 * Нажатие «Смотреть» открывает тот же просмотрщик, что и у остальных файлов материалов.
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
  const src = roleVideoSrc(v, import.meta.env.BASE_URL || '/');
  const fileName = `${v.title}.mp4`;

  function open() {
    openFilePreview({
      id: `role-video-${role}`,
      name: fileName,
      mime: 'video/mp4',
      source: {
        url: src.video,
        mime: 'video/mp4',
        poster: src.poster,
      },
    });
  }

  return (
    <section className={styles.card} aria-label={`Обучающее видео: ${v.title}`} data-role-video={role}>
      <div className={styles.text}>
        <h3 className={styles.title}>Обучающее видео · {v.duration}</h3>
        <p className={styles.lead}>
          Для роли «{v.title}». {v.description}
        </p>
      </div>
      <div className={styles.player}>
        <button type="button" className={styles.open} onClick={open} aria-label={`Смотреть: ${v.title}`}>
          <img className={styles.poster} src={src.poster} alt="" width={1920} height={1080} />
          <span className={styles.play}>Смотреть</span>
        </button>
      </div>
    </section>
  );
}
