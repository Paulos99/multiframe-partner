import { describe, expect, it } from 'vitest';
import {
  clampZoom,
  detectFileKind,
  fileExtension,
  fileKindLabel,
  formatFileSize,
  isInlinePreviewable,
  sniffWordFormat,
  stepIndex,
  WORD_RENDER_MAX_BYTES,
  wordPreviewPlan,
} from './fileKind';

describe('detectFileKind', () => {
  it('detects by MIME', () => {
    expect(detectFileKind('application/pdf')).toBe('pdf');
    expect(detectFileKind('image/webp')).toBe('image');
    expect(detectFileKind('video/mp4')).toBe('video');
    expect(detectFileKind('audio/mpeg')).toBe('audio');
    expect(detectFileKind('text/plain; charset=utf-8')).toBe('text');
    expect(detectFileKind('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe('docx');
    expect(detectFileKind('application/vnd.ms-excel')).toBe('office');
    expect(detectFileKind('application/msword')).toBe('doc');
    expect(detectFileKind('application/vnd.openxmlformats-officedocument.presentationml.presentation')).toBe('office');
  });

  it('falls back to the extension when MIME is missing or generic', () => {
    expect(detectFileKind(null, 'Смета.PDF')).toBe('pdf');
    expect(detectFileKind('application/octet-stream', 'схема.jpeg')).toBe('image');
    expect(detectFileKind('', 'ролик.mov')).toBe('video');
    expect(detectFileKind(undefined, 'презентация.pptx')).toBe('office');
    expect(detectFileKind(undefined, 'https://x/y/file.mp3?sig=1')).toBe('audio');
    expect(detectFileKind(undefined, 'архив.zip')).toBe('other');
    expect(detectFileKind(undefined, 'без расширения')).toBe('other');
  });

  it('detects Word documents', () => {
    expect(detectFileKind(null, 'Договор.DOCX')).toBe('docx');
    expect(detectFileKind('application/octet-stream', 'шаблон.dotx')).toBe('docx');
    expect(detectFileKind(undefined, 'Старый договор.doc')).toBe('doc');
    expect(detectFileKind('', 'шаблон.dot')).toBe('doc');
    // .docx с типом msword (так отдают некоторые серверы) — всё равно .docx.
    expect(detectFileKind('application/msword', 'Прайс.docx')).toBe('docx');
    expect(detectFileKind('application/msword', 'Прайс')).toBe('doc');
    expect(detectFileKind('application/vnd.ms-word.document.macroEnabled.12', 'x.docm')).toBe('docx');
    expect(detectFileKind(undefined, 'https://s3/x/Инструкция.docx?X-Amz-Signature=1')).toBe('docx');
    // Не Word.
    expect(detectFileKind(undefined, 'docx')).toBe('other');
    expect(detectFileKind(undefined, 'таблица.xlsx')).toBe('office');
  });

  it('sniffs Word format by magic bytes', () => {
    expect(sniffWordFormat([0x50, 0x4b, 0x03, 0x04, 0x14])).toBe('docx');
    expect(sniffWordFormat(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))).toBe('doc');
    expect(sniffWordFormat([0x25, 0x50, 0x44, 0x46])).toBe('unknown');
    expect(sniffWordFormat([0x50, 0x4b])).toBe('unknown');
    expect(sniffWordFormat(null)).toBe('unknown');
  });

  it('plans Word preview', () => {
    expect(wordPreviewPlan('docx', { hasPdfCopy: false })).toBe('render');
    expect(wordPreviewPlan('docx', { hasPdfCopy: true, size: 1000 })).toBe('render');
    expect(wordPreviewPlan('docx', { hasPdfCopy: false, size: WORD_RENDER_MAX_BYTES + 1 })).toBe('fallback');
    expect(wordPreviewPlan('docx', { hasPdfCopy: true, size: WORD_RENDER_MAX_BYTES + 1 })).toBe('pdf-copy');
    expect(wordPreviewPlan('doc', { hasPdfCopy: true })).toBe('pdf-copy');
    expect(wordPreviewPlan('doc', { hasPdfCopy: false })).toBe('fallback');
    expect(wordPreviewPlan('office', { hasPdfCopy: true })).toBe('fallback');
  });

  it('MIME wins over a misleading extension', () => {
    expect(detectFileKind('image/png', 'файл.pdf')).toBe('image');
  });
});

describe('helpers', () => {
  it('extracts extensions', () => {
    expect(fileExtension('a.b.DOCX')).toBe('docx');
    expect(fileExtension('.env')).toBe('');
    expect(fileExtension('name.')).toBe('');
  });
  it('marks inline kinds', () => {
    expect(isInlinePreviewable('pdf')).toBe(true);
    expect(isInlinePreviewable('image')).toBe(true);
    expect(isInlinePreviewable('office')).toBe(false);
    expect(isInlinePreviewable('docx')).toBe(true);
    expect(isInlinePreviewable('doc')).toBe(false);
    expect(isInlinePreviewable('other')).toBe(false);
  });
  it('labels kinds', () => {
    expect(fileKindLabel('pdf', 'x.pdf')).toBe('PDF');
    expect(fileKindLabel('docx', 'x.docx')).toBe('Документ DOCX');
    expect(fileKindLabel('doc', 'x.doc')).toBe('Документ DOC');
    expect(fileKindLabel('other', 'x')).toBe('Файл');
  });
  it('formats sizes', () => {
    expect(formatFileSize(null)).toBe('');
    expect(formatFileSize(512)).toBe('512 Б');
    expect(formatFileSize(2048)).toBe('2 КБ');
    expect(formatFileSize(3.5 * 1024 * 1024)).toBe('3,5 МБ');
    expect(formatFileSize(50 * 1024 * 1024)).toBe('50 МБ');
  });
  it('clamps zoom and wraps indexes', () => {
    expect(clampZoom(0.2)).toBe(1);
    expect(clampZoom(9)).toBe(5);
    expect(clampZoom(2.345)).toBe(2.35);
    expect(stepIndex(0, -1, 3)).toBe(2);
    expect(stepIndex(2, 1, 3)).toBe(0);
    expect(stepIndex(0, 1, 0)).toBe(0);
  });
});
