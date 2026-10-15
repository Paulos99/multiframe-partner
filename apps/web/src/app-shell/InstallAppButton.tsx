import { useEffect, useState } from 'react';
import styles from './InstallAppButton.module.css';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  );
}

export function InstallAppButton() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;
    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onBip);
    return () => window.removeEventListener('beforeinstallprompt', onBip);
  }, []);

  if (isStandalone()) return null;

  if (deferred) {
    return (
      <button
        type="button"
        className={styles.btn}
        onClick={async () => {
          await deferred.prompt();
          setDeferred(null);
        }}
      >
        Установить
      </button>
    );
  }

  if (isIos()) {
    return (
      <div className={styles.iosWrap}>
        <button
          type="button"
          className={styles.btn}
          onClick={() => setShowIosHint((v) => !v)}
          aria-expanded={showIosHint}
        >
          На экран «Домой»
        </button>
        {showIosHint ? (
          <p className={styles.hint} role="status">
            Поделиться → На экран «Домой»
          </p>
        ) : null}
      </div>
    );
  }

  return null;
}
