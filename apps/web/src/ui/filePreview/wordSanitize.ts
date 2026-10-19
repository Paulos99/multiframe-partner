/**
 * Чистка DOM после отрисовки .docx: документ — чужой файл, в окне не должно
 * оказаться ни скриптов, ни встроенных страниц, ни ссылок javascript:.
 * Работает по уже построенному DOM (docx-preview строит его сам, без innerHTML).
 */

const DROP_TAGS = 'script,iframe,frame,frameset,object,embed,applet,base,meta,link,form,input,button,textarea,select,portal';
const URL_ATTRS = ['href', 'src', 'xlink:href', 'action', 'formaction', 'srcset', 'poster', 'background'];

/** Безопасна ли ссылка: http(s), mailto, tel и якоря. Картинки — ещё data:image/ и blob:. */
export function isSafeDocUrl(value: string, attr: string): boolean {
  const v = value.trim().replace(/[\u0000-\u001f\s]+/g, '').toLowerCase();
  if (!v) return true;
  if (v.startsWith('#')) return true;
  if (/^(https?:|mailto:|tel:)/.test(v)) return true;
  if ((attr === 'src' || attr === 'xlink:href') && /^(data:image\/(png|jpe?g|gif|webp|bmp|svg\+xml|x-emf|x-wmf|tiff)[;,]|blob:)/.test(v)) return true;
  // Относительные ссылки без схемы — безвредны.
  return !/^[a-z][a-z0-9+.-]*:/.test(v);
}

export function sanitizeRenderedDoc(root: ParentNode): number {
  let removed = 0;
  root.querySelectorAll(DROP_TAGS).forEach((el) => {
    el.remove();
    removed += 1;
  });
  root.querySelectorAll('*').forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on') || name === 'srcdoc' || name === 'formaction') {
        el.removeAttribute(attr.name);
        removed += 1;
        continue;
      }
      if (URL_ATTRS.includes(name) && !isSafeDocUrl(attr.value, name)) {
        el.removeAttribute(attr.name);
        removed += 1;
      }
    }
    if (el.tagName === 'A' && el.getAttribute('href') && !el.getAttribute('href')!.startsWith('#')) {
      el.setAttribute('target', '_blank');
      el.setAttribute('rel', 'noopener noreferrer nofollow');
    }
  });
  // Стили документа: выкидываем url(javascript:…) и expression() (старый IE), остальное оставляем.
  root.querySelectorAll('style').forEach((style) => {
    const css = style.textContent || '';
    const clean = css.replace(/url\(\s*['"]?\s*javascript:[^)]*\)/gi, 'none').replace(/expression\s*\(/gi, 'none(');
    if (clean !== css) style.textContent = clean;
  });
  return removed;
}

/**
 * Обрезанная в Word картинка (srcRect). docx-preview рисует её через clip-path + transform,
 * и масштаб идёт от центра — картинка съезжает и наезжает на текст ниже. Переводим
 * в честную обрезку: контейнер с overflow:hidden, картинка нужного размера со сдвигом.
 * Возвращает число исправленных картинок.
 */
export function fixCroppedImages(root: ParentNode): number {
  let fixed = 0;
  root.querySelectorAll<HTMLImageElement>('img').forEach((img) => {
    const clip = img.style.clipPath || img.style.getPropertyValue('clip-path');
    const m = /rect\(\s*([\d.]+)%\s+([\d.]+)%\s+([\d.]+)%\s+([\d.]+)%\s*\)/.exec(clip || '');
    const box = img.parentElement;
    if (!m || !box) return;
    const [top, right, bottom, left] = m.slice(1, 5).map((v) => Number(v) / 100) as [number, number, number, number];
    const w = right - left;
    const h = bottom - top;
    if (!(w > 0.01 && h > 0.01 && w <= 1 && h <= 1)) return;
    box.style.overflow = 'hidden';
    if (!box.style.position || box.style.position === 'static') box.style.position = 'relative';
    img.style.clipPath = '';
    img.style.removeProperty('clip-path');
    img.style.transform = '';
    img.style.position = 'absolute';
    img.style.maxWidth = 'none';
    img.style.width = `${(100 / w).toFixed(4)}%`;
    img.style.height = `${(100 / h).toFixed(4)}%`;
    img.style.left = `${(-(left / w) * 100).toFixed(4)}%`;
    img.style.top = `${(-(top / h) * 100).toFixed(4)}%`;
    fixed += 1;
  });
  return fixed;
}
