import { useEffect } from 'react';
import { useLenis } from 'lenis/react';
import styles from './AppShell.module.css';
import { Header } from './Header';
import { ProgressDots } from './ProgressDots';
import { StickyCta } from './StickyCta';
import { useSession } from '../state/SessionContext';
import { StartScreen } from '../screens/Start/StartScreen';
import { RoomScreen } from '../screens/Room/RoomScreen';
import { ProcessingScreen } from '../screens/Processing/ProcessingScreen';
import { ResultWideScreen } from '../screens/Result/ResultWideScreen';

function useScrollReveal(deps: string) {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      document.querySelectorAll('[data-reveal]').forEach((el) => {
        el.classList.add('is-revealed');
      });
      return;
    }

    const nodes = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'));
    if (!nodes.length) return;

    let cascadeIndex = 0;

    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort(
            (a, b) =>
              a.target.getBoundingClientRect().top - b.target.getBoundingClientRect().top,
          );
        for (const entry of visible) {
          const el = entry.target as HTMLElement;
          io.unobserve(el);
          el.style.setProperty('--reveal-delay', `${Math.min(cascadeIndex, 14) * 90}ms`);
          cascadeIndex += 1;
          // Force reflow so delay applies before the reveal class.
          void el.offsetWidth;
          el.classList.add('is-revealed');
        }
      },
      { threshold: 0.08, rootMargin: '0px 0px -4% 0px' },
    );

    for (const node of nodes) {
      node.classList.remove('is-revealed');
      node.style.removeProperty('--reveal-delay');
      io.observe(node);
    }

    return () => io.disconnect();
  }, [deps]);
}

function useScrollTopOnStep(step: string) {
  const lenis = useLenis();
  useEffect(() => {
    if (lenis) lenis.scrollTo(0, { immediate: true });
    else window.scrollTo(0, 0);
  }, [step, lenis]);
}

export function AppShell() {
  const { session, goNext, goBack, canGoNext } = useSession();
  const { step } = session;
  const isProcessing = step === 'processing';
  const isResult = step === 'result';
  const revealKey = step;
  useScrollReveal(revealKey);
  useScrollTopOnStep(revealKey);
  /** Sticky footer only for wizard steps — Result has its own CTA block. */
  const showNav = step !== 'start' && !isProcessing && !isResult;
  const showProgress = step !== 'start' && !isProcessing;
  const showHeader = !isProcessing;

  let content = null;
  switch (step) {
    case 'start':
      content = <StartScreen />;
      break;
    case 'room':
      content = <RoomScreen />;
      break;
    case 'processing':
      content = <ProcessingScreen />;
      break;
    case 'result':
      content = <ResultWideScreen />;
      break;
  }

  return (
    <div
      className={`${styles.shell} ${showNav ? styles.withFooter : ''} ${isProcessing ? styles.processing : ''} ${isResult ? styles.shellWide : ''}`}
    >
      {showHeader ? <Header /> : null}
      {showProgress ? <ProgressDots /> : null}
      <main
        className={`${styles.main} ${isProcessing ? styles.mainProcessing : ''} ${isResult ? styles.mainWide : ''}`}
      >
        {content}
      </main>
      {showNav ? (
        <StickyCta onBack={goBack} onNext={goNext} nextDisabled={!canGoNext} nextLabel="Далее" />
      ) : null}
    </div>
  );
}
