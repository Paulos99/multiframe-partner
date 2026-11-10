import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { SessionUser } from '../../../../packages/shared/partner';
import { AnimatePresence, ModalSurface } from './motionBits';
import { roleVideoFor, roleVideoSrc } from './roleVideos';
import styles from './WelcomeVideo.module.css';

/** Кому ролик: «как здесь работать …». */
const FOR_WHOM: Record<string, string> = {
  owner: 'владельцу компании',
  sales: 'менеджеру по продажам',
  measurer: 'замерщику',
  crew: 'монтажнику',
};

/** Минуты для подписи «Видео на …»: «2:36» → «2,5 минуты»; короче полутора минут — «пару минут». */
export function welcomeVideoLength(duration: string): string {
  const [m, s] = duration.split(':').map((x) => Number.parseInt(x, 10));
  const total = (m || 0) * 60 + (s || 0);
  if (!(total > 0)) return 'пару минут';
  const halves = Math.max(1, Math.round(total / 30));
  if (halves < 3) return 'пару минут';
  const value = halves / 2;
  const text = Number.isInteger(value) ? String(value) : String(value).replace('.', ',');
  const word = Number.isInteger(value) && value >= 5 ? 'минут' : 'минуты';
  return `${text} ${word}`;
}

/** Показывать ли окно: роль с видео и сервер ещё не получил отметку. */
export function shouldShowWelcomeVideo(user: Pick<SessionUser, 'role' | 'welcomeVideoPending'> | null | undefined): boolean {
  return Boolean(user?.welcomeVideoPending && roleVideoFor(user.role) && FOR_WHOM[user.role]);
}

/**
 * При первом входе в кабинет — окно с обучающим видео роли. Видео стартует само: со звуком, а если браузер
 * не разрешает — без звука, с заметной кнопкой «Включить звук». Закрыть: крестик, «Закрыть», Esc, клик по фону.
 * Отметка «видел» уходит на сервер сразу при показе (и ещё раз при закрытии), поэтому на другом устройстве
 * окно не повторится. Пересмотреть видео можно в «Обучении».
 */
export function WelcomeVideo({ user, onSeen }: { user: SessionUser | null; onSeen: () => Promise<void> | void }) {
  const [openFor, setOpenFor] = useState<string | null>(null);
  const shownFor = useRef<string | null>(null);
  const role = user?.role ?? '';
  const video = roleVideoFor(role);

  useEffect(() => {
    if (!user || !shouldShowWelcomeVideo(user) || shownFor.current === user.id) return;
    shownFor.current = user.id;
    setOpenFor(user.id);
    void onSeen();
  }, [user, onSeen]);

  // Вышли или сменили человека — окно закрывается.
  useEffect(() => {
    if (openFor && user?.id !== openFor) setOpenFor(null);
  }, [user, openFor]);

  const close = useCallback(() => {
    setOpenFor(null);
    void onSeen();
  }, [onSeen]);

  const open = Boolean(openFor && video && user?.id === openFor);
  return createPortal(
    <AnimatePresence>
      {open && video ? <WelcomeVideoDialog key="welcome" role={role} onClose={close} /> : null}
    </AnimatePresence>,
    document.body,
  );
}

function WelcomeVideoDialog({ role, onClose }: { role: string; onClose: () => void }) {
  const video = roleVideoFor(role)!;
  const src = roleVideoSrc(video, import.meta.env.BASE_URL || '/');
  const titleId = useId();
  const textId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(false);
  const latest = useRef(onClose);
  latest.current = onClose;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        latest.current();
      }
    };
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.({ preventScroll: true });
    };
  }, []);

  // Сначала со звуком; браузер запретил — без звука, кнопка «Включить звук» на видео.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    let cancelled = false;
    el.muted = false;
    const tryPlay = el.play?.();
    if (tryPlay && typeof tryPlay.catch === 'function') {
      tryPlay.catch(() => {
        if (cancelled) return;
        el.muted = true;
        setMuted(true);
        void el.play?.()?.catch?.(() => {});
      });
    }
    return () => {
      cancelled = true;
    };
  }, []);

  function unmute() {
    const el = videoRef.current;
    if (!el) return;
    el.muted = false;
    if (el.volume === 0) el.volume = 1;
    setMuted(false);
    void el.play?.()?.catch?.(() => {});
  }

  return (
    <div className={styles.backdrop} role="presentation" onClick={onClose} data-testid="welcome-video">
      <ModalSurface
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={textId}
        exit={{ opacity: 0, scale: 0.98 }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.stage}>
          <video
            ref={videoRef}
            className={styles.video}
            src={src.video}
            poster={src.poster}
            controls
            playsInline
            preload="auto"
            controlsList="nodownload"
            onVolumeChange={(event) => setMuted(event.currentTarget.muted || event.currentTarget.volume === 0)}
            data-testid="welcome-video-player"
          />
          {muted ? (
            <button type="button" className={styles.unmute} onClick={unmute} data-testid="welcome-video-unmute">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z" fill="currentColor" />
                <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              Включить звук
            </button>
          ) : null}
          <button ref={closeRef} type="button" className={styles.cross} aria-label="Закрыть видео" onClick={onClose}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className={styles.foot}>
          <div className={styles.text}>
            <h2 id={titleId}>Добро пожаловать в кабинет</h2>
            <p id={textId}>
              Видео на {welcomeVideoLength(video.duration)}: как здесь работать {FOR_WHOM[role]}. Пересмотреть его можно в разделе «Обучение».
            </p>
          </div>
          <button type="button" className={styles.done} onClick={onClose}>
            Закрыть
          </button>
        </div>
      </ModalSurface>
    </div>
  );
}
