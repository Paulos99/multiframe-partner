import { useEffect, useRef, useState } from 'react';
import { sniffWordFormat, WORD_RENDER_MAX_BYTES, type FileKind } from './fileKind';
import { wordFitScale, WORD_ZOOM_MAX } from './viewerMath';
import { fixCroppedImages, sanitizeRenderedDoc } from './wordSanitize';
import styles from './FilePreview.module.css';

/**
 * Стили внутри теневого DOM. Документ всегда сверстан страницами, как в Word,
 * а затем целиком уменьшается под ширину окна (transform: scale) — на телефоне
 * видна вся ширина листа, горизонтальной прокрутки нет. На широком экране масштаб 1.
 */
const SHADOW_CSS = `
:host { display: block; height: 100%; }
.mf-scroll { height: 100%; overflow-x: hidden; overflow-y: auto; -webkit-overflow-scrolling: touch; overscroll-behavior: contain; background: var(--cab-subtle, #eef2f1); box-sizing: border-box; padding: 0 0 88px; outline: none; }
.mf-scroll[data-zoomed='true'] { overflow-x: auto; }
.mf-fit { position: relative; overflow: hidden; margin: 0 auto; }
.mf-fit > .mf-docx-wrapper { position: absolute; top: 0; left: 0; width: max-content; transform-origin: 0 0; background: transparent; padding: 24px 16px 24px; box-sizing: border-box; }
.mf-fit > .mf-docx-wrapper > section.mf-docx { box-shadow: 0 2px 12px rgba(0,0,0,.12); margin: 0 auto 24px; color: #111; background: #fff; box-sizing: border-box; overflow: hidden; }
.mf-fit > .mf-docx-wrapper > section.mf-docx:last-child { margin-bottom: 0; }
.mf-scroll a { color: #01644f; }
.mf-phone .mf-fit > .mf-docx-wrapper { padding: 12px 6px; }
.mf-phone .mf-fit > .mf-docx-wrapper > section.mf-docx { margin-bottom: 14px; }
`;

export type WordViewProps = {
  name: string;
  kind: FileKind;
  url: string;
  size?: number | null;
  phone: boolean;
  /** Не получилось отрисовать: окно покажет PDF-копию (если есть) или карточку «Скачать». */
  onFail: (message: string) => void;
};

/**
 * .docx рисуется в браузере библиотекой docx-preview (загружается только при открытии Word).
 * Документ живёт в теневом DOM: его стили не трогают приложение, а наши — документ.
 */
export function WordView({ name, kind, url, size, phone, onFail }: WordViewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'loading' | 'ready'>('loading');
  const [zoom, setZoom] = useState(1);
  const layoutRef = useRef<{ scroll: HTMLElement; fit: HTMLElement; wrapper: HTMLElement | null } | null>(null);
  const zoomRef = useRef(zoom);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);
  const failRef = useRef(onFail);
  useEffect(() => {
    failRef.current = onFail;
  }, [onFail]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    const controller = new AbortController();
    setState('loading');
    (async () => {
      if (size != null && size > WORD_RENDER_MAX_BYTES) throw new Error('Документ слишком большой для просмотра в браузере');
      const response = await fetch(url, { signal: controller.signal, credentials: 'omit' });
      if (!response.ok) throw new Error('Не удалось загрузить документ');
      const buffer = await response.arrayBuffer();
      if (cancelled) return;
      if (buffer.byteLength > WORD_RENDER_MAX_BYTES) throw new Error('Документ слишком большой для просмотра в браузере');
      const format = sniffWordFormat(new Uint8Array(buffer, 0, Math.min(8, buffer.byteLength)));
      if (format === 'doc') throw new Error('Это документ старого формата Word (.doc), браузер его не показывает');
      if (format !== 'docx') throw new Error(kind === 'doc' ? 'Браузер не показывает этот документ' : 'Файл повреждён или это не документ Word');
      const { renderAsync } = await import('docx-preview');
      if (cancelled) return;
      const shadow = host.shadowRoot || host.attachShadow({ mode: 'open' });
      shadow.replaceChildren();
      const base = document.createElement('style');
      base.textContent = SHADOW_CSS;
      const docStyles = document.createElement('div');
      const scroll = document.createElement('div');
      scroll.className = phone ? 'mf-scroll mf-phone' : 'mf-scroll';
      scroll.setAttribute('role', 'document');
      scroll.setAttribute('aria-label', name);
      scroll.tabIndex = 0;
      const fit = document.createElement('div');
      fit.className = 'mf-fit';
      scroll.append(fit);
      shadow.append(base, docStyles, scroll);
      await renderAsync(buffer, fit, docStyles, {
        className: 'mf-docx',
        inWrapper: true,
        ignoreWidth: false,
        ignoreHeight: false,
        breakPages: true,
        ignoreLastRenderedPageBreak: true,
        renderHeaders: true,
        renderFooters: true,
        renderFootnotes: true,
        renderEndnotes: true,
        renderComments: false,
        renderChanges: false,
        // altChunk — вложенный HTML (через iframe). Не показываем: это чужая разметка.
        renderAltChunks: false,
        useBase64URL: true,
        experimental: false,
      });
      if (cancelled) return;
      sanitizeRenderedDoc(shadow);
      fixCroppedImages(shadow);
      layoutRef.current = { scroll, fit, wrapper: fit.querySelector<HTMLElement>(':scope > .mf-docx-wrapper') };
      setState('ready');
    })().catch((error: unknown) => {
      if (cancelled || (error instanceof DOMException && error.name === 'AbortError')) return;
      const message =
        error instanceof Error && error.message && !/fetch|network|cors/i.test(error.message)
          ? error.message
          : 'Не удалось открыть документ';
      failRef.current(message);
    });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [url, size, kind, name, phone]);

  // Подгоняем лист под ширину окна и пересчитываем при повороте/ресайзе и догрузке картинок.
  useEffect(() => {
    const layout = layoutRef.current;
    if (state !== 'ready' || !layout || !layout.wrapper) return;
    const { scroll, fit, wrapper } = layout;
    const apply = () => {
      const naturalW = Math.max(wrapper.offsetWidth, wrapper.scrollWidth);
      const naturalH = Math.max(wrapper.offsetHeight, wrapper.scrollHeight);
      const s = wordFitScale(scroll.clientWidth, naturalW) * zoomRef.current;
      wrapper.style.transform = `scale(${s})`;
      fit.style.width = `${Math.floor(naturalW * s)}px`;
      fit.style.height = `${Math.ceil(naturalH * s)}px`;
      scroll.dataset.zoomed = zoomRef.current > 1 ? 'true' : 'false';
      scroll.dataset.scale = s.toFixed(3);
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(scroll);
    ro.observe(wrapper);
    return () => ro.disconnect();
  }, [state, zoom]);

  const step = (next: number) => setZoom(Math.min(WORD_ZOOM_MAX, Math.max(1, Math.round(next * 100) / 100)));

  return (
    <div className={styles.wordWrap} data-word-state={state}>
      {state === 'loading' ? (
        <div className={styles.skeleton} role="status" aria-label="Открываем документ" data-kind="docx">
          <span className={styles.skelPage}>
            <span />
            <span />
            <span />
            <span />
          </span>
        </div>
      ) : null}
      <div ref={hostRef} className={styles.wordHost} data-testid="word-preview" />
      {state === 'ready' ? (
        <div className={styles.zoomBar} role="group" aria-label="Масштаб">
          <button type="button" onClick={() => step(zoom / 1.25)} disabled={zoom <= 1} aria-label="Уменьшить">
            −
          </button>
          <button type="button" onClick={() => setZoom(1)} aria-label="По ширине" className={styles.zoomValue}>
            {Math.round(zoom * 100)}%
          </button>
          <button type="button" onClick={() => step(zoom * 1.25)} disabled={zoom >= WORD_ZOOM_MAX} aria-label="Увеличить">
            +
          </button>
        </div>
      ) : null}
    </div>
  );
}
