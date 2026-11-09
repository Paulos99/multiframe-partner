import type { FeedbackContext } from '../../../../packages/shared/feedback.js';

/** Короткое описание устройства по строке браузера: «Телефон · Android · Chrome». Без внешних библиотек. */
export function describeDevice(ua: string, touchPoints = 0): string {
  const s = ua || '';
  let os = 'Другая система';
  if (/iPhone|iPod/.test(s)) os = 'iOS';
  else if (/iPad/.test(s) || (/Macintosh/.test(s) && touchPoints > 1)) os = 'iPadOS';
  else if (/Android/.test(s)) os = 'Android';
  else if (/Windows/.test(s)) os = 'Windows';
  else if (/Mac OS X|Macintosh/.test(s)) os = 'macOS';
  else if (/Linux|X11/.test(s)) os = 'Linux';

  let browser = 'браузер';
  if (/YaBrowser\//.test(s)) browser = 'Яндекс Браузер';
  else if (/Edg\//.test(s)) browser = 'Edge';
  else if (/OPR\/|Opera/.test(s)) browser = 'Opera';
  else if (/SamsungBrowser\//.test(s)) browser = 'Samsung Internet';
  else if (/Firefox\/|FxiOS\//.test(s)) browser = 'Firefox';
  else if (/Chrome\/|CriOS\//.test(s)) browser = 'Chrome';
  else if (/Safari\//.test(s)) browser = 'Safari';

  let kind = 'Компьютер';
  if (os === 'iPadOS' || (/Android/.test(s) && !/Mobile/.test(s)) || /Tablet/.test(s)) kind = 'Планшет';
  else if (/Mobi|iPhone|iPod/.test(s)) kind = 'Телефон';
  return `${kind} · ${os} · ${browser}`;
}

/** Номер сборки из бандла (на боевом — метка выпуска, например v1.1.0). */
export function appVersion(): string {
  return typeof __BUILD_ID__ === 'string' && __BUILD_ID__ ? __BUILD_ID__ : 'локальная';
}

/** Название открытого раздела: пункт меню кабинета и выбранные вкладки внутри, по порядку. */
function activeSection(doc: Document): string {
  const names: string[] = [];
  const add = (raw: string | null | undefined) => {
    const text = (raw || '').replace(/\s+/g, ' ').trim();
    if (text && !names.includes(text) && names.length < 3) names.push(text);
  };
  // У пункта меню последний span — короткое имя без счётчика.
  const navItem = doc.querySelector('#cab-sections [aria-selected="true"], #cab-sections [aria-pressed="true"]');
  if (navItem) add(navItem.lastElementChild?.textContent || navItem.textContent);
  doc.querySelectorAll('[role="tab"][aria-selected="true"]').forEach((el) => {
    if (!el.closest('#cab-sections, dialog')) add(el.textContent);
  });
  return names.join(' → ') || doc.title || '';
}

/** Всё, что админу нужно, чтобы повторить ошибку. Компанию, сотрудника и время ставит сервер. */
export function collectFeedbackContext(win: Window = window): FeedbackContext {
  const nav = win.navigator;
  const ua = nav.userAgent || '';
  return {
    page: `${win.location.pathname}${win.location.hash}`,
    pageTitle: activeSection(win.document),
    device: `${describeDevice(ua, nav.maxTouchPoints || 0)} — ${ua}`,
    screen: `${win.innerWidth}×${win.innerHeight}`,
    appVersion: appVersion(),
    online: typeof nav.onLine === 'boolean' ? nav.onLine : null,
  };
}
