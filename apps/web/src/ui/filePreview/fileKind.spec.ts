import { describe, expect, it } from 'vitest';
import {
  clampZoom,
  detectFileKind,
  fileExtension,
  fileKindLabel,
  formatFileSize,
  isInlinePreviewable,
  stepIndex,
} from './fileKind';

describe('detectFileKind', () => {
  it('detects by MIME', () => {
    expect(detectFileKind('application/pdf')).toBe('pdf');
    expect(detectFileKind('image/webp')).toBe('image');
    expect(detectFileKind('video/mp4')).toBe('video');
    expect(detectFileKind('audio/mpeg')).toBe('audio');
    expect(detectFileKind('text/plain; charset=utf-8')).toBe('text');
    expect(detectFileKind('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe('office');
    expect(detectFileKind('application/vnd.ms-excel')).toBe('office');
    expect(detectFileKind('application/msword')).toBe('office');
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
    expect(isInlinePreviewable('other')).toBe(false);
  });
  it('labels kinds', () => {
    expect(fileKindLabel('pdf', 'x.pdf')).toBe('PDF');
    expect(fileKindLabel('office', 'x.docx')).toBe('Документ DOCX');
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
