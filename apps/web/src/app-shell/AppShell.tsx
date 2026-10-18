import { PageTransition, usePageReveal } from '../partner/motionBits';
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
  usePageReveal(revealKey);
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
        <PageTransition pageKey={step}>{content}</PageTransition>
      </main>
      {showNav ? (
        <StickyCta onBack={goBack} onNext={goNext} nextDisabled={!canGoNext} nextLabel="Далее" />
      ) : null}
    </div>
  );
}
