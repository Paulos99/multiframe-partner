import type { PublicMaterial } from '../../../../packages/shared/materialsLib.js';
import { openFilePreview, type PreviewItem } from '../ui/filePreview/previewStore';
import { rolesLabel } from './materialRoles';
import { roleVideoFor, roleVideoSrc } from './roleVideos';
import styles from './RoleVideoCard.module.css';

/**
 * Обучающие видео над папками «Материалов». Кто какое видео видит, решает админ StP (роли видимости):
 * сервер присылает роли только её видео. Встроенные ролики ролей играют файл из public/videos в исходном
 * качестве 1920×1080, загруженные — через тот же просмотрщик, что и остальные файлы материалов.
 * Админ StP видит все видео с отметкой ролей и может добавить, удалить и поменять, кто видит.
 */
export function TrainingVideos({
  items,
  canManage,
  busy,
  previewItem,
  onAdd,
  onRoles,
  onDelete,
}: {
  items: PublicMaterial[];
  canManage: boolean;
  busy: boolean;
  /** Окно просмотра для загруженного видео (подписанная ссылка с сервера). */
  previewItem: (item: PublicMaterial) => PreviewItem;
  onAdd: () => void;
  onRoles: (item: PublicMaterial) => void;
  onDelete: (item: PublicMaterial) => void;
}) {
  if (!items.length && !canManage) return null;
  return (
    <div className={styles.section} data-testid="training-videos">
      {items.map((item) => (
        <VideoCard
          key={item.id}
          item={item}
          canManage={canManage}
          busy={busy}
          previewItem={previewItem}
          onRoles={() => onRoles(item)}
          onDelete={() => onDelete(item)}
        />
      ))}
      {canManage ? (
        <div className={styles.add}>
          <button type="button" className={styles.addBtn} disabled={busy} onClick={onAdd}>
            Добавить видео
          </button>
          <span className={styles.addNote}>
            {items.length ? 'Видео идут первыми в «Обучении», вне папок.' : 'Обучающих видео пока нет.'}
          </span>
        </div>
      ) : null}
    </div>
  );
}

function VideoCard({
  item,
  canManage,
  busy,
  previewItem,
  onRoles,
  onDelete,
}: {
  item: PublicMaterial;
  canManage: boolean;
  busy: boolean;
  previewItem: (item: PublicMaterial) => PreviewItem;
  onRoles: () => void;
  onDelete: () => void;
}) {
  const builtin = item.builtin ? roleVideoFor(item.builtin) : null;
  const src = builtin ? roleVideoSrc(builtin, import.meta.env.BASE_URL || '/') : null;
  const title = builtin?.title ?? item.name.replace(/\.[A-Za-z0-9]{1,8}$/, '');
  const description = builtin?.description ?? item.description ?? '';
  const poster = src?.poster ?? item.thumbnailUrl ?? null;

  function open() {
    if (builtin && src) {
      openFilePreview({
        id: `role-video-${item.builtin}`,
        name: `${title}.mp4`,
        mime: 'video/mp4',
        source: { url: src.video, mime: 'video/mp4', poster: src.poster },
      });
      return;
    }
    openFilePreview([previewItem(item)], 0);
  }

  return (
    <section
      className={styles.card}
      aria-label={`Обучающее видео: ${title}`}
      data-role-video={item.builtin || item.id}
    >
      <div className={styles.text}>
        <h3 className={styles.title}>Обучающее видео{builtin ? ` · ${builtin.duration}` : ''}</h3>
        <p className={styles.lead}>
          {builtin ? `Для роли «${title}». ${description}` : `«${title}».${description ? ` ${description}` : ''}`}
        </p>
        {canManage ? (
          <>
            <p className={styles.roles} data-testid="material-roles">
              Видят: {rolesLabel(item.effectiveRoles)}
            </p>
            <div className={styles.actions}>
              <button type="button" className={styles.ghost} disabled={busy} onClick={onRoles} aria-label={`Кто видит: ${title}`}>
                Кто видит
              </button>
              <button type="button" className={styles.danger} disabled={busy} onClick={onDelete} aria-label={`Удалить видео: ${title}`}>
                Удалить
              </button>
            </div>
          </>
        ) : null}
      </div>
      <div className={styles.player}>
        <button type="button" className={styles.open} onClick={open} aria-label={`Смотреть: ${title}`}>
          {poster ? <img className={styles.poster} src={poster} alt="" width={1920} height={1080} /> : null}
          <span className={styles.play}>Смотреть</span>
        </button>
      </div>
    </section>
  );
}
