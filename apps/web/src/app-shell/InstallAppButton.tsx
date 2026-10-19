import { ModalSurface } from '../partner/motionBits';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import styles from './InstallAppButton.module.css';
import { CheckCircleIcon, CloseIcon, DownloadIcon, MoreIcon, PlusSquareIcon, ShareIcon } from '../icons';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

type BrowserKind = 'ios-safari' | 'ios-other' | 'firefox' | 'yandex' | 'opera' | 'edge' | 'chrome' | 'other';

const HINT_KEY = 'mf_install_hint_dismissed_v1';

type UserAgentDataLite = {
  mobile?: boolean;
  platform?: string;
};

/** Кнопка и подсказка установки: только Android и iOS/iPadOS. */
function isMobileInstallTarget(): boolean {
  if (typeof navigator === 'undefined') return false;

  const uaData = (navigator as Navigator & { userAgentData?: UserAgentDataLite }).userAgentData;
  if (uaData && (typeof uaData.mobile === 'boolean' || typeof uaData.platform === 'string')) {
    const platform = (uaData.platform ?? '').toLowerCase();
    if (uaData.mobile === true) return true;
    if (platform === 'android' || platform === 'ios') return true;
    // iPadOS 13+ в Client Hints тоже может назваться macOS.
    if (platform === 'macos' && navigator.maxTouchPoints > 1) return true;
    return false;
  }

  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return true;
  if (/iphone|ipad|ipod/i.test(ua)) return true;
  // iPadOS 13+ сообщает Macintosh; мультитач отличает его от Mac.
  if (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1) return true;
  return false;
}

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  );
}

function detectBrowser(): BrowserKind {
  const ua = navigator.userAgent;
  if (isIos()) {
    const safari = /safari/i.test(ua) && !/crios|fxios|edgios|opios|yabrowser|opt/i.test(ua);
    return safari ? 'ios-safari' : 'ios-other';
  }
  if (/firefox|fxios/i.test(ua)) return 'firefox';
  if (/YaBrowser/i.test(ua)) return 'yandex';
  if (/OPR\/|Opera/i.test(ua)) return 'opera';
  if (/Edg\//i.test(ua)) return 'edge';
  if (/Chrome|Chromium/i.test(ua)) return 'chrome';
  return 'other';
}

function hintDismissed(): boolean {
  try {
    return localStorage.getItem(HINT_KEY) === '1';
  } catch {
    return false;
  }
}

function IconShare() {
  return <ShareIcon className={styles.icon} />;
}

function IconPlus() {
  return <PlusSquareIcon className={styles.icon} />;
}

function IconMenu() {
  return <MoreIcon className={styles.icon} />;
}

function IconCheck() {
  return <CheckCircleIcon className={styles.icon} />;
}

type Step = { icon: 'share' | 'plus' | 'menu' | 'check'; text: string };

function stepsFor(kind: BrowserKind): { title: string; steps: Step[] } {
  if (kind === 'ios-safari') {
    return {
      title: 'iPhone · Safari',
      steps: [
        { icon: 'share', text: 'Нажмите «Поделиться» внизу Safari.' },
        { icon: 'plus', text: 'Пролистайте список и выберите «На экран Домой».' },
        { icon: 'check', text: 'Нажмите «Добавить». Иконка StP появится на экране.' },
      ],
    };
  }
  if (kind === 'ios-other') {
    return {
      title: 'iPhone',
      steps: [
        { icon: 'share', text: 'Откройте эту страницу в Safari: в Chrome, Firefox или Яндексе нажмите «Поделиться» → Safari.' },
        { icon: 'plus', text: 'В Safari нажмите «Поделиться», затем «На экран Домой».' },
        { icon: 'check', text: 'Нажмите «Добавить».' },
      ],
    };
  }
  if (kind === 'firefox') {
    return {
      title: 'Firefox',
      steps: [
        { icon: 'menu', text: 'Откройте меню браузера (три полоски).' },
        { icon: 'plus', text: 'На телефоне выберите «Установить». На компьютере Firefox не ставит приложение как Chrome.' },
        { icon: 'check', text: 'Если пункта нет, добавьте закладку на панель или откройте кабинет в Chrome, Яндекс Браузере или Edge и нажмите эту кнопку ещё раз.' },
      ],
    };
  }
  if (kind === 'yandex') {
    return {
      title: 'Яндекс Браузер',
      steps: [
        { icon: 'menu', text: 'Откройте меню (три полоски справа).' },
        { icon: 'plus', text: 'Выберите «Установить приложение» или «Добавить на главный экран».' },
        { icon: 'check', text: 'Подтвердите установку. Если в адресе есть значок монитора — нажмите его.' },
      ],
    };
  }
  if (kind === 'opera') {
    return {
      title: 'Opera',
      steps: [
        { icon: 'menu', text: 'Откройте меню Opera.' },
        { icon: 'plus', text: 'Выберите «На главный экран» или «Установить приложение».' },
        { icon: 'check', text: 'Подтвердите. Кабинет откроется без адресной строки.' },
      ],
    };
  }
  if (kind === 'edge') {
    return {
      title: 'Edge',
      steps: [
        { icon: 'menu', text: 'Откройте меню «…» справа вверху.' },
        { icon: 'plus', text: 'Приложения → «Установить этот сайт как приложение».' },
        { icon: 'check', text: 'Подтвердите установку.' },
      ],
    };
  }
  return {
    title: kind === 'chrome' ? 'Chrome' : 'Браузер',
    steps: [
      { icon: 'menu', text: 'Откройте меню браузера (три точки справа вверху).' },
      { icon: 'plus', text: 'Выберите «Установить приложение» или значок установки в адресной строке.' },
      { icon: 'check', text: 'Подтвердите. Ярлык появится на рабочем столе или на экране телефона.' },
    ],
  };
}

function StepIcon({ name }: { name: Step['icon'] }) {
  if (name === 'share') return <IconShare />;
  if (name === 'plus') return <IconPlus />;
  if (name === 'menu') return <IconMenu />;
  return <IconCheck />;
}

type InstallApi = {
  hidden: boolean;
  install: () => Promise<void>;
  register: () => () => void;
};

const InstallContext = createContext<InstallApi | null>(null);

function useInstall(): InstallApi {
  const ctx = useContext(InstallContext);
  if (!ctx) throw new Error('InstallAppButton вне InstallPromptHost');
  return ctx;
}

function IconInstall() {
  return <DownloadIcon className={styles.btnIcon} />;
}

function CompactButton() {
  const { install } = useInstall();
  return (
    <button type="button" className={styles.compact} onClick={() => void install()} aria-label="Установить на устройство">
      <IconInstall />
      <span className={styles.label}>Установить</span>
    </button>
  );
}

export function InstallAppButton() {
  const { hidden, register } = useInstall();
  useLayoutEffect(() => {
    if (hidden) return;
    return register();
  }, [hidden, register]);
  if (hidden) return null;
  return <CompactButton />;
}

export function InstallPromptHost({
  children,
  enabled = true,
}: {
  children: ReactNode;
  enabled?: boolean;
}) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [standalone, setStandalone] = useState(isStandalone);
  const [open, setOpen] = useState(false);
  const [places, setPlaces] = useState(0);
  const [showHint, setShowHint] = useState(() => !hintDismissed());
  const titleId = useId();

  useEffect(() => {
    document.documentElement.style.setProperty('--mf-install-h', '0px');
    return () => document.documentElement.style.setProperty('--mf-install-h', '0px');
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(display-mode: standalone)');
    const sync = () => setStandalone(isStandalone());
    sync();
    mq.addEventListener('change', sync);
    const onBip = (event: Event) => {
      if (!isMobileInstallTarget()) return;
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onBip);
    return () => {
      mq.removeEventListener('change', sync);
      window.removeEventListener('beforeinstallprompt', onBip);
    };
  }, []);

  const register = useCallback(() => {
    setPlaces((n) => n + 1);
    return () => setPlaces((n) => n - 1);
  }, []);

  const install = useCallback(async () => {
    if (deferred) {
      await deferred.prompt();
      setDeferred(null);
      setOpen(false);
      return;
    }
    setOpen(true);
  }, [deferred]);

  const hidden = standalone || !enabled || !isMobileInstallTarget();
  const value = useMemo(
    () => ({ hidden, install, register }),
    [hidden, install, register],
  );

  function dismissHint() {
    setShowHint(false);
    try {
      localStorage.setItem(HINT_KEY, '1');
    } catch {
      /* сессия всё равно закроет карточку */
    }
  }

  const guide = stepsFor(detectBrowser());

  return (
    <InstallContext.Provider value={value}>
      {!hidden && places === 0 ? (
        <div className={styles.fallback}>
          <CompactButton />
        </div>
      ) : null}
      {children}
      {!hidden && showHint ? (
        <aside className={styles.hint} role="note">
          <p>Установка — кнопка «Установить» в шапке справа вверху.</p>
          <button type="button" className={styles.hintClose} onClick={dismissHint} aria-label="Закрыть подсказку">
            <CloseIcon size="1em" />
          </button>
        </aside>
      ) : null}
      {!hidden && open ? createPortal(
        <div className={styles.backdrop} role="presentation" onClick={() => setOpen(false)}>
          <ModalSurface
            className={styles.sheet}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.sheetHead}>
              <h2 id={titleId}>Установить на устройство</h2>
              <button type="button" className={styles.close} onClick={() => setOpen(false)}>
                Закрыть
              </button>
            </div>
            <p className={styles.lead}>{guide.title}. Три шага:</p>
            <ol className={styles.steps}>
              {guide.steps.map((step) => (
                <li key={step.text}>
                  <StepIcon name={step.icon} />
                  <span>{step.text}</span>
                </li>
              ))}
            </ol>
          </ModalSurface>
        </div>,
        document.body,
      ) : null}
    </InstallContext.Provider>
  );
}
