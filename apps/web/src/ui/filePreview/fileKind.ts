/** Тип файла для окна предпросмотра: по MIME, а если его нет — по расширению. */
export type FileKind = 'pdf' | 'image' | 'video' | 'audio' | 'text' | 'office' | 'other';

const EXT_KIND: Record<string, FileKind> = {
  pdf: 'pdf',
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', avif: 'image', svg: 'image', bmp: 'image',
  mp4: 'video', webm: 'video', mov: 'video', m4v: 'video', ogv: 'video',
  mp3: 'audio', wav: 'audio', ogg: 'audio', oga: 'audio', m4a: 'audio', aac: 'audio', flac: 'audio',
  txt: 'text', csv: 'text', md: 'text', json: 'text', log: 'text',
  doc: 'office', docx: 'office', xls: 'office', xlsx: 'office', ppt: 'office', pptx: 'office',
  odt: 'office', ods: 'office', odp: 'office', rtf: 'office', pages: 'office', key: 'office', numbers: 'office',
};

export function fileExtension(name: string | null | undefined): string {
  const clean = String(name || '').split(/[?#]/)[0] ?? '';
  const dot = clean.lastIndexOf('.');
  if (dot <= 0 || dot === clean.length - 1) return '';
  return clean.slice(dot + 1).toLowerCase();
}

export function detectFileKind(mime: string | null | undefined, name?: string | null): FileKind {
  const m = String(mime || '').toLowerCase().split(';')[0]!.trim();
  if (m && m !== 'application/octet-stream' && m !== 'binary/octet-stream') {
    if (m === 'application/pdf' || m === 'application/x-pdf') return 'pdf';
    if (m.startsWith('image/')) return 'image';
    if (m.startsWith('video/')) return 'video';
    if (m.startsWith('audio/')) return 'audio';
    if (m.startsWith('text/') || m === 'application/json') return 'text';
    if (
      m.includes('officedocument') ||
      m.includes('opendocument') ||
      m === 'application/msword' ||
      m === 'application/rtf' ||
      m.startsWith('application/vnd.ms-')
    )
      return 'office';
  }
  return EXT_KIND[fileExtension(name)] ?? 'other';
}

/** Можно ли показать файл прямо в окне (иначе — карточка с кнопкой «Скачать»). */
export function isInlinePreviewable(kind: FileKind): boolean {
  return kind !== 'office' && kind !== 'other';
}

const KIND_LABEL: Record<FileKind, string> = {
  pdf: 'PDF',
  image: 'Изображение',
  video: 'Видео',
  audio: 'Аудио',
  text: 'Текст',
  office: 'Документ',
  other: 'Файл',
};

export function fileKindLabel(kind: FileKind, name?: string | null): string {
  const ext = fileExtension(name);
  if ((kind === 'office' || kind === 'other') && ext) return `${KIND_LABEL[kind]} ${ext.toUpperCase()}`;
  return KIND_LABEL[kind];
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} Б`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.ceil(kb)} КБ`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb < 10 ? mb.toFixed(1).replace('.', ',') : Math.round(mb)} МБ`;
  const gb = mb / 1024;
  return `${gb.toFixed(1).replace('.', ',')} ГБ`;
}

/** Ограничение масштаба картинки. */
export const ZOOM_MIN = 1;
export const ZOOM_MAX = 5;
export function clampZoom(value: number): number {
  if (!Number.isFinite(value)) return ZOOM_MIN;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(value * 100) / 100));
}

/** Индекс соседнего файла по кругу. */
export function stepIndex(index: number, delta: number, length: number): number {
  if (length <= 0) return 0;
  return (((index + delta) % length) + length) % length;
}
