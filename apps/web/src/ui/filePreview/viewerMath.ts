/** Чистая математика окна предпросмотра (PDF и Word) — без DOM, покрыта юнит-тестами. */

export const PDF_ZOOM_MIN = 1;
export const PDF_ZOOM_MAX = 4;
/** Шире этого PDF-страница на большом экране не растягивается — читать удобнее. */
export const PDF_MAX_PAGE_WIDTH = 1040;
export const WORD_ZOOM_MAX = 4;

export function clampPdfZoom(value: number): number {
  if (!Number.isFinite(value)) return PDF_ZOOM_MIN;
  return Math.min(PDF_ZOOM_MAX, Math.max(PDF_ZOOM_MIN, Math.round(value * 100) / 100));
}

/** Масштаб PDF «по ширине»: самая широкая страница целиком влезает в контейнер. */
export function fitScale(containerWidth: number, widestPage: number, maxWidth = PDF_MAX_PAGE_WIDTH): number {
  if (!(containerWidth > 0) || !(widestPage > 0)) return 1;
  return Math.min(containerWidth, maxWidth) / widestPage;
}

/** Масштаб листа Word «по ширине»: лист целиком в окне, крупнее 1 не растягиваем. */
export function wordFitScale(available: number, natural: number): number {
  if (!(available > 0) || !(natural > 0)) return 1;
  return Math.min(1, available / natural);
}

/** Плотность пикселей холста: не больше 3 и не больше `maxPixels` на страницу (память телефона). */
export function canvasPixelRatio(cssWidth: number, cssHeight: number, dpr: number, maxPixels = 12_000_000): number {
  const wanted = Math.min(3, Math.max(1, Number.isFinite(dpr) ? dpr : 1));
  const area = Math.max(1, cssWidth * cssHeight);
  const cap = Math.sqrt(maxPixels / area);
  return Math.max(0.25, Math.min(wanted, cap));
}
