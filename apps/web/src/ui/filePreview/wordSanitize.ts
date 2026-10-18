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
