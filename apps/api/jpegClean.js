/**
 * Разбор JPEG без внешних библиотек.
 * Нужны две вещи: убрать метаданные (EXIF с GPS, XMP, комментарии) и узнать размер кадра.
 * Клиент и так перекодирует снимок через canvas, а это второй рубеж на сервере.
 */

const SOF_MARKERS = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

/** Сегменты, которые остаются: JFIF (E0) и Adobe (EE) нужны для цвета. Остальные APPn и COM убираем. */
function keepSegment(marker) {
  if (marker >= 0xe1 && marker <= 0xef) return marker === 0xee;
  if (marker === 0xfe) return false;
  return true;
}

export function looksLikeJpeg(buf) {
  return Buffer.isBuffer(buf) && buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
}

/**
 * @returns {{ buffer: Buffer, width: number, height: number, stripped: number } | null}
 * null — файл не похож на целый JPEG.
 */
export function cleanJpeg(input) {
  if (!looksLikeJpeg(input)) return null;
  const out = [input.subarray(0, 2)];
  let pos = 2;
  let width = 0;
  let height = 0;
  let stripped = 0;
  let sawScan = false;
  while (pos < input.length) {
    if (input[pos] !== 0xff) return null;
    while (input[pos] === 0xff && pos < input.length) pos += 1;
    const marker = input[pos];
    pos += 1;
    if (marker === 0xd9) {
      out.push(Buffer.from([0xff, 0xd9]));
      pos = input.length;
      break;
    }
    if (marker === 0x00 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      out.push(Buffer.from([0xff, marker]));
      continue;
    }
    if (pos + 2 > input.length) return null;
    const length = input.readUInt16BE(pos);
    if (length < 2 || pos + length > input.length) return null;
    const segment = input.subarray(pos - 2, pos + length);
    if (SOF_MARKERS.has(marker)) {
      if (length < 8) return null;
      height = input.readUInt16BE(pos + 3);
      width = input.readUInt16BE(pos + 5);
    }
    if (marker === 0xda) {
      // Дальше идут сжатые данные до конца файла; их копируем как есть.
      out.push(input.subarray(pos - 2));
      sawScan = true;
      pos = input.length;
      break;
    }
    if (keepSegment(marker)) out.push(segment);
    else stripped += segment.length;
    pos += length;
  }
  if (!sawScan || !width || !height) return null;
  return { buffer: Buffer.concat(out), width, height, stripped };
}

/** Есть ли в файле сегмент APP1 (EXIF, XMP). Для проверок. */
export function hasExifSegment(buf) {
  if (!looksLikeJpeg(buf)) return false;
  let pos = 2;
  while (pos + 4 <= buf.length) {
    if (buf[pos] !== 0xff) return false;
    const marker = buf[pos + 1];
    if (marker === 0xda || marker === 0xd9) return false;
    const length = buf.readUInt16BE(pos + 2);
    if (marker === 0xe1) return true;
    pos += 2 + length;
  }
  return false;
}
