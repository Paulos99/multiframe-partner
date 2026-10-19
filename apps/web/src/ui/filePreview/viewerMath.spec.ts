import { describe, expect, it } from 'vitest';
import { canvasPixelRatio, clampPdfZoom, fitScale, PDF_MAX_PAGE_WIDTH, wordFitScale } from './viewerMath';

describe('fitScale (PDF по ширине)', () => {
  it('A4 на телефоне 374 px — во всю ширину', () => {
    expect(fitScale(374, 595) * 595).toBeCloseTo(374);
  });
  it('на широком экране не шире предела', () => {
    expect(fitScale(2000, 595) * 595).toBeCloseTo(PDF_MAX_PAGE_WIDTH);
  });
  it('пустые размеры — масштаб 1', () => {
    expect(fitScale(0, 595)).toBe(1);
    expect(fitScale(300, 0)).toBe(1);
  });
});

describe('wordFitScale', () => {
  it('лист Letter 816 px на телефоне 374 px уменьшается', () => {
    expect(wordFitScale(374, 848)).toBeCloseTo(374 / 848);
  });
  it('на компьютере не увеличивает', () => {
    expect(wordFitScale(1100, 848)).toBe(1);
  });
});

describe('clampPdfZoom', () => {
  it('держит 100–400%', () => {
    expect(clampPdfZoom(0.3)).toBe(1);
    expect(clampPdfZoom(9)).toBe(4);
    expect(clampPdfZoom(1.256)).toBe(1.26);
    expect(clampPdfZoom(Number.NaN)).toBe(1);
  });
});

describe('canvasPixelRatio', () => {
  it('обычная страница — плотность экрана', () => {
    expect(canvasPixelRatio(390, 552, 3)).toBe(3);
  });
  it('огромная страница при увеличении ограничена по памяти', () => {
    const r = canvasPixelRatio(1600, 2260, 3);
    expect(1600 * 2260 * r * r).toBeLessThanOrEqual(12_000_001);
  });
});
