/** Тип файла для окна предпросмотра: по MIME, а если его нет — по расширению. */
export type FileKind = 'pdf' | 'image' | 'video' | 'audio' | 'text' | 'docx' | 'doc' | 'office' | 'other';

const EXT_KIND: Record<string, FileKind> = {
  pdf: 'pdf',
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', avif: 'image', svg: 'image', bmp: 'image',
  mp4: 'video', webm: 'video', mov: 'video', m4v: 'video', ogv: 'video',
  mp3: 'audio', wav: 'audio', ogg: 'audio', oga: 'audio', m4a: 'audio', aac: 'audio', flac: 'audio',
  txt: 'text', csv: 'text', md: 'text', json: 'text', log: 'text',
  docx: 'docx', docm: 'docx', dotx: 'docx', dotm: 'docx',
  doc: 'doc', dot: 'doc',
  xls: 'office', xlsx: 'office', ppt: 'office', pptx: 'office',
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
    if (m.includes('wordprocessingml') || m.startsWith('application/vnd.ms-word.document')) return 'docx';
    if (m === 'application/msword') {
      // Часто .docx приходит с типом msword — расширение точнее.
      const byExt = EXT_KIND[fileExtension(name)];
      return byExt === 'docx' ? 'docx' : 'doc';
    }
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

/** Можно ли показать файл прямо в окне (иначе — карточка с кнопкой «Скачать»).
 *  .doc показывается только через PDF-копию, поэтому здесь false. */
export function isInlinePreviewable(kind: FileKind): boolean {
  return kind !== 'office' && kind !== 'other' && kind !== 'doc';
}

/** Формат Word по первым байтам: .docx — ZIP (PK\x03\x04), старый .doc — OLE2 (D0 CF 11 E0). */
export type WordFormat = 'docx' | 'doc' | 'unknown';
export function sniffWordFormat(head: ArrayLike<number> | null | undefined): WordFormat {
  if (!head || head.length < 4) return 'unknown';
  if (head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04) return 'docx';
  if (head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0) return 'doc';
  return 'unknown';
}

/** Документ Word крупнее этого рендерим только по явной кнопке-скачиванию. */
export const WORD_RENDER_MAX_BYTES = 40 * 1024 * 1024;

export type WordPlan = 'render' | 'pdf-copy' | 'fallback';
/**
 * Что показать для Word: PDF-копию (если есть и это .doc), отрисовку .docx в браузере
 * или карточку «Скачать». Для .docx PDF-копия — запасной вариант при ошибке отрисовки.
 */
export function wordPreviewPlan(kind: FileKind, opts: { hasPdfCopy: boolean; size?: number | null }): WordPlan {
  if (kind === 'doc') return opts.hasPdfCopy ? 'pdf-copy' : 'fallback';
  if (kind !== 'docx') return 'fallback';
  if (opts.size != null && opts.size > WORD_RENDER_MAX_BYTES) return opts.hasPdfCopy ? 'pdf-copy' : 'fallback';
  return 'render';
}

const KIND_LABEL: Record<FileKind, string> = {
  pdf: 'PDF',
  image: 'Изображение',
  video: 'Видео',
  audio: 'Аудио',
  text: 'Текст',
  docx: 'Документ',
  doc: 'Документ',
  office: 'Документ',
  other: 'Файл',
};

export function fileKindLabel(kind: FileKind, name?: string | null): string {
  const ext = fileExtension(name);
  if ((kind === 'office' || kind === 'other' || kind === 'docx' || kind === 'doc') && ext) return `${KIND_LABEL[kind]} ${ext.toUpperCase()}`;
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
