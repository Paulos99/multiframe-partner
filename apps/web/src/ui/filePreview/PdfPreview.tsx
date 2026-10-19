import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { loadPdfJs, pdfDocumentOptions } from './pdfjsLoader';
import { canvasPixelRatio, clampPdfZoom, fitScale, PDF_ZOOM_MAX, PDF_ZOOM_MIN } from './viewerMath';
import styles from './FilePreview.module.css';

const PAGE_GAP = 12;

type PageSize = { w: number; h: number };

export type PdfViewProps = {
  name: string;
  url: string;
  /** PDF не открылся: окно покажет карточку со «Скачать». */
  onFail: (message: string) => void;
};

/**
 * PDF через pdf.js на холстах: и на телефоне, где браузер не умеет показывать PDF
 * внутри страницы, и на компьютере. Страницы по ширине окна, лента с прокруткой,
 * масштаб кнопками, щипком и Ctrl+колесо, счётчик страниц.
 */
export function PdfView({ name, url, onFail }: PdfViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  const failRef = useRef(onFail);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [sizes, setSizes] = useState<PageSize[]>([]);
  const [progress, setProgress] = useState<number | null>(null);
  const [width, setWidth] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [current, setCurrent] = useState(1);
  const [near, setNear] = useState<Set<number>>(() => new Set([0, 1]));
  const anchor = useRef<{ fx: number; fy: number; vx: number; vy: number } | null>(null);
  const pinch = useRef<{ dist: number; zoom: number; fx: number; fy: number; vx: number; vy: number; ratio: number } | null>(null);

  useEffect(() => {
    failRef.current = onFail;
  }, [onFail]);
  const zoomRef = useRef(zoom);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  // Загрузка документа.
  useEffect(() => {
    let cancelled = false;
    let destroyTask: (() => void) | null = null;
    setDoc(null);
    setSizes([]);
    setProgress(null);
    (async () => {
      const pdfjs = await loadPdfJs();
      if (cancelled) return;
      const task = pdfjs.getDocument({ url, ...pdfDocumentOptions() });
      destroyTask = () => void task.destroy();
      task.onProgress = ({ loaded: done, total }: { loaded: number; total: number }) => {
        if (!cancelled && total > 0) setProgress(Math.min(99, Math.floor((done / total) * 100)));
      };
      const pdf = await task.promise;
      if (cancelled) return;
      const first = await pdf.getPage(1);
      const vp = first.getViewport({ scale: 1 });
      if (cancelled) return;
      const base: PageSize = { w: vp.width, h: vp.height };
      setSizes(Array.from({ length: pdf.numPages }, () => base));
      setDoc(pdf);
      // Реальные размеры остальных страниц — в фоне, одним обновлением.
      if (pdf.numPages > 1) {
        const all: PageSize[] = [base];
        for (let n = 2; n <= pdf.numPages; n += 1) {
          const page = await pdf.getPage(n);
          if (cancelled) return;
          const v = page.getViewport({ scale: 1 });
          all.push({ w: v.width, h: v.height });
        }
        if (all.some((s) => s.w !== base.w || s.h !== base.h)) setSizes(all);
      }
    })().catch((error: unknown) => {
      if (cancelled) return;
      const name = error && typeof error === 'object' && 'name' in error ? String((error as { name: unknown }).name) : '';
      failRef.current(
        name === 'PasswordException'
          ? 'PDF защищён паролем, в браузере его не открыть'
          : name === 'InvalidPDFException'
            ? 'Файл повреждён или это не PDF'
            : 'Не удалось открыть PDF',
      );
    });
    return () => {
      cancelled = true;
      destroyTask?.();
    };
  }, [url]);

  // Ширина области просмотра.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => {
      const style = getComputedStyle(el);
      const pad = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
      setWidth(Math.max(0, Math.floor(el.clientWidth - pad)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const widest = sizes.reduce((max, s) => Math.max(max, s.w), 0);
  const scale = fitScale(width, widest) * zoom;
  const ready = !!doc && width > 0 && sizes.length > 0;

  // После смены масштаба держим на месте точку, которая была под пальцами/в центре.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const a = anchor.current;
    if (!el || !a) return;
    anchor.current = null;
    el.scrollLeft = a.fx * el.scrollWidth - a.vx;
    el.scrollTop = a.fy * el.scrollHeight - a.vy;
  }, [scale]);

  const applyZoom = useCallback((next: number, focus?: { x: number; y: number }) => {
    const el = scrollRef.current;
    const z = clampPdfZoom(next);
    if (el) {
      const rect = el.getBoundingClientRect();
      const vx = focus ? focus.x - rect.left : el.clientWidth / 2;
      const vy = focus ? focus.y - rect.top : el.clientHeight / 2;
      anchor.current = {
        fx: (el.scrollLeft + vx) / Math.max(1, el.scrollWidth),
        fy: (el.scrollTop + vy) / Math.max(1, el.scrollHeight),
        vx,
        vy,
      };
    }
    setZoom(z);
  }, []);

  // Какие страницы рядом с экраном — только их держим отрисованными.
  useEffect(() => {
    const root = scrollRef.current;
    const host = pagesRef.current;
    if (!root || !host || !ready) return;
    const io = new IntersectionObserver(
      (entries) => {
        setNear((prev) => {
          const next = new Set(prev);
          for (const entry of entries) {
            const index = Number((entry.target as HTMLElement).dataset.index);
            if (entry.isIntersecting) next.add(index);
            else next.delete(index);
          }
          return next;
        });
      },
      { root, rootMargin: '150% 0px 150% 0px' },
    );
    host.querySelectorAll<HTMLElement>('[data-index]').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [ready, sizes.length]);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    const host = pagesRef.current;
    if (!el || !host) return;
    const probe = el.scrollTop + el.clientHeight * 0.35;
    const pages = host.children;
    let page = 1;
    for (let i = 0; i < pages.length; i += 1) {
      if ((pages[i] as HTMLElement).offsetTop <= probe) page = i + 1;
      else break;
    }
    setCurrent(page);
  }, []);

  // Ctrl+колесо (и щипок тачпада) — масштаб; обычная прокрутка не трогается.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      setZoom((z) => {
        const next = clampPdfZoom(z * (event.deltaY < 0 ? 1.12 : 1 / 1.12));
        if (next !== z) {
          const rect = el.getBoundingClientRect();
          const vx = event.clientX - rect.left;
          const vy = event.clientY - rect.top;
          anchor.current = {
            fx: (el.scrollLeft + vx) / Math.max(1, el.scrollWidth),
            fy: (el.scrollTop + vy) / Math.max(1, el.scrollHeight),
            vx,
            vy,
          };
        }
        return next;
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Щипок двумя пальцами: пока пальцы на экране — CSS-масштаб, на отпускании — перерисовка.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const dist = (t: TouchList) => Math.hypot(t[0]!.clientX - t[1]!.clientX, t[0]!.clientY - t[1]!.clientY);
    const onStart = (event: TouchEvent) => {
      if (event.touches.length !== 2) return;
      const rect = el.getBoundingClientRect();
      const vx = (event.touches[0]!.clientX + event.touches[1]!.clientX) / 2 - rect.left;
      const vy = (event.touches[0]!.clientY + event.touches[1]!.clientY) / 2 - rect.top;
      pinch.current = {
        dist: Math.max(1, dist(event.touches)),
        zoom: zoomRef.current,
        fx: el.scrollLeft + vx,
        fy: el.scrollTop + vy,
        vx,
        vy,
        ratio: 1,
      };
    };
    const onMove = (event: TouchEvent) => {
      const p = pinch.current;
      if (!p || event.touches.length !== 2) return;
      event.preventDefault();
      const target = clampPdfZoom(p.zoom * (dist(event.touches) / p.dist));
      p.ratio = target / p.zoom;
      const host = pagesRef.current;
      if (host) {
        host.style.transformOrigin = `${p.fx}px ${p.fy}px`;
        host.style.transform = `scale(${p.ratio})`;
      }
    };
    const onEnd = (event: TouchEvent) => {
      const p = pinch.current;
      if (!p || event.touches.length >= 2) return;
      pinch.current = null;
      const host = pagesRef.current;
      if (host) {
        host.style.transform = '';
        host.style.transformOrigin = '';
      }
      const next = clampPdfZoom(p.zoom * p.ratio);
      if (next === zoomRef.current) return;
      anchor.current = {
        fx: p.fx / Math.max(1, el.scrollWidth),
        fy: p.fy / Math.max(1, el.scrollHeight),
        vx: p.vx,
        vy: p.vy,
      };
      setZoom(next);
    };
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, []);

  const total = sizes.length;
  return (
    <div className={styles.pdfWrap} data-pdf-state={ready ? 'ready' : 'loading'}>
      {!ready ? (
        <div className={styles.skeleton} role="status" aria-label="Загружаем PDF" data-kind="pdf">
          <span className={styles.skelPage}>
            <span />
            <span />
            <span />
            <span />
          </span>
          {progress != null ? <span className={styles.skelProgress}>{progress}%</span> : null}
        </div>
      ) : null}
      <div
        ref={scrollRef}
        className={styles.pdfScroll}
        data-testid="pdf-preview"
        data-zoomed={zoom > 1 ? 'true' : 'false'}
        role="document"
        aria-label={name}
        tabIndex={0}
        onScroll={onScroll}
        onDoubleClick={(event) => applyZoom(zoom > 1 ? 1 : 2, { x: event.clientX, y: event.clientY })}
      >
        <div ref={pagesRef} className={styles.pdfPages}>
          {ready
            ? sizes.map((size, index) => (
                <PdfPage
                  key={index}
                  doc={doc}
                  index={index}
                  width={Math.floor(size.w * scale)}
                  height={Math.floor(size.h * scale)}
                  scale={scale}
                  active={near.has(index)}
                />
              ))
            : null}
        </div>
      </div>
      {ready ? (
        <>
          <span className={styles.pdfCounter} data-testid="pdf-page-counter" aria-live="polite">
            {current} / {total}
          </span>
          <div className={styles.zoomBar} role="group" aria-label="Масштаб">
            <button type="button" onClick={() => applyZoom(zoom / 1.25)} disabled={zoom <= PDF_ZOOM_MIN} aria-label="Уменьшить">
              −
            </button>
            <button type="button" onClick={() => applyZoom(1)} aria-label="По ширине" className={styles.zoomValue}>
              {Math.round(zoom * 100)}%
            </button>
            <button type="button" onClick={() => applyZoom(zoom * 1.25)} disabled={zoom >= PDF_ZOOM_MAX} aria-label="Увеличить">
              +
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

/** Одна страница: холст рисуется, пока страница рядом с экраном; при смене масштаба старый кадр держится до готовности нового. */
function PdfPage({
  doc,
  index,
  width,
  height,
  scale,
  active,
}: {
  doc: PDFDocumentProxy;
  index: number;
  width: number;
  height: number;
  scale: number;
  active: boolean;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [drawn, setDrawn] = useState(false);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    if (!active) {
      box.querySelector('canvas')?.remove();
      setDrawn(false);
      return;
    }
    let task: RenderTask | null = null;
    let cancelled = false;
    // Небольшая пауза: пока жмут «+» или щиплют, не рисуем промежуточные масштабы.
    const timer = window.setTimeout(async () => {
      try {
        const page = await doc.getPage(index + 1);
        if (cancelled) return;
        const viewport = page.getViewport({ scale });
        const ratio = canvasPixelRatio(viewport.width, viewport.height, window.devicePixelRatio || 1);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.floor(viewport.width * ratio));
        canvas.height = Math.max(1, Math.floor(viewport.height * ratio));
        canvas.setAttribute('aria-hidden', 'true');
        canvas.className = styles.pdfCanvas!;
        task = page.render({
          canvas,
          viewport,
          transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined,
        });
        await task.promise;
        if (cancelled) return;
        box.querySelector('canvas')?.remove();
        box.append(canvas);
        setDrawn(true);
      } catch (error) {
        if (error && typeof error === 'object' && 'name' in error && (error as { name: string }).name === 'RenderingCancelledException') return;
        // Ошибку одной страницы показываем пустым листом, остальные страницы живут.
      }
    }, 60);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      task?.cancel();
    };
  }, [doc, index, scale, active]);

  return (
    <div
      ref={boxRef}
      className={styles.pdfPage}
      data-index={index}
      data-drawn={drawn ? 'true' : 'false'}
      aria-label={`Страница ${index + 1}`}
      style={{ width, height, marginBottom: PAGE_GAP }}
    />
  );
}
