import type { ReactNode } from 'react';

/** Источник содержимого: ссылка (подписанная или blob:), Blob или готовый узел (заглушка материала). */
export type PreviewSource =
  | { url: string; mime?: string | null; size?: number | null; pdfCopy?: PdfCopySource }
  | { blob: Blob; mime?: string | null; pdfCopy?: PdfCopySource }
  | { node: ReactNode };

/** PDF-копия документа для просмотра (например, для .doc). Скачивается при этом оригинал. */
export type PdfCopySource = { url: string } | { blob: Blob };

export type PreviewItem = {
  id: string;
  name: string;
  mime?: string | null;
  size?: number | null;
  source?: PreviewSource;
  /** Ленивая загрузка — вызывается, когда файл показывают. */
  load?: () => Promise<PreviewSource>;
};

export type PreviewState = { items: PreviewItem[]; index: number; openedAt: number } | null;

let state: PreviewState = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((fn) => fn());
}

export function openFilePreview(items: PreviewItem[] | PreviewItem, index = 0): void {
  const list = Array.isArray(items) ? items : [items];
  if (!list.length) return;
  state = { items: list, index: Math.min(Math.max(0, index), list.length - 1), openedAt: Date.now() };
  emit();
}

export function setFilePreviewIndex(index: number): void {
  if (!state) return;
  state = { ...state, index };
  emit();
}

export function closeFilePreview(): void {
  if (!state) return;
  state = null;
  emit();
}

export function subscribeFilePreview(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getFilePreviewState(): PreviewState {
  return state;
}
