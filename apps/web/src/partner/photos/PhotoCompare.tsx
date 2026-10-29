import { useEffect, useMemo, useState } from 'react';
import { PHOTO_STAGE_LABELS } from '../../../../../packages/shared/roomPhotos.js';
import { formatPhotoDate, type ViewPhoto } from './photoFormat';
import styles from './PhotoCompare.module.css';

/**
 * Сравнение «До» и «После»: один кадр и ползунок. Слева видно «До», справа «После».
 * Если снимков несколько, внизу можно выбрать другой с каждой стороны.
 */
export function PhotoCompare({
  befores,
  afters,
  tone = 'surface',
}: {
  befores: readonly ViewPhoto[];
  afters: readonly ViewPhoto[];
  /** dark — для полноэкранного просмотра на тёмном фоне. */
  tone?: 'surface' | 'dark';
}) {
  const [beforeId, setBeforeId] = useState(befores[0]?.id || '');
  const [afterId, setAfterId] = useState(afters[afters.length - 1]?.id || '');
  const [position, setPosition] = useState(50);
  const before = useMemo(() => befores.find((p) => p.id === beforeId) || befores[0], [befores, beforeId]);
  const after = useMemo(() => afters.find((p) => p.id === afterId) || afters[afters.length - 1], [afters, afterId]);

  useEffect(() => {
    if (!befores.some((p) => p.id === beforeId)) setBeforeId(befores[0]?.id || '');
  }, [befores, beforeId]);
  useEffect(() => {
    if (!afters.some((p) => p.id === afterId)) setAfterId(afters[afters.length - 1]?.id || '');
  }, [afters, afterId]);

  if (!before || !after) return null;
  const ratio = before.width && before.height ? `${before.width} / ${before.height}` : '4 / 3';

  return (
    <div className={`${styles.compare} ${tone === 'dark' ? styles.dark : ''}`} data-testid="photo-compare">
      <div className={styles.frame} style={{ aspectRatio: ratio }}>
        <img className={styles.img} src={after.url} alt="Снимок «После»" draggable={false} />
        <img
          className={`${styles.img} ${styles.top}`}
          src={before.url}
          alt="Снимок «До»"
          draggable={false}
          style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
        />
        <span className={`${styles.tag} ${styles.tagLeft}`}>{PHOTO_STAGE_LABELS.before}</span>
        <span className={`${styles.tag} ${styles.tagRight}`}>{PHOTO_STAGE_LABELS.after}</span>
        <span className={styles.line} style={{ left: `${position}%` }} aria-hidden="true">
          <span className={styles.knob}>⇄</span>
        </span>
        <input
          className={styles.range}
          type="range"
          min={0}
          max={100}
          step={1}
          value={position}
          aria-label="Граница между «До» и «После»"
          onChange={(event) => setPosition(Number(event.target.value))}
        />
      </div>
      {befores.length > 1 || afters.length > 1 ? (
        <div className={styles.pickers}>
          <Picker label="До" photos={befores} value={before.id} onPick={setBeforeId} />
          <Picker label="После" photos={afters} value={after.id} onPick={setAfterId} />
        </div>
      ) : null}
    </div>
  );
}

function Picker({
  label,
  photos,
  value,
  onPick,
}: {
  label: string;
  photos: readonly ViewPhoto[];
  value: string;
  onPick: (id: string) => void;
}) {
  if (photos.length < 2) return <div />;
  return (
    <div className={styles.picker} role="group" aria-label={`Выбрать снимок: ${label}`}>
      <span className={styles.pickerLabel}>{label}</span>
      <div className={styles.pickerRow}>
        {photos.map((photo, index) => (
          <button
            key={photo.id}
            type="button"
            className={`${styles.pick} ${photo.id === value ? styles.pickOn : ''}`}
            aria-pressed={photo.id === value}
            aria-label={`${label}, снимок ${index + 1}, ${formatPhotoDate(photo.createdAt, false)}`}
            onClick={() => onPick(photo.id)}
          >
            <img src={photo.thumbUrl} alt="" draggable={false} />
          </button>
        ))}
      </div>
    </div>
  );
}
