import { useMemo, useState } from 'react';
import { PHOTO_STAGES, PHOTO_STAGE_LABELS } from '../../../../../packages/shared/roomPhotos.js';
import type { PublicRoomPhoto } from '../apiClient';
import { PhotoCompare } from './PhotoCompare';
import { PhotoViewer } from './PhotoViewer';
import { formatPhotoDate, groupByStage } from './photoFormat';
import styles from './ClientPhotoReport.module.css';

/** Фото работ на странице клиента: до, в процессе, после. Без подписей, имён и цен. */
export function ClientPhotoReport({ photos }: { photos: readonly PublicRoomPhoto[] }) {
  const [viewer, setViewer] = useState<{ index: number; compare: boolean } | null>(null);
  const groups = useMemo(() => groupByStage(photos), [photos]);
  const flat = useMemo(() => PHOTO_STAGES.flatMap((stage) => groups[stage]), [groups]);
  const comparable = groups.before.length > 0 && groups.after.length > 0;
  if (!photos.length) return null;

  return (
    <section className={styles.panel} aria-labelledby="client-photos-title" data-testid="client-photo-report" data-reveal>
      <h2 id="client-photos-title">Фото работ</h2>
      <p className={styles.lead}>Как комната выглядела до, во время и после монтажа. Нажмите на снимок, чтобы открыть его.</p>

      {comparable ? <PhotoCompare befores={groups.before} afters={groups.after} /> : null}

      {PHOTO_STAGES.map((stage) =>
        groups[stage].length ? (
          <div key={stage} className={styles.stage} data-testid={`client-photo-stage-${stage}`}>
            <h3>{PHOTO_STAGE_LABELS[stage]}</h3>
            <ul className={styles.grid}>
              {groups[stage].map((photo) => (
                <li key={photo.id}>
                  <button
                    type="button"
                    className={styles.tile}
                    aria-label={`Открыть фото. ${PHOTO_STAGE_LABELS[stage]}, ${formatPhotoDate(photo.createdAt, false)}`}
                    onClick={() => setViewer({ index: flat.findIndex((p) => p.id === photo.id), compare: false })}
                  >
                    <img src={photo.thumbUrl} alt="" loading="lazy" draggable={false} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null,
      )}

      {viewer ? (
        <PhotoViewer
          photos={flat}
          startIndex={Math.max(0, viewer.index)}
          startInCompare={viewer.compare}
          onClose={() => setViewer(null)}
        />
      ) : null}
    </section>
  );
}
