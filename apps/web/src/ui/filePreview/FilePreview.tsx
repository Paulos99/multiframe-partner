import {
  Component,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type WheelEvent as ReactWheelEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { useDragControls } from 'motion/react';
import { AnimatePresence, EASE, m, motionPresets, usePrefersReducedMotion } from '../../partner/motionBits';
import {
  clampZoom,
  detectFileKind,
  fileKindLabel,
  formatFileSize,
  isInlinePreviewable,
  stepIndex,
  wordPreviewPlan,
  ZOOM_MAX,
  type FileKind,
} from './fileKind';
// Просмотр Word (вместе с docx-preview) грузится только при открытии документа.
const WordView = lazy(() => import('./WordPreview').then((mod) => ({ default: mod.WordView })));
// PDF рисует pdf.js на холстах (мобильный браузер не показывает PDF во iframe). Тоже лениво.
const PdfView = lazy(() => import('./PdfPreview').then((mod) => ({ default: mod.PdfView })));
import {
  closeFilePreview,
  getFilePreviewState,
  setFilePreviewIndex,
  subscribeFilePreview,
  type PdfCopySource,
  type PreviewItem,
  type PreviewSource,
} from './previewStore';
import styles from './FilePreview.module.css';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon as CloseGlyph,
  DownloadIcon as DownloadGlyph,
  ExternalIcon as ExternalGlyph,
} from '../../icons';

type Resolved =
  | { status: 'loading' }
  | { status: 'error'; message: string; url?: string; mime?: string | null }
  | {
      status: 'ready';
      url?: string;
      mime?: string | null;
      size?: number | null;
      node?: ReactNode;
      /** PDF-копия для просмотра (.doc и запасной вариант для .docx). */
      pdfCopyUrl?: string;
      /** Видео: лёгкая копия для плеера; url остаётся оригиналом для «Скачать». */
      playbackUrl?: string;
      poster?: string | null;
    };

const PHONE_QUERY = '(max-width: 640px)';

function usePhone(): boolean {
  const [phone, setPhone] = useState(
    () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(PHONE_QUERY).matches,
  );
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia(PHONE_QUERY);
    const on = () => setPhone(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return phone;
}

/** Хост окна предпросмотра. Один на приложение; открывается через openFilePreview(). */
export function FilePreviewHost() {
  const state = useSyncExternalStore(subscribeFilePreview, getFilePreviewState, () => null);
  if (typeof document === 'undefined') return null;
  return createPortal(
    <AnimatePresence>{state ? <FilePreviewDialog key={state.openedAt} items={state.items} index={state.index} /> : null}</AnimatePresence>,
    document.body,
  );
}

/** Подгружает источник файла и превращает Blob в ссылку; ссылки blob: отзываются при закрытии. */
function useResolvedSources(items: PreviewItem[]) {
  const cache = useRef(new Map<string, Resolved>());
  const owned = useRef<string[]>([]);
  const [, force] = useState(0);
  const loading = useRef(new Set<string>());

  const resolve = useCallback((item: PreviewItem | undefined) => {
    if (!item || cache.current.has(item.id) || loading.current.has(item.id)) return;
    const copyUrl = (copy: PdfCopySource | undefined): string | undefined => {
      if (!copy) return undefined;
      if ('url' in copy) return copy.url;
      const url = URL.createObjectURL(copy.blob);
      owned.current.push(url);
      return url;
    };
    const fromSource = (src: PreviewSource): Resolved => {
      if ('node' in src) return { status: 'ready', node: src.node };
      if ('blob' in src) {
        const url = URL.createObjectURL(src.blob);
        owned.current.push(url);
        return {
          status: 'ready',
          url,
          mime: src.mime || src.blob.type || item.mime,
          size: src.blob.size,
          pdfCopyUrl: copyUrl(src.pdfCopy),
        };
      }
      return {
        status: 'ready',
        url: src.url,
        mime: src.mime || item.mime,
        size: src.size ?? item.size,
        pdfCopyUrl: copyUrl(src.pdfCopy),
        playbackUrl: src.playbackUrl,
        poster: src.poster ?? null,
      };
    };
    if (item.source) {
      cache.current.set(item.id, fromSource(item.source));
      force((n) => n + 1);
      return;
    }
    if (!item.load) {
      cache.current.set(item.id, { status: 'error', message: 'У файла нет содержимого' });
      force((n) => n + 1);
      return;
    }
    loading.current.add(item.id);
    item
      .load()
      .then((src) => cache.current.set(item.id, fromSource(src)))
      .catch((e: unknown) =>
        cache.current.set(item.id, {
          status: 'error',
          message: e instanceof Error && e.message ? e.message : 'Не удалось загрузить файл',
        }),
      )
      .finally(() => {
        loading.current.delete(item.id);
        force((n) => n + 1);
      });
  }, []);

  useEffect(() => {
    const urls = owned.current;
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const get = (item: PreviewItem | undefined): Resolved =>
    (item && cache.current.get(item.id)) || { status: 'loading' };
  const fail = (item: PreviewItem, message: string) => {
    const prev = cache.current.get(item.id);
    const url = prev && 'url' in prev ? prev.url : undefined;
    const mime = prev && 'mime' in prev ? prev.mime : undefined;
    cache.current.set(item.id, { status: 'error', message, url, mime });
    force((n) => n + 1);
  };
  return { resolve, get, fail, itemsKey: items.map((i) => i.id).join('|') };
}

/** Ленивый просмотрщик не догрузился (нет сети, новая версия сайта) — показываем запасной вариант, а не белый экран. */
class ViewerBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select, textarea, iframe, video[controls], audio[controls], [tabindex]:not([tabindex="-1"])';

function FilePreviewDialog({ items, index }: { items: PreviewItem[]; index: number }) {
  const reduce = usePrefersReducedMotion();
  const phone = usePhone();
  const dragControls = useDragControls();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const item = items[index]!;
  const { resolve, get, fail } = useResolvedSources(items);
  const resolved = get(item);
  const kind: FileKind = detectFileKind(
    (resolved.status !== 'loading' && 'mime' in resolved && resolved.mime) || item.mime,
    item.name,
  );
  const multiple = items.length > 1;

  useEffect(() => {
    resolve(item);
    if (multiple) {
      // Соседние файлы подгружаем заранее, чтобы стрелки листали без ожидания.
      resolve(items[stepIndex(index, 1, items.length)]);
    }
  }, [item, items, index, multiple, resolve]);

  // Фокус внутрь окна, возврат фокуса и блокировка прокрутки страницы.
  useLayoutEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const root = document.documentElement;
    const prevOverflow = root.style.overflow;
    root.style.overflow = 'hidden';
    closeRef.current?.focus({ preventScroll: true });
    return () => {
      root.style.overflow = prevOverflow;
      if (previous && previous.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);

  const go = useCallback(
    (delta: number) => {
      if (!multiple) return;
      setFilePreviewIndex(stepIndex(index, delta, items.length));
    },
    [index, items.length, multiple],
  );

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      closeFilePreview();
      return;
    }
    const target = event.target as HTMLElement;
    const inMedia = target.tagName === 'VIDEO' || target.tagName === 'AUDIO' || target.tagName === 'INPUT';
    if (!inMedia && (event.key === 'ArrowRight' || event.key === 'ArrowLeft') && multiple) {
      event.preventDefault();
      go(event.key === 'ArrowRight' ? 1 : -1);
      return;
    }
    if (event.key === 'Tab') {
      const nodes = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) || []).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (!nodes.length) return;
      const first = nodes[0]!;
      const last = nodes[nodes.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }

  const url = resolved.status !== 'loading' && 'url' in resolved ? resolved.url : undefined;
  const size = resolved.status === 'ready' ? (resolved.size ?? item.size) : item.size;
  const meta = [fileKindLabel(kind, item.name), formatFileSize(size), multiple ? `${index + 1} из ${items.length}` : '']
    .filter(Boolean)
    .join(' · ');

  return (
    <m.div
      className={styles.overlay}
      data-lenis-prevent
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0 }}
      transition={reduce ? { duration: 0 } : { duration: 0.24, ease: EASE }}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) closeFilePreview();
      }}
    >
      <m.div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label={`Просмотр: ${item.name}`}
        data-file-kind={kind}
        onKeyDown={onKeyDown}
        initial={reduce ? false : phone ? { y: 32, opacity: 0 } : motionPresets.modal.initial}
        animate={phone ? { y: 0, opacity: 1 } : motionPresets.modal.animate}
        exit={reduce ? undefined : phone ? { y: 48, opacity: 0 } : motionPresets.modal.exit}
        transition={reduce ? { duration: 0 } : motionPresets.transition}
        drag={phone ? 'y' : false}
        dragListener={false}
        dragControls={dragControls}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.7 }}
        onDragEnd={(_, info) => {
          if (info.offset.y > 120 || info.velocity.y > 700) closeFilePreview();
        }}
      >
        <header
          className={styles.head}
          onPointerDown={(event) => {
            if (!phone) return;
            if ((event.target as HTMLElement).closest('a,button')) return;
            dragControls.start(event);
          }}
        >
          {phone ? <span className={styles.grabber} aria-hidden="true" /> : null}
          <div className={styles.title}>
            <h2 title={item.name}>{item.name}</h2>
            {meta ? <span className={styles.meta}>{meta}</span> : null}
          </div>
          <div className={styles.actions}>
            {url ? (
              <>
                <a className={styles.action} href={url} download={item.name} aria-label="Скачать">
                  <DownloadIcon />
                  <span className={styles.actionText}>Скачать</span>
                </a>
                <a
                  className={styles.action}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Открыть в новой вкладке"
                >
                  <ExternalIcon />
                  <span className={styles.actionText}>Открыть в новой вкладке</span>
                </a>
              </>
            ) : null}
            <button
              ref={closeRef}
              type="button"
              className={`${styles.action} ${styles.close}`}
              onClick={closeFilePreview}
              aria-label="Закрыть"
            >
              <CloseIcon />
            </button>
          </div>
        </header>

        <div className={styles.stage}>
          <AnimatePresence mode="wait" initial={false}>
            <m.div
              key={item.id}
              className={styles.slide}
              initial={reduce ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? undefined : { opacity: 0 }}
              transition={reduce ? { duration: 0 } : { duration: 0.22, ease: EASE }}
            >
              <PreviewBody
                item={item}
                kind={kind}
                resolved={resolved}
                phone={phone}
                onError={(message) => fail(item, message)}
              />
            </m.div>
          </AnimatePresence>
          {multiple ? (
            <>
              <button type="button" className={`${styles.nav} ${styles.prev}`} onClick={() => go(-1)} aria-label="Предыдущий файл">
                <ChevronIcon dir="left" />
              </button>
              <button type="button" className={`${styles.nav} ${styles.next}`} onClick={() => go(1)} aria-label="Следующий файл">
                <ChevronIcon dir="right" />
              </button>
            </>
          ) : null}
        </div>
      </m.div>
    </m.div>
  );
}

function PreviewSkeleton({ kind }: { kind: FileKind }) {
  return (
    <div className={styles.skeleton} role="status" aria-label="Загружаем файл" data-kind={kind}>
      <span className={styles.skelPage}>
        <span />
        <span />
        <span />
        <span />
      </span>
    </div>
  );
}

function PreviewBody({
  item,
  kind,
  resolved,
  phone,
  onError,
}: {
  item: PreviewItem;
  kind: FileKind;
  resolved: Resolved;
  phone: boolean;
  onError: (message: string) => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const framed = resolved.status === 'ready' && !!resolved.url && kind === 'text';
  useEffect(() => {
    // iframe не везде шлёт load — не держим скелетон вечно.
    if (!framed || loaded) return;
    const t = window.setTimeout(() => setLoaded(true), 3500);
    return () => window.clearTimeout(t);
  }, [framed, loaded]);

  if (resolved.status === 'loading') return <PreviewSkeleton kind={kind} />;
  if (resolved.status === 'error')
    return <FileCard item={item} kind={kind} url={resolved.url} error={resolved.message} />;
  if (resolved.node) return <div className={styles.custom}>{resolved.node}</div>;
  if ((kind === 'docx' || kind === 'doc') && resolved.url)
    return <WordBody item={item} kind={kind} url={resolved.url} size={resolved.size} pdfCopyUrl={resolved.pdfCopyUrl} phone={phone} />;
  const url = resolved.url;
  if (!url || !isInlinePreviewable(kind)) return <FileCard item={item} kind={kind} url={url} size={resolved.size} />;

  if (kind === 'image') return <ZoomableImage src={url} alt={item.name} onError={() => onError('Не удалось показать изображение')} />;
  if (kind === 'video')
    return (
      <VideoPlayer
        item={item}
        src={resolved.playbackUrl || url}
        hasStreamCopy={!!resolved.playbackUrl}
        poster={resolved.poster || undefined}
        onError={onError}
      />
    );
  if (kind === 'audio')
    return (
      <div className={styles.audioCard}>
        <FileGlyph kind={kind} />
        <strong className={styles.cardName}>{item.name}</strong>
        <audio
          className={styles.audio}
          src={url}
          controls
          preload="metadata"
          aria-label={item.name}
          onError={() => onError('Аудио не воспроизводится в браузере')}
        />
      </div>
    );
  if (kind === 'pdf')
    return (
      <ViewerBoundary fallback={<FileCard item={item} kind={kind} url={url} error="Просмотр PDF не загрузился без сети" />}>
        <Suspense fallback={<PreviewSkeleton kind="pdf" />}>
          <PdfView name={item.name} url={url} onFail={onError} />
        </Suspense>
      </ViewerBoundary>
    );
  // Текст — в песочнице без скриптов.
  return (
    <div className={styles.frameWrap}>
      {!loaded ? <PreviewSkeleton kind={kind} /> : null}
      <iframe
        className={styles.frame}
        data-loaded={loaded ? 'true' : 'false'}
        title={item.name}
        src={url}
        sandbox=""
        onLoad={() => setLoaded(true)}
      />
    </div>
  );
}

/**
 * Видео играет прямо по подписанной ссылке: браузер сам запрашивает куски (Range, 206)
 * и начинает показ, как только есть первые секунды. Ничего не скачиваем целиком.
 * Если ссылка истекла посреди просмотра — берём новую и продолжаем с того же места.
 */
function VideoPlayer({
  item,
  src,
  hasStreamCopy,
  poster,
  onError,
}: {
  item: PreviewItem;
  src: string;
  hasStreamCopy: boolean;
  poster?: string;
  onError: (message: string) => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [current, setCurrent] = useState(src);
  const [noPicture, setNoPicture] = useState(false);
  const resume = useRef<{ time: number; play: boolean } | null>(null);
  const retries = useRef(0);

  useEffect(() => setCurrent(src), [src]);

  async function recover() {
    const video = ref.current;
    if (!video || !item.load || retries.current >= 2) {
      onError('Видео не воспроизводится в браузере');
      return;
    }
    retries.current += 1;
    resume.current = { time: video.currentTime || 0, play: !video.paused };
    try {
      const next = await item.load();
      const nextUrl = 'url' in next ? next.playbackUrl || next.url : undefined;
      if (!nextUrl) throw new Error('no url');
      setCurrent(nextUrl);
    } catch {
      onError('Не удалось продолжить видео. Проверьте интернет');
    }
  }

  return (
    <div className={styles.mediaWrap}>
      <video
        ref={ref}
        className={styles.video}
        src={current}
        poster={poster}
        controls
        playsInline
        preload="metadata"
        aria-label={item.name}
        data-stream-copy={hasStreamCopy ? 'true' : 'false'}
        onLoadedMetadata={(event) => {
          const video = event.currentTarget;
          // Звук есть, а картинки нет: браузер не умеет кодек оригинала (H.265/HEVC).
          setNoPicture(video.videoWidth === 0 && video.videoHeight === 0);
          const at = resume.current;
          if (at) {
            resume.current = null;
            if (at.time > 0) video.currentTime = at.time;
            if (at.play) void video.play().catch(() => {});
          }
        }}
        onError={() => {
          void recover();
        }}
      />
      {noPicture && !hasStreamCopy ? (
        <p className={styles.videoNote} role="note">
          Этот браузер не показывает изображение видео: оно записано в формате H.265 (HEVC). Откройте его на iPhone
          или Mac либо скачайте файл.
        </p>
      ) : null}
    </div>
  );
}

/** Word: .docx рисуем в браузере; .doc — PDF-копия, если есть, иначе карточка «Скачать». */
function WordBody({
  item,
  kind,
  url,
  size,
  pdfCopyUrl,
  phone,
}: {
  item: PreviewItem;
  kind: FileKind;
  url: string;
  size?: number | null;
  pdfCopyUrl?: string;
  phone: boolean;
}) {
  const [renderError, setRenderError] = useState<string | null>(null);
  const plan = wordPreviewPlan(kind, { hasPdfCopy: !!pdfCopyUrl, size: size ?? item.size });
  if (plan === 'render' && !renderError)
    return (
      <ViewerBoundary fallback={<FileCard item={item} kind={kind} url={url} size={size} error="Просмотр Word не загрузился без сети" />}>
        <Suspense fallback={<PreviewSkeleton kind={kind} />}>
          <WordView name={item.name} kind={kind} url={url} size={size ?? item.size} phone={phone} onFail={setRenderError} />
        </Suspense>
      </ViewerBoundary>
    );
  if (pdfCopyUrl) return <PdfCopyFrame name={item.name} url={pdfCopyUrl} />;
  if (renderError) return <FileCard item={item} kind={kind} url={url} size={size} error={renderError} />;
  return (
    <FileCard
      item={item}
      kind={kind}
      url={url}
      size={size}
      note={
        kind === 'doc'
          ? 'Старый формат Word (.doc) браузер не показывает. Скачайте файл и откройте его в Word или в приложении «Документы».'
          : 'Документ слишком большой для просмотра в браузере. Скачайте его и откройте в Word.'
      }
    />
  );
}

/** PDF-копия документа (pdf.js). Кнопка «Скачать» в шапке отдаёт оригинал. */
function PdfCopyFrame({ name, url }: { name: string; url: string }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <div className={styles.copyWrap} data-pdf-copy="true">
      <p className={styles.copyNote} role={error ? 'alert' : undefined}>
        {error ? `${error}. «Скачать» сохранит оригинал.` : 'PDF-копия документа для просмотра. «Скачать» сохранит оригинал.'}
      </p>
      {error ? null : (
        <Suspense fallback={<PreviewSkeleton kind="pdf" />}>
          <PdfView name={`PDF-копия: ${name}`} url={url} onFail={setError} />
        </Suspense>
      )}
    </div>
  );
}

function FileCard({
  item,
  kind,
  url,
  size,
  error,
  note,
}: {
  item: PreviewItem;
  kind: FileKind;
  url?: string;
  size?: number | null;
  error?: string;
  note?: string;
}) {
  const info = [fileKindLabel(kind, item.name), formatFileSize(size ?? item.size)].filter(Boolean).join(' · ');
  return (
    <div className={styles.card} role={error ? 'alert' : undefined}>
      <FileGlyph kind={kind} />
      <strong className={styles.cardName}>{item.name}</strong>
      {info ? <span className={styles.meta}>{info}</span> : null}
      <p className={styles.cardNote}>
        {error
          ? `${error}. ${url ? 'Файл можно скачать.' : ''}`
          : note || 'Этот формат нельзя показать в браузере. Скачайте файл и откройте его в программе.'}
      </p>
      {url ? (
        <a className={styles.primary} href={url} download={item.name}>
          <DownloadIcon />
          Скачать
        </a>
      ) : null}
    </div>
  );
}

/** Картинка с масштабом колесом, двойным кликом, щипком и перетаскиванием. */
function ZoomableImage({ src, alt, onError }: { src: string; alt: string; onError: () => void }) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [ready, setReady] = useState(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);
  const last = useRef<{ x: number; y: number } | null>(null);

  const apply = (next: number) => {
    const z = clampZoom(next);
    setZoom(z);
    if (z === 1) setPan({ x: 0, y: 0 });
  };

  function onWheel(event: ReactWheelEvent) {
    if (!event.ctrlKey && Math.abs(event.deltaY) < 1) return;
    apply(zoom * (event.deltaY < 0 ? 1.15 : 1 / 1.15));
  }
  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    last.current = { x: event.clientX, y: event.clientY };
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a!.x - b!.x, a!.y - b!.y), zoom };
    }
  }
  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      apply(pinch.current.zoom * (dist / Math.max(1, pinch.current.dist)));
      return;
    }
    if (zoom > 1 && last.current) {
      const dx = event.clientX - last.current.x;
      const dy = event.clientY - last.current.y;
      setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
    }
    last.current = { x: event.clientX, y: event.clientY };
  }
  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    last.current = null;
  }

  return (
    <div className={styles.imageStage}>
      {!ready ? <PreviewSkeleton kind="image" /> : null}
      <div
        className={styles.imageViewport}
        data-zoomed={zoom > 1 ? 'true' : 'false'}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={() => apply(zoom > 1 ? 1 : 2.5)}
      >
        <img
          className={styles.image}
          src={src}
          alt={alt}
          draggable={false}
          data-ready={ready ? 'true' : 'false'}
          onLoad={() => setReady(true)}
          onError={onError}
          style={{ transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})` }}
        />
      </div>
      <div className={styles.zoomBar} role="group" aria-label="Масштаб">
        <button type="button" onClick={() => apply(zoom / 1.4)} disabled={zoom <= 1} aria-label="Уменьшить">
          −
        </button>
        <button type="button" onClick={() => apply(1)} aria-label="Сбросить масштаб" className={styles.zoomValue}>
          {Math.round(zoom * 100)}%
        </button>
        <button type="button" onClick={() => apply(zoom * 1.4)} disabled={zoom >= ZOOM_MAX} aria-label="Увеличить">
          +
        </button>
      </div>
    </div>
  );
}

function FileGlyph({ kind }: { kind: FileKind }) {
  const label = kind === 'docx' || kind === 'doc' ? 'W' : kind === 'pdf' ? 'PDF' : kind === 'audio' ? '♪' : kind === 'video' ? '▶' : kind === 'image' ? 'IMG' : 'DOC';
  return (
    <span className={styles.glyph} data-kind={kind} aria-hidden="true">
      <svg viewBox="0 0 40 48">
        <path d="M6 2h20l12 12v30a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z" fill="currentColor" opacity=".16" />
        <path d="M26 2l12 12H28a2 2 0 0 1-2-2V2Z" fill="currentColor" opacity=".45" />
      </svg>
      <span>{label}</span>
    </span>
  );
}

function DownloadIcon() {
  return <DownloadGlyph className={styles.icon} />;
}
function ExternalIcon() {
  return <ExternalGlyph className={styles.icon} />;
}
function CloseIcon() {
  return <CloseGlyph className={styles.icon} />;
}
function ChevronIcon({ dir }: { dir: 'left' | 'right' }) {
  return dir === 'left' ? <ChevronLeftIcon className={styles.icon} /> : <ChevronRightIcon className={styles.icon} />;
}
