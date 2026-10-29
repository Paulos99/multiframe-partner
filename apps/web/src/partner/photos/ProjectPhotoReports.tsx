import { useEffect, useMemo, useState } from 'react';
import type { JobObject } from '../../../../../packages/shared/partner';
import {
  PHOTO_STAGES,
  PHOTO_STAGE_LABELS,
  photoTotal,
  type PhotoStage,
} from '../../../../../packages/shared/roomPhotos.js';
import { apiListRoomPhotos, type RoomPhotoList } from '../apiClient';
import { usePartner } from '../PartnerContext';
import { roomTitle } from '../projectDesk';
import { PhotoReportActions } from './PhotoReportActions';
import { formatPhotoDate } from './photoFormat';
import styles from './ProjectPhotoReports.module.css';

const PREVIEW = 4;

function counts(room: JobObject) {
  return room.photoCounts ?? { before: 0, progress: 0, after: 0 };
}

function RoomCard({ room, onOpen }: { room: JobObject; onOpen: () => void }) {
  const { user } = usePartner();
  const total = photoTotal(counts(room));
  const [data, setData] = useState<RoomPhotoList | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!total) {
      setData(null);
      return;
    }
    const controller = new AbortController();
    setError('');
    apiListRoomPhotos(room.id, controller.signal)
      .then(setData)
      .catch((e: unknown) => {
        if ((e as Error)?.name === 'AbortError') return;
        setError(e instanceof Error ? e.message : 'Не удалось загрузить фото');
      });
    return () => controller.abort();
    // Число фото меняется после добавления: список обновится сам.
  }, [room.id, total]);

  const photos = data?.photos ?? [];
  const latest = useMemo(
    () => [...photos].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, PREVIEW),
    [photos],
  );
  const lastDate = latest[0] ? formatPhotoDate(latest[0].createdAt, false) : '';
  const name = roomTitle(room);

  return (
    <article className={styles.card} data-testid="report-photo-room" aria-label={`Фотоотчёт: ${name}`}>
      <div className={styles.head}>
        <div>
          <h5>{name}</h5>
          <p className={styles.meta}>
            {total
              ? `${PHOTO_STAGES.map((s: PhotoStage) => `${PHOTO_STAGE_LABELS[s]} ${counts(room)[s]}`).join(' · ')}${lastDate ? ` · последнее ${lastDate}` : ''}`
              : 'Фото пока нет'}
          </p>
        </div>
        <button type="button" className={styles.open} onClick={onOpen} data-testid="report-photo-open-room">
          {total ? 'Открыть фотоотчёт' : 'Добавить фото'}
        </button>
      </div>
      {latest.length ? (
        <ul className={styles.strip}>
          {latest.map((photo) => (
            <li key={photo.id}>
              <img src={photo.thumbUrl} alt="" loading="lazy" draggable={false} />
              <span>{PHOTO_STAGE_LABELS[photo.stage]}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      {data && photos.length ? (
        <PhotoReportActions
          objectId={room.id}
          roomName={name}
          photos={photos}
          role={user?.role}
          clientVisible={data.clientVisible}
          answers={room.room?.answers ?? null}
          compact
        />
      ) : null}
    </article>
  );
}

/** Раздел «Фото» во вкладке «Отчёты» проекта: по каждой комнате этапы, последние снимки, PDF и отправка клиенту. */
export function ProjectPhotoReports({ rooms, onOpenRoom }: { rooms: JobObject[]; onOpenRoom: (room: JobObject) => void }) {
  const { remote } = usePartner();
  if (!rooms.length) return <p className={styles.lead}>В проекте пока нет комнат.</p>;
  if (!remote) {
    return <p className={styles.lead}>Фото хранятся на сервере. Войдите в кабинет с подключением к серверу, чтобы увидеть снимки.</p>;
  }
  return (
    <div className={styles.list} data-testid="project-photo-reports">
      {rooms.map((room) => (
        <RoomCard key={room.id} room={room} onOpen={() => onOpenRoom(room)} />
      ))}
    </div>
  );
}
