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

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

type BrowserKind = 'ios-safari' | 'ios-other' | 'firefox' | 'yandex' | 'opera' | 'edge' | 'chrome' | 'other';

const HINT_KEY = 'mf_install_hint_dismissed_v1';

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
  return (
    <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
        d="M8 11.5V18a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-6.5"
      />
      <path fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" d="M12 14V4" />
      <path fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" d="M8.5 7.5 12 4l3.5 3.5" />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden>
      <rect x="4" y="4" width="16" height="16" rx="4" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" d="M12 8v8M8 12h8" />
    </svg>
  );
}

function IconMenu() {
  return (
    <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden>
      <circle cx="6" cy="12" r="1.4" fill="currentColor" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" />
      <circle cx="18" cy="12" r="1.4" fill="currentColor" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" d="M8.5 12.2 11 14.7 15.8 9.5" />
    </svg>
  );
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
  return (
    <svg className={styles.btnIcon} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" d="M12 3.5v10" />
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M7.5 10.5 12 15l4.5-4.5"
      />
      <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" d="M5 19.5h14" />
    </svg>
  );
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

  const hidden = standalone || !enabled;
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
          <p>Установка — значок в шапке, рядом с «Выйти».</p>
          <button type="button" className={styles.hintClose} onClick={dismissHint} aria-label="Закрыть подсказку">
            ✕
          </button>
        </aside>
      ) : null}
      {!hidden && open ? createPortal(
        <div className={styles.backdrop} role="presentation" onClick={() => setOpen(false)}>
          <div
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
          </div>
        </div>,
        document.body,
      ) : null}
    </InstallContext.Provider>
  );
}
