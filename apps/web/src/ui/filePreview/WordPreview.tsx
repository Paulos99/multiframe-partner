import { useEffect, useRef, useState } from 'react';
import { sniffWordFormat, WORD_RENDER_MAX_BYTES, type FileKind } from './fileKind';
import { sanitizeRenderedDoc } from './wordSanitize';
import styles from './FilePreview.module.css';

/** Стили внутри теневого DOM: страницы как в Word на десктопе, текст по ширине экрана на телефоне. */
const SHADOW_CSS = `
:host { display: block; height: 100%; }
.mf-scroll { height: 100%; overflow: auto; -webkit-overflow-scrolling: touch; overscroll-behavior: contain; background: var(--cab-subtle, #eef2f1); }
.mf-scroll .mf-docx-wrapper { background: transparent; padding: 24px 16px 48px; }
.mf-scroll .mf-docx-wrapper > section.mf-docx { box-shadow: 0 2px 12px rgba(0,0,0,.12); margin: 0 auto 24px; color: #111; background: #fff; max-width: 100%; box-sizing: border-box; }
.mf-scroll img, .mf-scroll svg { max-width: 100%; height: auto; }
.mf-scroll table { max-width: 100%; }
.mf-scroll a { color: #01644f; }
.mf-phone .mf-docx-wrapper { padding: 8px 0 32px; }
.mf-phone .mf-docx-wrapper > section.mf-docx { padding: 20px 16px !important; min-height: 0 !important; width: auto !important; margin: 0 0 8px; box-shadow: none; }
.mf-phone section.mf-docx { font-size: 15px; overflow-wrap: anywhere; }
.mf-phone section.mf-docx table { display: block; overflow-x: auto; }
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
      shadow.append(base, docStyles, scroll);
      await renderAsync(buffer, scroll, docStyles, {
        className: 'mf-docx',
        inWrapper: true,
        ignoreWidth: phone,
        ignoreHeight: phone,
        breakPages: !phone,
        ignoreLastRenderedPageBreak: true,
        renderHeaders: !phone,
        renderFooters: !phone,
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
    </div>
  );
}
