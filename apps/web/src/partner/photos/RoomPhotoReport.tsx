import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  PHOTO_CAPTION_MAX,
  PHOTO_STAGES,
  PHOTO_STAGE_LABELS,
  canDeletePhoto,
  type PhotoStage,
} from '../../../../../packages/shared/roomPhotos.js';
import {
  apiDeleteRoomPhoto,
  apiListRoomPhotos,
  apiSetPhotoReportVisible,
  apiUpdateRoomPhoto,
  apiUploadRoomPhoto,
  type RoomPhoto,
  type RoomPhotoList,
} from '../apiClient';
import { usePartner } from '../PartnerContext';
import { PhotoViewer } from './PhotoViewer';
import { formatPhotoDate, groupByStage } from './photoFormat';
import { PhotoPrepError, prepareImage } from './imagePrep';
import styles from './RoomPhotoReport.module.css';

const STAGE_HINT: Record<PhotoStage, string> = {
  before: 'Как комната выглядела до работ.',
  progress: 'Монтаж идёт: полотно, профиль, свет.',
  after: 'Готовый результат.',
};

type QueueItem = {
  key: string;
  stage: PhotoStage;
  name: string;
  status: 'prep' | 'up' | 'error';
  progress: number;
  message: string;
  file: File;
  caption: string;
};

const REFRESH_MS = 4 * 60_000;

/** Фотоотчёт комнаты: этапы «До», «В процессе», «После», съёмка и загрузка, просмотр на весь экран. */
export function RoomPhotoReport({ objectId }: { objectId: string }) {
  const { user, remote } = usePartner();
  const [data, setData] = useState<RoomPhotoList | null>(null);
  const [loadError, setLoadError] = useState('');
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [viewer, setViewer] = useState<{ index: number; compare: boolean } | null>(null);
  const [captions, setCaptions] = useState<Record<PhotoStage, string>>({ before: '', progress: '', after: '' });
  const [shareBusy, setShareBusy] = useState(false);
  const [shareError, setShareError] = useState('');
  const working = useRef(false);
  const pending = useRef<QueueItem[]>([]);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const next = await apiListRoomPhotos(objectId, signal);
        if (!alive.current) return;
        setData(next);
        setLoadError('');
      } catch (e) {
        if ((e as Error)?.name === 'AbortError' || !alive.current) return;
        setLoadError(e instanceof Error ? e.message : 'Не удалось загрузить фото');
      }
    },
    [objectId],
  );

  useEffect(() => {
    if (!remote) return;
    setData(null);
    setQueue([]);
    const controller = new AbortController();
    void load(controller.signal);
    // Ссылки на фото живут десять минут: обновляем список заранее.
    const timer = window.setInterval(() => {
      if (!viewer && !working.current) void load();
    }, REFRESH_MS);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [objectId, remote, load]);

  const patchItem = useCallback((key: string, patch: Partial<QueueItem>) => {
    setQueue((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }, []);

  const drain = useCallback(async () => {
    if (working.current) return;
    working.current = true;
    try {
      while (pending.current.length) {
        const item = pending.current.shift()!;
        patchItem(item.key, { status: 'prep', progress: 0, message: '' });
        try {
          const prepared = await prepareImage(item.file);
          patchItem(item.key, { status: 'up' });
          const photo = await apiUploadRoomPhoto(
            objectId,
            { stage: item.stage, caption: item.caption, image: prepared.image, thumb: prepared.thumb },
            (fraction) => patchItem(item.key, { progress: fraction }),
          );
          if (!alive.current) return;
          setQueue((rows) => rows.filter((row) => row.key !== item.key));
          setData((current) =>
            current ? { ...current, photos: [...current.photos.filter((p) => p.id !== photo.id), photo] } : current,
          );
        } catch (e) {
          const message =
            e instanceof PhotoPrepError || e instanceof Error ? e.message : 'Не удалось загрузить фото';
          if (alive.current) patchItem(item.key, { status: 'error', message });
        }
      }
    } finally {
      working.current = false;
    }
  }, [objectId, patchItem]);

  const addFiles = useCallback(
    (stage: PhotoStage, files: FileList | null) => {
      if (!files?.length) return;
      const caption = captions[stage].trim();
      const items: QueueItem[] = Array.from(files).map((file, i) => ({
        key: `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`,
        stage,
        name: file.name || 'Фото',
        status: 'prep',
        progress: 0,
        message: '',
        file,
        caption,
      }));
      setQueue((rows) => [...rows, ...items]);
      pending.current.push(...items);
      setCaptions((value) => ({ ...value, [stage]: '' }));
      void drain();
    },
    [captions, drain],
  );

  const retry = (item: QueueItem) => {
    patchItem(item.key, { status: 'prep', message: '', progress: 0 });
    pending.current.push(item);
    void drain();
  };

  const dropFromQueue = (key: string) => {
    pending.current = pending.current.filter((row) => row.key !== key);
    setQueue((rows) => rows.filter((row) => row.key !== key));
  };

  const photos = data?.photos ?? [];
  const groups = useMemo(() => groupByStage(photos), [photos]);
  const flat = useMemo(() => PHOTO_STAGES.flatMap((stage) => groups[stage]), [groups]);
  const canAdd = data?.canAdd ?? [];
  const visibleStages = (data?.stages ?? []) as PhotoStage[];
  const comparable = groups.before.length > 0 && groups.after.length > 0;

  const deletable = (photo: RoomPhoto) => canDeletePhoto(user ? { id: user.id, role: user.role } : null, photo);
  const editable = (photo: RoomPhoto) => deletable(photo);

  if (!remote) {
    return (
      <section className={styles.panel} aria-labelledby="photo-report-title" data-testid="photo-report">
        <h2 id="photo-report-title">Фотоотчёт</h2>
        <p className={styles.lead}>Фото сохраняются на сервере. Войдите в кабинет с подключением к серверу, чтобы добавлять снимки.</p>
      </section>
    );
  }

  const toggleShare = async (next: boolean) => {
    setShareBusy(true);
    setShareError('');
    try {
      const value = await apiSetPhotoReportVisible(objectId, next);
      setData((current) => (current ? { ...current, clientVisible: value } : current));
    } catch (e) {
      setShareError(e instanceof Error ? e.message : 'Не удалось изменить настройку');
    } finally {
      setShareBusy(false);
    }
  };

  return (
    <section className={styles.panel} aria-labelledby="photo-report-title" data-testid="photo-report">
      <div className={styles.head}>
        <div>
          <h2 id="photo-report-title">Фотоотчёт</h2>
          <p className={styles.lead}>
            {data
              ? canAdd.length === 1 && canAdd[0] === 'before'
                ? 'Снимите комнату до работ: фото попадёт в карточку.'
                : 'Снимки до, во время и после монтажа. По ним можно показать клиенту результат.'
              : 'Загружаем фото…'}
          </p>
        </div>
        {comparable ? (
          <button
            type="button"
            className={styles.ghost}
            onClick={() => setViewer({ index: 0, compare: true })}
            data-testid="photo-open-compare"
          >
            Сравнить до и после
          </button>
        ) : null}
      </div>

      {loadError ? (
        <p className={styles.error} role="alert">
          {loadError}{' '}
          <button type="button" className={styles.linkBtn} onClick={() => void load()}>
            Повторить
          </button>
        </p>
      ) : null}

      {visibleStages.map((stage) => {
        const items = groups[stage];
        const rows = queue.filter((row) => row.stage === stage);
        const mayAdd = canAdd.includes(stage);
        return (
          <div key={stage} className={styles.stage} data-testid={`photo-stage-${stage}`}>
            <div className={styles.stageHead}>
              <h3>
                {PHOTO_STAGE_LABELS[stage]} <span className={styles.count}>{items.length}</span>
              </h3>
              <p className={styles.hint}>{STAGE_HINT[stage]}</p>
            </div>

            {items.length || rows.length ? (
              <ul className={styles.grid}>
                {items.map((photo) => (
                  <li key={photo.id}>
                    <button
                      type="button"
                      className={styles.tile}
                      onClick={() => setViewer({ index: flat.findIndex((p) => p.id === photo.id), compare: false })}
                      aria-label={`Открыть фото. ${PHOTO_STAGE_LABELS[stage]}, ${formatPhotoDate(photo.createdAt)}${photo.caption ? `, ${photo.caption}` : ''}`}
                      data-testid="photo-tile"
                    >
                      <img src={photo.thumbUrl} alt="" loading="lazy" draggable={false} />
                      {photo.caption ? <span className={styles.tileCap}>{photo.caption}</span> : null}
                    </button>
                  </li>
                ))}
                {rows.map((row) => (
                  <li key={row.key} className={styles.upload} data-status={row.status} data-testid="photo-upload-row">
                    <span className={styles.uploadName}>{row.name}</span>
                    {row.status === 'error' ? (
                      <>
                        <span className={styles.uploadMsg} role="alert">
                          {row.message}
                        </span>
                        <span className={styles.uploadBtns}>
                          <button type="button" className={styles.linkBtn} onClick={() => retry(row)}>
                            Повторить
                          </button>
                          <button type="button" className={styles.linkBtn} onClick={() => dropFromQueue(row.key)}>
                            Убрать
                          </button>
                        </span>
                      </>
                    ) : (
                      <>
                        <span className={styles.uploadMsg}>
                          {row.status === 'prep' ? 'Готовим фото…' : `Загрузка ${Math.round(row.progress * 100)}%`}
                        </span>
                        <progress
                          className={styles.bar}
                          max={100}
                          value={row.status === 'prep' ? undefined : Math.round(row.progress * 100)}
                          aria-label="Загрузка фото"
                        />
                      </>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.empty}>{data ? 'Фото пока нет.' : ''}</p>
            )}

            {mayAdd ? (
              <div className={styles.addRow}>
                <input
                  className={styles.caption}
                  value={captions[stage]}
                  maxLength={PHOTO_CAPTION_MAX}
                  placeholder="Подпись к новым фото (по желанию)"
                  aria-label={`Подпись к новым фото, этап «${PHOTO_STAGE_LABELS[stage]}»`}
                  onChange={(event) => setCaptions((value) => ({ ...value, [stage]: event.target.value }))}
                />
                <label className={styles.primary}>
                  Снять на камеру
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className={styles.fileInput}
                    data-testid={`photo-camera-${stage}`}
                    onChange={(event) => {
                      addFiles(stage, event.target.files);
                      event.target.value = '';
                    }}
                  />
                </label>
                <label className={styles.ghost}>
                  Выбрать из галереи
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className={styles.fileInput}
                    data-testid={`photo-gallery-${stage}`}
                    onChange={(event) => {
                      addFiles(stage, event.target.files);
                      event.target.value = '';
                    }}
                  />
                </label>
              </div>
            ) : null}
          </div>
        );
      })}

      {data?.canShareWithClient ? (
        <div className={styles.share}>
          <label className={styles.shareLabel}>
            <input
              type="checkbox"
              checked={data.clientVisible}
              disabled={shareBusy}
              onChange={(event) => void toggleShare(event.target.checked)}
              data-testid="photo-share-toggle"
            />
            <span>
              Показывать фото клиенту
              <small>
                Клиент увидит снимки на своей странице по ссылке. Подписи и имена сотрудников не показываются.
              </small>
            </span>
          </label>
          {shareError ? (
            <p className={styles.error} role="alert">
              {shareError}
            </p>
          ) : null}
        </div>
      ) : null}

      {viewer ? (
        <PhotoViewer
          photos={flat}
          startIndex={Math.max(0, viewer.index)}
          startInCompare={viewer.compare}
          onClose={() => setViewer(null)}
          canDelete={(photo) => deletable(photo as RoomPhoto)}
          onDelete={async (photo) => {
            await apiDeleteRoomPhoto(objectId, photo.id);
            setData((current) =>
              current ? { ...current, photos: current.photos.filter((p) => p.id !== photo.id) } : current,
            );
          }}
          canEditCaption={(photo) => editable(photo as RoomPhoto)}
          onCaption={async (photo, caption) => {
            const updated = await apiUpdateRoomPhoto(objectId, photo.id, caption);
            setData((current) =>
              current
                ? {
                    ...current,
                    photos: current.photos.map((p) => (p.id === photo.id ? { ...p, caption: updated.caption } : p)),
                  }
                : current,
            );
          }}
        />
      ) : null}
    </section>
  );
}
