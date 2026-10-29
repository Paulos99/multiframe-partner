/**
 * Подготовка фото к отправке: уменьшение и сжатие в браузере.
 * Снимок рисуется на canvas и сохраняется заново как JPEG. Так из файла пропадают EXIF, в том числе
 * координаты GPS; поворот телефона применяется до рисования. Сервер вырезает метаданные ещё раз.
 */

export const IMAGE_MAX_SIDE = 1600;
export const THUMB_MAX_SIDE = 480;
const IMAGE_QUALITY = 0.8;
const THUMB_QUALITY = 0.72;
/** Сервер принимает фото до 1,8 МБ; при превышении сжимаем сильнее. */
const IMAGE_MAX_BYTES = 1_500_000;

export type PreparedImage = {
  image: string;
  thumb: string;
  width: number;
  height: number;
  /** Размер основного файла, байт. */
  bytes: number;
};

/** Вписывает размеры в квадрат max × max, не увеличивая маленькие снимки. */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (!(longest > 0)) return { width: 1, height: 1 };
  const scale = Math.min(1, max / longest);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export class PhotoPrepError extends Error {}

type Source = { source: CanvasImageSource; width: number; height: number; release: () => void };

async function decode(file: File): Promise<Source> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
    } catch {
      /* ниже — через img */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return {
      source: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      release: () => URL.revokeObjectURL(url),
    };
  } catch {
    URL.revokeObjectURL(url);
    throw new PhotoPrepError('Не удалось открыть фото. Выберите снимок в формате JPEG или PNG.');
  }
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new PhotoPrepError('Не удалось сжать фото'))),
      'image/jpeg',
      quality,
    );
  });
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new PhotoPrepError('Не удалось прочитать фото'));
    reader.onload = () => {
      const text = String(reader.result || '');
      resolve(text.slice(text.indexOf(',') + 1));
    };
    reader.readAsDataURL(blob);
  });
}

function draw(src: Source, size: { width: number; height: number }): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new PhotoPrepError('Не удалось подготовить фото');
  // Белая подложка: у PNG с прозрачностью иначе получится чёрный фон.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size.width, size.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src.source, 0, 0, size.width, size.height);
  return canvas;
}

/** Файл с камеры или из галереи → основной снимок (до 1600 px) и миниатюра (до 480 px), оба JPEG в base64. */
export async function prepareImage(file: File): Promise<PreparedImage> {
  if (file.type && !file.type.startsWith('image/')) {
    throw new PhotoPrepError('Это не фото. Выберите снимок.');
  }
  const src = await decode(file);
  try {
    let side = IMAGE_MAX_SIDE;
    let quality = IMAGE_QUALITY;
    let size = fitWithin(src.width, src.height, side);
    let blob = await toBlob(draw(src, size), quality);
    for (let attempt = 0; attempt < 4 && blob.size > IMAGE_MAX_BYTES; attempt += 1) {
      quality = Math.max(0.5, quality - 0.1);
      if (attempt >= 1) side = Math.round(side * 0.8);
      size = fitWithin(src.width, src.height, side);
      blob = await toBlob(draw(src, size), quality);
    }
    const thumbSize = fitWithin(src.width, src.height, THUMB_MAX_SIDE);
    const thumbBlob = await toBlob(draw(src, thumbSize), THUMB_QUALITY);
    return {
      image: await blobToBase64(blob),
      thumb: await blobToBase64(thumbBlob),
      width: size.width,
      height: size.height,
      bytes: blob.size,
    };
  } finally {
    src.release();
  }
}
