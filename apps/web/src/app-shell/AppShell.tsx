import { PageTransition, usePageReveal } from '../partner/motionBits';
import { useEffect, useRef, type WheelEvent as ReactWheelEvent } from 'react';
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

function useScrollTopOnStep(step: string, mainRef: { current: HTMLElement | null }) {
  const lenis = useLenis();
  useEffect(() => {
    if (mainRef.current) mainRef.current.scrollTop = 0;
    if (lenis) lenis.scrollTo(0, { immediate: true });
    else window.scrollTo(0, 0);
  }, [step, lenis, mainRef]);
}

export function AppShell() {
  const { session, goNext, goBack, canGoNext } = useSession();
  const { step } = session;
  const isProcessing = step === 'processing';
  const isResult = step === 'result';
  const revealKey = step;
  const mainRef = useRef<HTMLElement>(null);
  usePageReveal(revealKey);
  useScrollTopOnStep(revealKey, mainRef);

  /** Колесо над шапкой и нижней панелью: сама колонка не крутится, крутится main. */
  function onShellWheel(event: ReactWheelEvent<HTMLDivElement>) {
    const main = mainRef.current;
    if (!main || event.deltaY === 0) return;
    const target = event.target;
    if (target instanceof Node && main.contains(target)) return;
    main.scrollTop += event.deltaY;
  }
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
      data-lenis-prevent
      onWheel={onShellWheel}
    >
      {showHeader ? <Header /> : null}
      {showProgress ? <ProgressDots /> : null}
      <main
        ref={mainRef}
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
