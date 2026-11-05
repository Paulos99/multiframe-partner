import { useState } from 'react';
import type { PublicMaterial } from '../../../../packages/shared/materialsLib.js';
import { detectFileKind, fileExtension, type FileKind } from '../ui/filePreview/fileKind';
import styles from './MaterialsPanel.module.css';

const BADGE: Partial<Record<FileKind, string>> = {
  pdf: 'PDF',
  image: 'IMG',
  video: 'VIDEO',
  audio: 'AUDIO',
  docx: 'DOCX',
  doc: 'DOC',
  text: 'TXT',
};

/** Ярлык типа на значке: PDF, DOCX, VIDEO… или расширение файла. */
export function thumbBadge(kind: FileKind, name: string): string {
  return BADGE[kind] || fileExtension(name).toUpperCase().slice(0, 5) || 'FILE';
}

/**
 * Превью файла в списке «Обучения»: миниатюра (лениво, loading="lazy"), а если её нет
 * или она не загрузилась — значок типа файла.
 */
export function MaterialThumb({ item }: { item: PublicMaterial }) {
  const kind = detectFileKind(item.mime, item.name);
  const url = item.thumbnailUrl || null;
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const showImage = !!url && failedUrl !== url;
  return (
    <span
      className={styles.thumb}
      data-kind={kind}
      data-thumb={showImage ? (loadedUrl === url ? 'loaded' : 'loading') : 'icon'}
      data-testid="material-thumb"
      aria-hidden="true"
    >
      {showImage ? (
        <img
          className={styles.thumbImg}
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onLoad={() => setLoadedUrl(url)}
          onError={() => setFailedUrl(url)}
        />
      ) : (
        <span className={styles.thumbIcon}>
          <svg viewBox="0 0 40 48" aria-hidden="true">
            <path d="M6 2h20l12 12v30a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z" fill="currentColor" opacity=".16" />
            <path d="M26 2l12 12H28a2 2 0 0 1-2-2V2Z" fill="currentColor" opacity=".45" />
          </svg>
          <span className={styles.thumbBadge}>{thumbBadge(kind, item.name)}</span>
        </span>
      )}
      {kind === 'video' ? (
        <span className={styles.thumbPlay}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" fill="currentColor" />
          </svg>
        </span>
      ) : null}
    </span>
  );
}
